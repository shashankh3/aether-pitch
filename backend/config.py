"""
AETHER PITCH — Central configuration.

Every Azure service is OPTIONAL. When credentials are absent the pipeline runs
fully offline on deterministic local fallbacks so the studio is judge-ready
out of the box. Copy `.env.example` to `.env` and fill in keys to go cloud.

Stage (a)  Synthetic ingest            — local engine (always local)
Stage (b)  Deterministic math          — local NumPy (always local)
Stage (c)  Azure AI Foundry models     — AZURE_OPENAI_* (fallback: deterministic)
Stage (d)  Broadcast render packets    — local WebSocket (Azure Web PubSub reserved)
Stage (e)  Personalize / translate     — AZURE_TRANSLATOR_* (fallback: static atlas)
"""
import os
from dataclasses import dataclass

try:  # optional .env support
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except ImportError:  # pragma: no cover
    pass


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


@dataclass
class Settings:
    # ---- Runtime ----------------------------------------------------------
    host: str = _env("AETHER_HOST", "0.0.0.0")
    port: int = int(_env("AETHER_PORT", "8000"))
    tick_rate_hz: float = 10.0                      # Stage (a) stream rate
    match_time_scale: float = float(_env("MATCH_TIME_SCALE", "6.0"))
    match_start_minute: float = float(_env("MATCH_START_MINUTE", "62.0"))
    seed: int = int(_env("AETHER_SEED", "42"))

    # ---- Stage (b) math ---------------------------------------------------
    chaos_window_s: float = 60.0                    # rolling window (match seconds)

    # ---- Stage (c) Azure AI Foundry ---------------------------------------
    azure_openai_endpoint: str = _env("AZURE_OPENAI_ENDPOINT")
    azure_openai_key: str = _env("AZURE_OPENAI_API_KEY")
    azure_openai_api_version: str = _env("AZURE_OPENAI_API_VERSION", "2024-06-01")
    triage_deployment: str = _env("AZURE_OPENAI_TRIAGE_DEPLOYMENT", "gpt-4o-mini")
    narrative_deployment: str = _env("AZURE_OPENAI_NARRATIVE_DEPLOYMENT", "gpt-4o")

    # ---- Stage (d) Azure Web PubSub (reserved; local WS is the default) ----
    webpubsub_connection_string: str = _env("AZURE_WEBPUBSUB_CONNECTION_STRING")
    webpubsub_hub: str = _env("AZURE_WEBPUBSUB_HUB", "aether")

    # ---- Stage (e) Azure Translator (optional) -----------------------------
    translator_key: str = _env("AZURE_TRANSLATOR_KEY")
    translator_endpoint: str = _env(
        "AZURE_TRANSLATOR_ENDPOINT", "https://api.cognitive.microsofttranslator.com"
    )
    translator_region: str = _env("AZURE_TRANSLATOR_REGION", "global")

    # ---- Azure AI Content Safety (optional second RAI layer) --------------
    content_safety_endpoint: str = _env("AZURE_CONTENT_SAFETY_ENDPOINT")
    content_safety_key: str = _env("AZURE_CONTENT_SAFETY_KEY")

    # ---- Broadcast pacing ---------------------------------------------------
    min_seconds_between_insights: float = 10.0      # studio co-pilot rate limit

    @property
    def azure_enabled(self) -> bool:
        return bool(self.azure_openai_endpoint and self.azure_openai_key)

    @property
    def translator_enabled(self) -> bool:
        return bool(self.translator_key)

    @property
    def content_safety_enabled(self) -> bool:
        return bool(self.content_safety_endpoint and self.content_safety_key)

    @property
    def webpubsub_enabled(self) -> bool:
        return bool(self.webpubsub_connection_string)


settings = Settings()
