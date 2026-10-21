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

import requests

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
        try:
            response = requests.post(
                url,
                headers={
                    "Ocp-Apim-Subscription-Key": self.key,
                    "Content-Type": "application/json",
                },
                json={
                    "text": text[:4000],
                    "categories": list(CATEGORIES),
                    "includeAnalysis": False,
                    "disableAms": True,
                    "severityThreshold": 2,
                },
                timeout=timeout,
            )
            response.raise_for_status()
            body = response.json()
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
        flagged = [
            {
                "category": item.get("category"),
                "severity": item.get("severity", 0),
            }
            for item in (body.get("categories") or [])
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
                f"Azure AI Content Safety flagged {len(flagged)} categor"
                f"{'y' if len(flagged) == 1 else 'ies'}."
                if flagged
                else "Azure AI Content Safety found no category above the threshold."
            ),
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
