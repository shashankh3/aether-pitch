"""
AETHER PITCH — Stage (d) + (e): Broadcast Render Packets & Dual Personalization
==============================================================================
Stage (d): builds time-coded, machine-readable broadcast overlay packets
           (lower-thirds, highlight players, ghost-pass flags).
Stage (e): forks every insight into `analyst_view` vs `casual_fan_view`,
           applies PlayerLock 360 insight, and localizes the fan story into
           EN / ES / AR / HI (Azure Translator when configured, else the
           deterministic in-repo language atlas).
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

import requests

from config import settings
from stage_c_foundry_agents import pick_archetype

OVERLAY_TYPES = {
    "counter_overload": "CHAOS_OVERLOAD_ALERT",
    "pressing_trap": "PRESSING_TRAP_ALERT",
    "inversion": "TACTICAL_INVERSION_FLAG",
    "difficult_progression": "DIFFICULT_PASS_EXECUTED",
    "threat_surge": "XT_SURGE_ALERT",
    "rhythm_shift": "TACTICAL_PULSE_UPDATE",
}

LOWER_TITLES = {
    "counter_overload": "TACTICAL PULSE: HIGH CHAOS ALERT ({chaos:.2f})",
    "pressing_trap": "TACTICAL PULSE: PRESSING TRAP SPRUNG ({chaos:.2f})",
    "inversion": "TACTICAL PULSE: INVERTED FULLBACK ACTIVE",
    "difficult_progression": "TACTICAL PULSE: HIGH-DIFFICULTY PROGRESSION (PDR {pdr:.0f}%)",
    "threat_surge": "TACTICAL PULSE: XT SURGE +{dxt:.2f}",
    "rhythm_shift": "TACTICAL PULSE: STRUCTURED CONTROL ({chaos:.2f})",
}

# Casual-fan story templates (EN) per archetype
STORIES = {
    "counter_overload": (
        "Lightning counter-attack! {team} stole it in midfield and exploded forward at "
        "{speed:.0f} km/h — the defence was caught square with nowhere to run."),
    "pressing_trap": (
        "{opp} just sprang a perfectly-timed pressing trap — three defenders swarmed the ball "
        "and won it back high up the pitch. The crowd can smell a chance!"),
    "inversion": (
        "Clever switch by {team}: their right-back has moved into midfield as an extra playmaker. "
        "Brave stuff — but that leaves the wing wide open if they lose it!"),
    "difficult_progression": (
        "Absolutely outrageous pass from {player} — through a forest of defenders! "
        "One mistake there and it's a counter-attack the other way."),
    "threat_surge": (
        "{team} are slicing through the pitch — every pass is pulling defenders out of position "
        "and the danger zone is glowing red!"),
    "rhythm_shift": (
        "Calm, controlled possession from {team}. They're making the pitch big, passing the "
        "opponents into submission — no panic, just patience."),
}

# Deterministic language atlas for the fan-story line (fallback when the
# Azure Translator isn't configured). Written per-archetype, no numbers needed.
TRANSLATIONS = {
    "counter_overload": {
        "es": "¡Contraataque relámpago! {team} robó en el mediocampo y arrancó a toda velocidad — la defensa quedó desconectada.",
        "ar": "هجمة مرتدة خاطفة! انتزع {team} الكرة في الوسط وانطلق بسرعة جنونية — والدفاع تُرك في مواجهة الفراغ.",
        "hi": "बिजली जैसा काउंटर-अटैक! {team} ने मिडफ़ील्ड में गेंद छीनी और तेज़ी से दौड़ पड़ा — बचाव पूरी तरह फैल गया।",
    },
    "pressing_trap": {
        "es": "¡Trampa de presión perfecta de {opp}! Tres defensores cercaron el balón y lo recuperaron arriba.",
        "ar": "فخ ضغط مثالي من {opp}! ثلاثة مدافعين حاصروا الكرة واستعادوها في مقدمة الملعب.",
        "hi": "{opp} का शानदार प्रेसिंग ट्रैप! तीन डिफेंडर्स ने गेंद घेरी और ऊपर ही वापस ले ली।",
    },
    "inversion": {
        "es": "Cambio valiente de {team}: el lateral derecho se instala en el mediocampo… ¡pero deja el ala abierta!",
        "ar": "تحويل جريء من {team}: الظهير الأيمن ينتقل إلى الوسط… لكنه يترك الجناح مفتوحًا!",
        "hi": "{team} की स्मार्ट चाल: दायां फुल-बैक मिडफ़ील्ड में उतर गया… लेकिन विंग खुला छूट गया!",
    },
    "difficult_progression": {
        "es": "¡Pase escandaloso de {player} entre un bosque de piernas! Un error ahí y era contragolpe.",
        "ar": "تمريرة خارقة من {player} وسط غابة من المدافعين! أي خطأ هنا كان يعني هجمة مرتدة.",
        "hi": "{player} का कमाल का पास — डिफेंडर्स के बीच से! वहाँ एक गलती और काउंटर बन जाता।",
    },
    "threat_surge": {
        "es": "¡{team} atraviesa el campo! Cada pase descoloca defensas y la zona de peligro arde.",
        "ar": "{team} يشقّ الملعب! كل تمريرة تشتت الدفاع ومنطقة الخطر تتوهج.",
        "hi": "{team} पूरे मैदान को चीर रहा है! हर पास बचाव बिखेर रहा है और ख़तरे का ज़ोन लाल हो रहा है।",
    },
    "rhythm_shift": {
        "es": "Posesión serena de {team}: agrandan la cancha y desgastan al rival con paciencia.",
        "ar": "استحواذ هادئ من {team}: يوسّعون الملعب ويستهلكون الخصم بصبر.",
        "hi": "{team} का शांत कब्ज़ा — मैदान बड़ा करके धैर्य से opponent को थका रहे हैं।",
    },
}

RECAP_INTROS = {
    "es": "Repaso de estudio: los tres momentos que decidieron el partido.",
    "ar": "ملخص الاستوديو: اللحظات الثلاث التي حسمت المباراة.",
    "hi": "स्टूडियो रिकैप: तीन पल जिन्होंने मैच का फ़ैसला किया।",
}


class Personalizer:
    def __init__(self, cfg=settings):
        self.s = cfg

    # ------------------------------------------------------------- Stage (d)+(e)
    def build(self, stage_c: dict, ev: dict, metrics: dict, score: dict) -> dict:
        arch = stage_c.get("archetype") or pick_archetype(ev, metrics)
        chaos = metrics.get("chaos_index", 0.5)
        pdr = ev.get("pdr")
        dxt = ev.get("delta_xt") or 0.0
        team = ev.get("team") or metrics.get("possession") or "NLA"
        opp = "MCS" if team == "NLA" else "NLA"

        # ---- Stage (d): broadcast overlay packet ----
        title = LOWER_TITLES.get(arch, LOWER_TITLES["rhythm_shift"]).format(
            chaos=chaos, pdr=pdr or 50.0, dxt=max(0.0, dxt))
        subtitle_parts = []
        if pdr is not None:
            subtitle_parts.append(f"Pass Difficulty: {pdr:.1f}%")
        if ev.get("delta_xt") is not None:
            subtitle_parts.append(f"ΔxT {dxt:+.2f}")
        subtitle_parts.append(f"Chaos {chaos:.2f}")
        highlight = [p for p in [ev.get("player_id"),
                                 (ev.get("ghost_pass") or {}).get("target_id")] if p]
        if arch == "counter_overload":
            for pid in ("NLA_9", "NLA_11"):
                if pid not in highlight:
                    highlight.append(pid)
        overlay = {
            "timecode": ev.get("clock", "00:00"),
            "overlay_type": OVERLAY_TYPES.get(arch, "TACTICAL_PULSE_UPDATE"),
            "highlight_players": highlight,
            "draw_ghost_pass": bool(ev.get("ghost_pass")),
            "lower_third_title": title,
            "lower_third_subtitle": " • ".join(subtitle_parts),
        }

        # ---- Stage (e): dual-persona fork + localization ----
        ppda = metrics.get("ppda", {})
        def_line = metrics.get("def_lines", {}).get(team, 40.0)
        ghost = ev.get("ghost_pass") or {}
        if ghost:
            tactical_note = (
                f"Optimal alternative was {ghost.get('target_id', 'a free man')} "
                f"(+{ghost.get('delta_xt', 0):.2f} xT, {ghost.get('openness_m', 0):.0f} m of space) "
                f"vs {dxt:+.2f} xT on the actual ball.")
        else:
            tactical_note = ("No higher-value option available — the executed ball was already "
                             "the spatial optimum per the ghost-pass scan.")
        analyst = {
            "metrics_summary": (
                f"PPDA {ppda.get('NLA', 0):.1f}/{ppda.get('MCS', 0):.1f} | "
                f"ΔxT {dxt:+.3f} | Pass Diff {(pdr if pdr is not None else 0):.1f}% | "
                f"Def. Line {def_line:.1f} m | Chaos {chaos:.2f}"),
            "tactical_note": tactical_note,
        }

        story = STORIES.get(arch, STORIES["rhythm_shift"]).format(
            team=team, opp=opp,
            player=ev.get("player_name", "The carrier"),
            speed=ev.get("speed_kmh") or ev.get("ball_speed_kmh") or 30.0)
        excitement = int(min(99, max(42, 50 + chaos * 35 + (pdr or 50) * 0.12)))
        translations = self._translations(arch, story, team, opp, ev.get("player_name") or "the carrier")
        casual = {"story_card": story, "excitement_rating": excitement}

        if ev.get("player_id"):
            lock_insight = (
                f"Locked {ev.get('player_name', ev['player_id'])}: "
                f"{ev.get('speed_kmh') or ev.get('ball_speed_kmh', 0):.1f} km/h at the moment of "
                f"contact — stamina {self._stamina_of(ev, metrics)}%.")
        else:
            lock_insight = "Lock onto any player to attach this insight to their telemetry stream."
        personalization = {
            "analyst_mode": analyst,
            "casual_fan_mode": casual,
            "player_lock_insight": lock_insight,
            "translations": translations,
        }
        return {
            "stage_c_explainability": stage_c.get("stage_c_explainability", {}),
            "stage_d_broadcast_overlay": overlay,
            "stage_e_personalization": personalization,
        }

    def build_recap_packet(self, recap: dict, score: dict, clock: str) -> dict:
        translations = {"en": "Studio recap: the three moments that shaped the match."}
        translations.update(RECAP_INTROS)
        return {
            "title": recap.get("title", "Studio Recap"),
            "model": recap.get("model", "deterministic-fallback-v1"),
            "timecode": clock,
            "score": dict(score),
            "items": recap.get("items", []),
            "translations": translations,
        }

    # --------------------------------------------------------------- helpers
    def _stamina_of(self, ev: dict, metrics: dict) -> float:
        return float(ev.get("stamina", 90.0))

    def _translations(self, arch: str, story_en: str, team: str, opp: str,
                      player: str) -> Dict[str, str]:
        out = {"en": story_en}
        atlas = TRANSLATIONS.get(arch, TRANSLATIONS["rhythm_shift"])
        for lang, tmpl in atlas.items():
            out[lang] = tmpl.format(team=team, opp=opp, player=player)
        if self.s.translator_enabled:
            try:
                azure = self._azure_translate(story_en)
                if azure:
                    out.update(azure)
            except Exception:
                pass  # fall back to the deterministic atlas silently
        return out

    def _azure_translate(self, text: str) -> Optional[Dict[str, str]]:
        url = f"{self.s.translator_endpoint.rstrip('/')}/translate?api-version=3.0&to=es&to=ar&to=hi"
        r = requests.post(
            url,
            headers={
                "Ocp-Apim-Subscription-Key": self.s.translator_key,
                "Ocp-Apim-Subscription-Region": self.s.translator_region,
                "Content-Type": "application/json",
            },
            json=[{"Text": text[:900]}], timeout=4,
        )
        r.raise_for_status()
        data = r.json()[0].get("translations", [])
        return {t["to"]: t["text"] for t in data if t.get("to") in ("es", "ar", "hi")}

    async def build_async(self, stage_c: dict, ev: dict, metrics: dict, score: dict) -> dict:
        return await asyncio.to_thread(self.build, stage_c, ev, metrics, score)
