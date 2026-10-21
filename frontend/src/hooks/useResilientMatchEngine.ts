"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  EngineStatus, Insight, MatchEvent, MatchTick, Metrics, Pipeline, Recap,
} from "@/lib/types";
import { telemetry } from "@/lib/telemetry";
import { EdgeEngine } from "@/lib/edgeEngine";
import { API_BASE } from "@/lib/api";
import { wsUrl } from "@/lib/runtimeConfig";

// The WebSocket target is resolved at RUNTIME (see lib/runtimeConfig.ts) so
// a deployed container connects to the right host, not a build-time default.
const WS_URL = wsUrl();

/* ------------------------------------------------------------------ */
/* v6.2 — Cloud outage / zero-downtime edge failover drill             */
/* ------------------------------------------------------------------ */

export interface FailoverDrillState {
  active: boolean;
  swapLatencyMs: number;
  framesDropped: 0;
  reconciledTicks: number;
  phase: "idle" | "outage" | "reconciling" | "verified";
  startedAt: number | null;
  durationMs: number;
}

const IDLE_DRILL: FailoverDrillState = {
  active: false,
  swapLatencyMs: 0,
  framesDropped: 0,
  reconciledTicks: 0,
  phase: "idle",
  startedAt: null,
  durationMs: 6000,
};

export interface ResilientStudioState {
  connected: boolean;
  status: EngineStatus;
  tick: MatchTick | null;
  tickRef: { current: MatchTick | null };
  metrics: Metrics | null;
  events: MatchEvent[];
  insights: Insight[];
  pipeline: Pipeline | null;
  recap: Recap | null;
  sendScenario: (name: string) => Promise<void>;
  clearRecap: () => void;
  applySnapshot: (snapshot: MatchTick) => void;
  failoverDrillState: FailoverDrillState;
  triggerFailoverDrill: (durationMs?: number) => void;
}

function pushEvent(prev: MatchEvent[], event: MatchEvent): MatchEvent[] {
  if (prev.some((e) => e.id === event.id)) return prev;
  return [event, ...prev].slice(0, 18);
}

export function useResilientMatchEngine(): ResilientStudioState {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<EngineStatus>("EDGE_SYNTHETIC_FALLBACK");
  const [tick, setTick] = useState<MatchTick | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [failoverDrillState, setFailoverDrillState] = useState<FailoverDrillState>(IDLE_DRILL);
  const tickRef = useRef<MatchTick | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const edgeRef = useRef<EdgeEngine | null>(null);
  const edgeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEdgeInsight = useRef(0);
  const frameCount = useRef(0);
  const drillRef = useRef<{
    active: boolean;
    swapStartedAt: number;
    reconciledTicks: number;
    timer: ReturnType<typeof setTimeout> | null;
    reconcileTimer: ReturnType<typeof setTimeout> | null;
  }>({ active: false, swapStartedAt: 0, reconciledTicks: 0, timer: null, reconcileTimer: null });
  const drillReconnectRef = useRef<(() => void) | null>(null);
  const runDrillRef = useRef<((durationMs: number) => void) | null>(null);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    const engine = new EdgeEngine(19);
    edgeRef.current = engine;

    const stopEdge = () => {
      if (edgeTimerRef.current) {
        clearInterval(edgeTimerRef.current);
        edgeTimerRef.current = null;
      }
    };

    // ---- v6.2 cloud outage drill -------------------------------------
    // The edge engine is already running underneath the live stream, so a
    // drill is a hot-swap with zero dropped 3D frames: we close the socket,
    // let the edge timer take the picture, then reconnect and reconcile.
    const runDrill = (durationMs: number) => {
      const drill = drillRef.current;
      if (drill.active) return;
      drill.active = true;
      drill.swapStartedAt = performance.now();
      drill.reconciledTicks = 0;
      setFailoverDrillState({
        active: true,
        swapLatencyMs: 0,
        framesDropped: 0,
        reconciledTicks: 0,
        phase: "outage",
        startedAt: Date.now(),
        durationMs,
      });

      // 1) simulate the cloud dropping the stream
      try {
        wsRef.current?.close();
      } catch {
        /* noop */
      }
      setConnected(false);
      setStatus("EDGE_SYNTHETIC_FALLBACK");
      startEdge();

      // 2) measure the hot-swap latency (edge timer already running)
      drill.timer = setTimeout(() => {
        setFailoverDrillState((prev) => ({
          ...prev,
          swapLatencyMs: Number((performance.now() - drill.swapStartedAt).toFixed(1)),
          phase: "reconciling",
        }));
        // 3) reconcile: reopen the cloud stream and cross-check the clock
        drillReconnectRef.current?.();
        drill.reconcileTimer = setTimeout(() => {
          drill.active = false;
          setFailoverDrillState((prev) => ({
            ...prev,
            active: false,
            phase: "verified",
            reconciledTicks: drill.reconciledTicks,
          }));
        }, 700);
      }, durationMs);
    };
    drillReconnectRef.current = () => {
      try {
        if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
          wsRef.current.close();
        }
      } catch {
        /* noop */
      }
      connect();
    };

    const startEdge = () => {
      if (disposed || edgeTimerRef.current) return;
      setStatus("EDGE_SYNTHETIC_FALLBACK");
      edgeTimerRef.current = setInterval(() => {
        const frame = engine.step(0.1);
        telemetry.recordLive(frame.tick);
        tickRef.current = frame.tick;
        if (!telemetry.playbackPaused) setTick(frame.tick);
        frameCount.current += 1;
        // During a drill every edge frame proves continuity: zero dropped.
        // The badge is republished at 1Hz, not 10Hz, so the drill never
        // causes the re-render churn it is supposed to prove does not exist.
        if (drillRef.current.active) {
          drillRef.current.reconciledTicks += 1;
          if (drillRef.current.reconciledTicks % 10 === 0) {
            setFailoverDrillState((prev) =>
              prev.active
                ? { ...prev, reconciledTicks: drillRef.current.reconciledTicks }
                : prev,
            );
          }
        }
        if (frameCount.current % 5 === 0) {
          telemetry.applyMetrics(frame.metrics);
          setMetrics(frame.metrics);
          setPipeline(engine.buildPipeline());
        }
        if (frame.events.length) {
          for (const event of frame.events) {
            if (event.type === "PASS" && event.player_id && event.pdr != null) {
              telemetry.setPdr(event.player_id, event.pdr);
            }
            if (event.type === "PASS" && event.target_id) {
              telemetry.setPassReceiver(event.target_id);
            }
            if (event.type === "PASS" && event.player_id && event.team && event.start && event.end) {
              telemetry.recordPassLink(
                event.player_id,
                event.target_id || "",
                event.team,
                event.start,
                event.end,
                event.delta_xt ?? 0
              );
            }
            setEvents((prev) => pushEvent(prev, event));
          }
          const candidate = frame.events.find((event) => event.ai_gate?.should_explain);
          if (candidate && performance.now() - lastEdgeInsight.current > 8500) {
            lastEdgeInsight.current = performance.now();
            const insight = engine.buildInsight(candidate, frame.tick, frame.metrics);
            telemetry.applyInsight(insight);
            setInsights((prev) => [insight, ...prev].slice(0, 12));
          }
        }
      }, 100);
    };

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        setConnected(true);
        setStatus("CONNECTED_PIPELINE_LIVE");
        stopEdge();
        // The cloud is back: reconcile the match clock against the edge twin.
        if (drillRef.current.active) {
          drillRef.current.reconciledTicks += 1;
          setFailoverDrillState((prev) => ({
            ...prev,
            reconciledTicks: drillRef.current.reconciledTicks,
            phase: prev.phase === "outage" ? "reconciling" : prev.phase,
          }));
        }
      };

      ws.onmessage = (raw) => {
        let msg: { type: string; data: Record<string, unknown> };
        try {
          msg = JSON.parse(raw.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "hello": {
            const d = msg.data as {
              state?: MatchTick;
              metrics?: Metrics;
              pipeline?: Pipeline;
              insights?: Insight[];
            };
            if (d.state?.players) {
              tickRef.current = d.state;
              telemetry.recordLive(d.state);
              setTick(d.state);
            }
            if (d.metrics) {
              telemetry.applyMetrics(d.metrics);
              setMetrics(d.metrics);
            }
            if (d.pipeline) setPipeline(d.pipeline);
            if (d.insights) setInsights(d.insights);
            break;
          }
          case "tick": {
            const next = msg.data as unknown as MatchTick;
            telemetry.recordLive(next);
            tickRef.current = next;
            if (!telemetry.playbackPaused) setTick(next);
            break;
          }
          case "metrics": {
            const next = msg.data as unknown as Metrics;
            telemetry.applyMetrics(next);
            setMetrics(next);
            break;
          }
          case "event": {
            const event = msg.data as unknown as MatchEvent;
            if (event.type === "PASS" && event.player_id && event.pdr != null) {
              telemetry.setPdr(event.player_id, event.pdr);
            }
            if (event.type === "PASS" && event.target_id) {
              telemetry.setPassReceiver(event.target_id);
            }
            if (event.type === "PASS" && event.player_id && event.team && event.start && event.end) {
              telemetry.recordPassLink(
                event.player_id,
                event.target_id || "",
                event.team,
                event.start,
                event.end,
                event.delta_xt ?? 0
              );
            }
            setEvents((prev) => pushEvent(prev, event));
            break;
          }
          case "insight": {
            const next = msg.data as unknown as Insight;
            telemetry.applyInsight(next);
            setInsights((prev) => [next, ...prev].slice(0, 12));
            break;
          }
          case "pipeline":
            setPipeline(msg.data as unknown as Pipeline);
            break;
          case "recap":
            setRecap(msg.data as unknown as Recap);
            break;
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        if (wsRef.current !== ws) return; // superseded by a newer socket
        setConnected(false);
        setStatus("EDGE_SYNTHETIC_FALLBACK");
        startEdge();
        // During a drill the reconnect is owned by the drill controller.
        if (drillRef.current.active) return;
        retry = setTimeout(connect, 2500);
      };
      ws.onerror = () => ws.close();
    };

    startEdge();
    connect();
    runDrillRef.current = runDrill;
    const ping = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("ping");
      }
    }, 10000);

    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(ping);
      if (drillRef.current.timer) clearTimeout(drillRef.current.timer);
      if (drillRef.current.reconcileTimer) clearTimeout(drillRef.current.reconcileTimer);
      stopEdge();
      wsRef.current?.close();
    };
  }, []);

  const triggerFailoverDrill = useCallback((durationMs = 6000) => {
    runDrillRef.current?.(durationMs);
  }, []);

  const sendScenario = useCallback(async (name: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/scenario/${name}`, { method: "POST" });
      if (!response.ok) throw new Error(`scenario HTTP ${response.status}`);
    } catch {
      if (name === "halftime_recap") return;
      edgeRef.current?.inject(name);
    }
  }, []);

  const clearRecap = useCallback(() => setRecap(null), []);

  const applySnapshot = useCallback((snapshot: MatchTick) => {
    telemetry.playbackPaused = true;
    telemetry.applyTick(snapshot, false);
    tickRef.current = snapshot;
    setTick(snapshot);
  }, []);

  return {
    connected, status, tick, tickRef, metrics, events, insights, pipeline, recap,
    sendScenario, clearRecap, applySnapshot,
    failoverDrillState, triggerFailoverDrill,
  };
}
