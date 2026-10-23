from __future__ import annotations

from agents.counterfactual_arbiter import CounterfactualArbiterMixin
from agents.explain import ExplainMixin
from agents.foundry_core import FoundryRouterBase
from agents.studio import StudioQueryMixin
from agents.war_room import WarRoomMixin


class FoundryRouter(
    ExplainMixin,
    StudioQueryMixin,
    CounterfactualArbiterMixin,
    WarRoomMixin,
    FoundryRouterBase,
):
    pass
