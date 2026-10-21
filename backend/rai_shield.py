"""
AETHER PITCH — Foundry Responsible AI Shield (Stage C safety layer)
=================================================================
Enterprise RAI controls for the Azure AI Foundry router:

  * Prompt Shield — detects prompt-injection / jailbreak / instruction-override
    attempts and off-topic non-football queries BEFORE any model call, and
    returns a safe grounded deflection back to live NLA vs MCS telemetry.
  * Numeric grounding — every number quoted by a model is cross-checked
    against the Stage B event + metric snapshot (delegated to agent_trace).
  * Club neutrality — the generated narrative must stay objective: no
    supporter bias, no shaming, no real-world club/league references.

Every check is deterministic and offline-capable so the shield always runs,
even with no Azure credentials. The shield never blocks the product: it
redirects the question back onto the live synthetic match.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

# --------------------------------------------------------------------------
# Prompt-injection / jailbreak taxonomy
# --------------------------------------------------------------------------
INJECTION_PATTERNS: Tuple[Tuple[str, str], ...] = (
    (r"ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+instructions", "instruction_override"),
    (r"disregard\s+(?:all\s+)?(?:previous|prior|above|earlier|your)\s*\w*", "instruction_override"),
    (r"forget\s+(?:everything|all|your)\s*(?:you|instructions|rules)?", "instruction_override"),
    (r"you\s+are\s+now\s+(?:a|an|the)\b", "role_hijack"),
    (r"act\s+as\s+(?:if\s+you\s+are\s+)?(?:a|an|the)\b", "role_hijack"),
    (r"pretend\s+(?:to\s+be|you\s+are)\b", "role_hijack"),
    (r"jailbreak|developer\s+mode|dan\s+mode|god\s+mode", "jailbreak"),
    (r"(?:reveal|print|show|output|repeat|leak|dump)\s+(?:me\s+)?(?:your\s+)?"
     r"(?:system\s+)?(?:prompt|instructions|rules|guidelines)", "prompt_exfiltration"),
    (r"ignore\s+(?:the\s+)?(?:safety|guardrails?|filters?|rules?)", "guardrail_bypass"),
    (r"bypass\s+(?:the\s+)?(?:safety|guardrails?|filters?|content\s+filter)", "guardrail_bypass"),
    (r"without\s+(?:any\s+)?(?:restrictions?|limits?|filters?|censorship)", "guardrail_bypass"),
    (r"(?:write|compose|generate)\s+(?:me\s+)?(?:a\s+)?(?:rude|vulgar|offensive|"
     r"discriminatory|hate)\b", "harmful_content"),
    (r"\b(?:sql\s+injection|drop\s+table|<script|rm\s+-rf)\b", "malicious_payload"),
    (r"http[s]?://\S+\s*(?:--|\||;|&)\s*(?:curl|wget|bash|sh)\b", "malicious_payload"),
)

# Queries that are simply not about the live football match.
OFF_TOPIC_PATTERNS: Tuple[Tuple[str, str], ...] = (
    (r"\b(?:weather|forecast|temperature)\b", "non_football_topic"),
    (r"\b(?:stock|share price|ticker|nasdaq|bitcoin|crypto|forex)\b", "non_football_topic"),
    (r"\b(?:recipe|cook|cooking|ingredients)\b", "non_football_topic"),
    (r"\b(?:who is the (?:president|ceo)|prime minister|election)\b", "non_football_topic"),
    (r"\b(?:poem|song lyrics|poem about|write a story about)\b", "non_football_topic"),
    (r"\b(?:homework|essay about|translate this sentence)\b", "non_football_topic"),
    (r"\b(?:medical advice|diagnose|symptoms|prescription)\b", "non_football_topic"),
)

# Real-world football entities that would break the synthetic-IP rule.
THIRD_PARTY_ENTITY_PATTERN = (
    r"\b(?:premier league|la liga|serie a|bundesliga|champions league|europa league|"
    r"manchester (?:united|city|united)|liverpool|chelsea|arsenal|real madrid|"
    r"barcelona|atletico madrid|juventus|inter milan|bayern munich|fifa|uefa)\b"
)

# Supporter-biased / non-objective language the club-neutrality check rejects.
SUBJECTIVE_BIAS_PATTERNS: Tuple[Tuple[str, str], ...] = (
    (r"\b(?:terrible|awful|useless|pathetic|disgraceful|embarrassing)\s+(?:team|defence|defense|passer)\b",
     "subjective_language"),
    (r"\b(?:clueless|cocky|arrogant|disrespectful)\b", "subjective_language"),
    (r"\b(?:should be relegated|deserve to lose)\b", "supporter_bias"),
    (r"\b(?:our boys|they are rubbish|we are better than)\b", "supporter_bias"),
    (r"\b(?:best team in the world|worst team in the world)\b", "subjective_language"),
)

_COMPILED_INJECTION = tuple((re.compile(p, re.I), tag) for p, tag in INJECTION_PATTERNS)
_COMPILED_OFF_TOPIC = tuple((re.compile(p, re.I), tag) for p, tag in OFF_TOPIC_PATTERNS)
_COMPILED_BIAS = tuple((re.compile(p, re.I), tag) for p, tag in SUBJECTIVE_BIAS_PATTERNS)
_COMPILED_THIRD_PARTY = re.compile(THIRD_PARTY_ENTITY_PATTERN, re.I)

# Defence-in-depth: the live synthetic domain we can actually answer.
FOOTBALL_DOMAIN_TERMS = (
    "pitch", "pass", "passing", "shot", "shots", "goal", "goals", "defence", "defense",
    "defender", "defenders", "midfield", "midfielder", "attacking", "attack", "winger",
    "fullback", "striker", "keeper", "goalkeeper", "press", "pressing", "counter",
    "counter-attack", "possession", "formation", "tactic", "tactics", "tactical",
    "line", "lines", "shape", "overload", "channel", "space", "gap", "seam", "zone",
    "chaos", "pd r", "pdr", "xt", "x t", "ghost", "counterfactual", "recap", "halftime",
    "substitution", "sprint", "speed", "distance", "player", "players", "team", "match",
    "minute", "clock", "break", "through-ball", "cross", "through ball", "offside",
    "wall", "compactness", "line-breaking", "ball", "carrier", "receiver", "manager",
    "nla", "mcs", "larchmont", "meridian", "aether", "scout", "manager", "arbiter",
)


def _matches(text: str, compiled) -> List[str]:
    hits: List[str] = []
    for pattern, tag in compiled:
        if pattern.search(text):
            if tag not in hits:
                hits.append(tag)
    return hits


def detect_prompt_risk(query: str) -> Dict[str, object]:
    """Classify a raw user query for injection / off-topic risk.

    Returns a dict with `severity` ("clear" | "guarded" | "blocked"), the
    matched `categories`, and a short `reason` for the audit log.
    """
    text = (query or "").strip()
    if not text:
        return {
            "severity": "clear",
            "categories": [],
            "reason": "empty query",
        }

    injection = _matches(text, _COMPILED_INJECTION)
    off_topic = _matches(text, _COMPILED_OFF_TOPIC)
    third_party = bool(_COMPILED_THIRD_PARTY.search(text))

    categories: List[str] = []
    for tag in injection + off_topic:
        if tag not in categories:
            categories.append(tag)
    if third_party and "third_party_entity" not in categories:
        categories.append("third_party_entity")

    if injection:
        severity = "blocked"
        reason = f"prompt-injection signal: {', '.join(injection)}"
    elif off_topic:
        severity = "guarded"
        reason = f"off-topic query: {', '.join(off_topic)}"
    elif third_party:
        severity = "guarded"
        reason = "reference to a non-synthetic real-world competition or club"
    else:
        severity = "clear"
        reason = "within the live NLA vs MCS tactical domain"

    return {
        "severity": severity,
        "categories": categories,
        "reason": reason,
    }


def is_in_domain(query: str) -> bool:
    """True when the query contains at least one football/tactical term."""
    text = (query or "").lower()
    return any(term in text for term in FOOTBALL_DOMAIN_TERMS)


def check_club_neutrality(text: str) -> Dict[str, object]:
    """Verify a generated narrative stays objective (no supporter bias)."""
    hits = _matches(text or "", _COMPILED_BIAS)
    third_party = bool(_COMPILED_THIRD_PARTY.search(text or ""))
    return {
        "club_neutrality_pass": not hits and not third_party,
        "violations": hits + (["third_party_entity"] if third_party else []),
    }


_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")

# Structural constants that are always legitimate to quote.
_BASE_ALLOWED = {
    0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 10.0, 15.0, 16.0, 22.0, 60.0, 68.0,
    80.0, 100.0, 105.0,
}


def _flatten_numbers(value) -> List[float]:
    out: List[float] = []
    if isinstance(value, bool):
        return out
    if isinstance(value, (int, float)):
        try:
            fvalue = float(value)
        except (TypeError, ValueError):
            return out
        if fvalue == fvalue and abs(fvalue) != float("inf"):
            out.append(fvalue)
        return out
    if isinstance(value, dict):
        for item in value.values():
            out.extend(_flatten_numbers(item))
        return out
    if isinstance(value, (list, tuple)):
        for item in value:
            out.extend(_flatten_numbers(item))
    return out


def allowed_numbers(context) -> set:
    """Every number a grounded narrative is allowed to quote."""
    allowed = set(_BASE_ALLOWED)
    allowed.update(_flatten_numbers(context))
    expanded = set(allowed)
    for value in allowed:
        expanded.add(abs(value))
        expanded.add(round(value))
        expanded.add(round(value, 1))
        expanded.add(round(value, 2))
        if 0.0 <= abs(value) <= 1.0:
            expanded.add(round(value * 100.0, 1))
        elif abs(value) >= 1.0:
            expanded.add(round(value / 100.0, 4))
    return expanded


def _number_matches(value: float, allowed: set) -> bool:
    tolerance = 0.61 if abs(value) >= 10 else 0.11
    return any(abs(value - candidate) <= tolerance for candidate in allowed)


def check_numeric_grounding(text: str, context) -> Dict[str, object]:
    """Cross-check every number in a generated narrative against Stage B state.

    `context` is the live spatial + metric payload. Numbers that cannot be
    traced back to that payload are hallucinations and fail the check.
    """
    tokens = _NUMBER_RE.findall(text or "")
    if not tokens:
        return {
            "numeric_grounding_pass": True,
            "checked_numbers": 0,
            "unmatched_numbers": [],
        }
    allowed = allowed_numbers(context)
    unmatched = [tok for tok in tokens if not _number_matches(float(tok), allowed)]
    return {
        "numeric_grounding_pass": not unmatched,
        "checked_numbers": len(tokens),
        "unmatched_numbers": unmatched,
    }


def shield_deflection(query: str, language: str = "en", reason: str = "") -> str:
    """A safe, grounded redirect back to the live synthetic match."""
    messages = {
        "en": ("The 12th Man only analyses the live synthetic NLA vs MCS match. "
               "Ask me about the defensive line, the ghost-pass alternative, "
               "pressing intensity, or the projected 30-second xT gain."),
        "es": ("El 12th Man solo analiza el partido sintético en vivo NLA vs MCS. "
               "Pregúntame por la línea defensiva, la alternativa del pase fantasma, "
               "la intensidad de la presión o la ganancia de xT proyectada a 30 segundos."),
        "ar": ("الرجل الثاني يحلل فقط مباراة NLA ضد MCS الافتراضية المباشرة. "
               "اسألني عن الخط الدفاعي أو بديل التمريرة الشبحية أو شدة الضغط "
               "أو مكسب xT المتوقع خلال 30 ثانية."),
        "hi": ("12वें आदमी केवल लाइव सिंथेटिक NLA बनाम MCS मैच का विश्लेषण करते हैं। "
               "डिफेंसिव लाइन, घोस्ट पास विकल्प, प्रेसिंग तीव्रता या 30 सेकंड का "
               "अनुमानित xT लाभ पूछें।"),
    }
    return messages.get(language, messages["en"])


def build_safety_shield(
    query: str,
    language: str = "en",
    grounding: Optional[dict] = None,
    generated_text: str = "",
    context=None,
) -> Dict[str, object]:
    """Assemble the full `foundry_safety_shield` metadata block.

    `grounding` is the dict returned by `agent_trace.verify_grounding(...)`.
    `generated_text` is the model output that should be checked for bias.
    `context` is the live spatial + metric payload used to cross-check any
    number the model quoted.
    """
    risk = detect_prompt_risk(query)
    protected = risk["severity"] != "clear"

    grounding_status = (grounding or {}).get("status")
    checked_numbers = int((grounding or {}).get("checked_numbers") or 0)
    unmatched_numbers = list((grounding or {}).get("unmatched_numbers") or [])

    if context is not None:
        numeric = check_numeric_grounding(generated_text, context)
        checked_numbers = max(checked_numbers, numeric["checked_numbers"])
        if not numeric["numeric_grounding_pass"]:
            unmatched_numbers = list(dict.fromkeys(
                unmatched_numbers + numeric["unmatched_numbers"]))
            grounding_status = "review"
        numeric_grounding_pass = numeric["numeric_grounding_pass"]
    else:
        numeric_grounding_pass = grounding_status != "review"

    neutrality = check_club_neutrality(generated_text or query)

    reasons: List[str] = []
    if risk["severity"] != "clear":
        reasons.append(str(risk["reason"]))
    if not numeric_grounding_pass:
        reasons.append("numeric grounding review required")
    if not neutrality["club_neutrality_pass"]:
        reasons.append("club neutrality violation: " + ", ".join(neutrality["violations"]))

    return {
        "prompt_shield_status": "PROTECTED" if protected else "CLEAR",
        "severity": risk["severity"],
        "categories": list(risk["categories"]),
        "numeric_grounding_pass": numeric_grounding_pass,
        "club_neutrality_pass": bool(neutrality["club_neutrality_pass"]),
        "grounding_status": grounding_status or "not_evaluated",
        "numbers_checked": checked_numbers,
        "unmatched_numbers": unmatched_numbers,
        "deflection": shield_deflection(query, language) if protected else None,
        "reasons": reasons,
        "policy_version": "aether-prompt-shield-v1",
    }
