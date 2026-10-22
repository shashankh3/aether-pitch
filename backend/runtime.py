from __future__ import annotations

import asyncio
import json
from typing import Dict, Optional, Set

from fastapi import HTTPException, WebSocket

#: Per-client send budget. A slow peer is dropped rather than allowed to
#: stall the 10 Hz match loop.
SEND_TIMEOUT_S = 2.0
#: Bounded per-client queue depth. A client that falls this far behind is
#: dropping frames, never blocking the simulation.
QUEUE_MAX = 8

class _BodyTooLarge(Exception):
    """Raised inside the ASGI receive channel when a body exceeds the cap."""


class BodySizeLimitMiddleware:
    """Cap the request body the studio is willing to read.

    Starlette has no default body limit, so a single large POST could pin the
    backend's memory. The heaviest legitimate payload is a what-if scenario
    with 22 displacements, which is a few kilobytes.

    The declared Content-Length is checked first (the cheap case, and the one
    every normal client sends), then the bytes are counted as they arrive so
    a chunked body with no length header is bounded too.
    """

    def __init__(self, app, limit: int):
        self.app = app
        self.limit = limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        for key, value in scope.get("headers", []):
            if key == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    await self._respond(send, 400, "Invalid Content-Length header.")
                    return
                if declared > self.limit:
                    await self._respond(
                        send, 413, f"Request body exceeds {self.limit} bytes.")
                    return
                break

        seen = 0
        response_started = False

        async def counting_receive():
            nonlocal seen
            message = await receive()
            if message.get("type") == "http.request":
                seen += len(message.get("body", b""))
                if seen > self.limit:
                    # An HTTPException is used so the framework's own error
                    # handling renders the 413 - a bare exception here would
                    # be reported as a 400 body-parse failure.
                    raise HTTPException(
                        413, f"Request body exceeds {self.limit} bytes.")
            return message

        async def guarded_send(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, guarded_send)
        except _BodyTooLarge:
            if not response_started:
                await self._respond(
                    send, 413, f"Request body exceeds {self.limit} bytes.")

    @staticmethod
    async def _respond(send, status: int, detail: str) -> None:
        body = json.dumps({"detail": detail}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode("ascii"))],
        })
        await send({"type": "http.response.body", "body": body})

class Hub:
    """Fan-out broadcaster for every connected studio client.

    Every client gets its own bounded send queue and a writer task. The match
    loop only ever enqueues, so a judge on slow wifi can never stall the
    10 Hz simulation for anybody else: their queue overflows, the oldest
    frame is dropped, and a client that cannot be written to within the
    send budget is removed entirely.
    """

    def __init__(self) -> None:
        self.clients: Set[WebSocket] = set()
        self.queues: Dict[WebSocket, "asyncio.Queue"] = {}
        self.writers: Dict[WebSocket, "asyncio.Task"] = {}
        self._lock: Optional[asyncio.Lock] = None

    @property
    def lock(self) -> asyncio.Lock:
        # Created lazily so the lock always belongs to the running loop
        # (Python 3.9 binds the loop at construction time).
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    async def join(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self.lock:
            self.clients.add(ws)
            self.queues[ws] = asyncio.Queue(maxsize=QUEUE_MAX)
        self.writers[ws] = asyncio.create_task(self._writer(ws))

    async def _writer(self, ws: WebSocket) -> None:
        """Drain one client's queue until it fails, stalls or is closed."""
        queue = self.queues.get(ws)
        if queue is None:
            return
        try:
            while True:
                packet = await queue.get()
                try:
                    await asyncio.wait_for(ws.send_json(packet), timeout=SEND_TIMEOUT_S)
                except Exception:
                    break
        except asyncio.CancelledError:
            raise
        finally:
            await self._remove(ws)

    async def _remove(self, ws: WebSocket) -> None:
        async with self.lock:
            self.clients.discard(ws)
            self.queues.pop(ws, None)

    async def leave(self, ws: WebSocket) -> None:
        await self._remove(ws)
        task = self.writers.pop(ws, None)
        if task is not None and task is not asyncio.current_task():
            task.cancel()

    async def broadcast(self, packet: dict) -> None:
        """Enqueue a packet for every client. Never blocks on the network."""
        async with self.lock:
            targets = list(self.queues.items())
        for ws, queue in targets:
            try:
                queue.put_nowait(packet)
            except asyncio.QueueFull:
                # Slow consumer: drop the oldest frame rather than stall.
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    queue.put_nowait(packet)
                except asyncio.QueueFull:
                    pass
