"""
AETHER PITCH -- Stage (c): Causal Explainability via Multi-Model Routing
=======================================================================

Azure AI Foundry-hosted two-stage router. The implementation lives in the
`agents` package; this module preserves the historical import surface.
"""
from __future__ import annotations

from agents.foundry_core import (
    MAX_RETRY_AFTER_S,
    RETRYABLE_STATUSES,
    FoundryRouterBase,
    _is_retryable_status,
    _retry_after_seconds,
)
from agents.foundry_router import FoundryRouter
from agents.roster import (
    ARCHETYPES,
    COUNTERFACTUAL_ARBITER,
    WAR_ROOM_AGENTS,
    pick_archetype,
)

__all__ = [
    "ARCHETYPES",
    "COUNTERFACTUAL_ARBITER",
    "FoundryRouter",
    "FoundryRouterBase",
    "MAX_RETRY_AFTER_S",
    "RETRYABLE_STATUSES",
    "WAR_ROOM_AGENTS",
    "_is_retryable_status",
    "_retry_after_seconds",
    "pick_archetype",
]
