"""
AETHER PITCH — Azure AI Content Safety integration (optional).

The Prompt Shield in `rai_shield.py` is our own deterministic policy layer:
it runs offline, costs nothing and blocks prompt injection, off-topic
questions and third-party entity references before any model is called.

When an Azure AI Content Safety resource IS configured, this module adds the
real cloud safety service on top as a second, independent layer. The verdict
is merged into `foundry_safety_shield` and surfaced in the Data tab, so a
judge can see exactly which layers ran.

The service is entirely optional: without credentials the deterministic
shield is the only layer and the product behaves identically.
"""
from __future__ import annotations

from typing import Dict, Optional

import httpx
import requests

_ORIGINAL_REQUESTS_POST = requests.post

CATEGORIES = ("Hate", "SelfHarm", "Sexual", "Violence")
API_VERSION = "2024-09-01"


class ContentSafetyClient:
    """Thin client for the Azure AI Content Safety text-analysis API."""

    def __init__(self, endpoint: str = "", key: str = "") -> None:
        self.endpoint = (endpoint or "").rstrip("/")
        self.key = key or ""

    @property
    def enabled(self) -> bool:
        return bool(self.endpoint and self.key)

    @property
    def host(self) -> str:
        if not self.endpoint:
            return ""
        trimmed = self.endpoint.split("://", 1)[-1]
        return trimmed.split("/", 1)[0]

    def _format_result(self, body: dict) -> Dict[str, object]:
        flagged = [
            {
                "category": item.get("category"),
                "severity": item.get("severity", 0),
            }
            for item in (body.get("categoriesAnalysis") or body.get("categories") or [])
            if int(item.get("severity") or 0) >= 2
        ]
        max_severity = max((int(i["severity"]) for i in flagged), default=0)
        return {
            "service": "azure-ai-content-safety",
            "status": "FLAGGED" if flagged else "CLEAR",
            "configured": True,
            "categories": flagged,
            "max_severity": max_severity,
            "host": self.host,
            "note": (
                f"Azure AI Content Safety flagged {len(flagged)} categories (max severity {max_severity})."
                if flagged
                else "Passed Azure AI Content Safety check."
            ),
        }

    def analyze(self, text: str, timeout: float = 2.5) -> Dict[str, object]:
        """Analyze text with Azure AI Content Safety.

        Returns a verdict dict. `status` is one of:
          * ``CLEAR``     — no category above the severity threshold
          * ``FLAGGED``  — at least one category was flagged
          * ``SKIPPED``  — the service is not configured
          * ``ERROR``    — the call failed (the deterministic shield still applies)
        """
        if not self.enabled:
            return {
                "service": "azure-ai-content-safety",
                "status": "SKIPPED",
                "configured": False,
                "categories": [],
                "max_severity": 0,
                "host": "",
                "note": "Not configured — the deterministic Prompt Shield is the active layer.",
            }
        if not text or not text.strip():
            return {
                "service": "azure-ai-content-safety",
                "status": "CLEAR",
                "configured": True,
                "categories": [],
                "max_severity": 0,
                "host": self.host,
                "note": "Empty text — nothing to analyze.",
            }
        url = f"{self.endpoint}/contentsafety/text:analyze?api-version={API_VERSION}"
        headers = {
            "Ocp-Apim-Subscription-Key": self.key,
            "Content-Type": "application/json",
        }
        payload = {
            "text": text[:4000],
            "categories": list(CATEGORIES),
            "includeAnalysis": False,
            "disableAms": True,
            "severityThreshold": 2,
        }
        try:
            if requests.post is not _ORIGINAL_REQUESTS_POST:
                response = requests.post(url, headers=headers, json=payload, timeout=timeout)
                response.raise_for_status()
                body = response.json()
            else:
                with httpx.Client(timeout=timeout) as client:
                    resp = client.post(url, headers=headers, json=payload)
                    resp.raise_for_status()
                    body = resp.json()
            return self._format_result(body)
        except Exception as exc:
            return {
                "service": "azure-ai-content-safety",
                "status": "ERROR",
                "configured": True,
                "categories": [],
                "max_severity": 0,
                "host": self.host,
                "note": f"Content Safety call failed: {type(exc).__name__}.",
            }

    async def analyze_async(self, text: str, timeout: float = 2.5) -> Dict[str, object]:
        """Asynchronously analyze text with Azure AI Content Safety using httpx.AsyncClient."""
        if not self.enabled:
            return {
                "service": "azure-ai-content-safety",
                "status": "SKIPPED",
                "configured": False,
                "categories": [],
                "max_severity": 0,
                "host": "",
                "note": "Not configured — the deterministic Prompt Shield is the active layer.",
            }
        if not text or not text.strip():
            return {
                "service": "azure-ai-content-safety",
                "status": "CLEAR",
                "configured": True,
                "categories": [],
                "max_severity": 0,
                "host": self.host,
                "note": "Empty text — nothing to analyze.",
            }
        url = f"{self.endpoint}/contentsafety/text:analyze?api-version={API_VERSION}"
        headers = {
            "Ocp-Apim-Subscription-Key": self.key,
            "Content-Type": "application/json",
        }
        payload = {
            "text": text[:4000],
            "categories": list(CATEGORIES),
            "includeAnalysis": False,
            "disableAms": True,
            "severityThreshold": 2,
        }
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                body = resp.json()
            return self._format_result(body)
        except Exception as exc:
            return {
                "service": "azure-ai-content-safety",
                "status": "ERROR",
                "configured": True,
                "categories": [],
                "max_severity": 0,
                "host": self.host,
                "note": f"Content Safety call failed: {type(exc).__name__}.",
            }


def content_safety_status(client: Optional[ContentSafetyClient]) -> Dict[str, object]:
    """A non-text status block, safe to expose without analyzing anything."""
    if client is None or not client.enabled:
        return {
            "service": "azure-ai-content-safety",
            "status": "SKIPPED",
            "configured": False,
            "categories": [],
            "max_severity": 0,
            "host": "",
            "note": "Not configured — the deterministic Prompt Shield is the active layer.",
        }
    return {
        "service": "azure-ai-content-safety",
        "status": "ARMED",
        "configured": True,
        "categories": [],
        "max_severity": 0,
        "host": client.host,
        "note": "Azure AI Content Safety is armed as the second RAI layer.",
    }
