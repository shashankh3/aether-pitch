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
import time
from typing import Dict, Optional

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
        "{team} just sprang a perfectly-timed pressing trap — three defenders swarmed the ball "
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
        "es": "¡Trampa de presión perfecta de {team}! Tres defensores cercaron el balón y lo recuperaron arriba.",
        "ar": "فخ ضغط مثالي من {team}! ثلاثة مدافعين حاصروا الكرة واستعادوها في مقدمة الملعب.",
        "hi": "{team} का शानदार प्रेसिंग ट्रैप! तीन डिफेंडर्स ने गेंद घेरी और ऊपर ही वापस ले ली।",
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

PERSONA_MODES = ("ANALYST_HUD", "CASUAL_STORY", "TWINCAST_SPLIT")
METRIC_FOCUS_OPTIONS = (
    "ALL", "SPEED_VELOCITY", "PASS_QUALITY", "EXPECTED_THREAT_XT", "CHAOS_PRESSING",
)
CLUB_BIAS_OPTIONS = ("NEUTRAL", "NLA_LOYALIST", "MCS_LOYALIST")

METRIC_FOCUS_META = {
    "ALL": {
        "label": "Complete Broadcast",
        "tags": ["xt_grid", "ghost_pass", "defensive_lasers", "player_tags"],
    },
    "SPEED_VELOCITY": {
        "label": "Speed & Velocity",
        "tags": ["sprint_kmh", "ball_speed_kmh", "shot_velocity_kmh"],
    },
    "PASS_QUALITY": {
        "label": "Pass Quality (PDR)",
        "tags": ["pdr", "delta_xt", "openness_m", "pass_network"],
    },
    "EXPECTED_THREAT_XT": {
        "label": "Expected Threat (xT)",
        "tags": ["xt_grid", "delta_xt", "ghost_pass", "pitch_control"],
    },
    "CHAOS_PRESSING": {
        "label": "Chaos & Pressing",
        "tags": ["chaos_index", "ppda", "defensive_lasers", "pitch_control"],
    },
}

METRIC_FOCUS_TEXT = {
    "SPEED_VELOCITY": {
        "en": "METRIC LOCK — SPEED & VELOCITY: only sprint, ball-speed and shot-velocity tags are live.",
        "es": "BLOQUEO DE MÉTRICA — VELOCIDAD: solo velocidad de sprint, balón y remate.",
        "ar": "قفل المقياس — السرعة: تُعرض فقط سرعة العدو والكرة والتسديد.",
        "hi": "मेट्रिक लॉक — गति: केवल स्प्रिंट, बॉल और शॉट गति दिख रही है।",
    },
    "PASS_QUALITY": {
        "en": "METRIC LOCK — PASS QUALITY: filtered to pass difficulty, space and xT gained.",
        "es": "BLOQUEO DE MÉTRICA — CALIDAD DE PASE: dificultad, espacio y xT ganado.",
        "ar": "قفل المقياس — جودة التمرير: صعوبة التمريرة والمساحة وxT المكتسب.",
        "hi": "मेट्रिक लॉक — पास क्वालिटी: पास कठिनाई, स्पेस और xT लाभ।",
    },
    "EXPECTED_THREAT_XT": {
        "en": "METRIC LOCK — EXPECTED THREAT: xT grid and ghost-pass alternatives only.",
        "es": "BLOQUEO DE MÉTRICA — AMENAZA ESPERADA: solo rejilla xT y pase fantasma.",
        "ar": "قفل المقياس — التهديد المتوقع: شبكة xT والتمريرة الشبحية فقط.",
        "hi": "मेट्रिक लॉक — अपेक्षित खतरा: केवल xT ग्रिड और घोस्ट पास।",
    },
    "CHAOS_PRESSING": {
        "en": "METRIC LOCK — CHAOS & PRESSING: PPDA, pressing intensity and defensive lasers.",
        "es": "BLOQUEO DE MÉTRICA — CAOS Y PRESIÓN: PPDA, intensidad y láseres defensivos.",
        "ar": "قفل المقياس — الفوضى والضغط: PPDA وشدة الضغط وأشعة الدفاع.",
        "hi": "मेट्रिक लॉक — कैओस और प्रेसिंग: PPDA, प्रेसिंग तीव्रता और डिफेंसिव लेज़र।",
    },
}

CLUB_FRAMES = {
    "NLA_LOYALIST": {
        "en": "NLA fan lens: every NLA forward burst is framed as a momentum surge the North Stand can feel.",
        "es": "Visión del aficionado del NLA: cada arranque del NLA se vive como una ola de impulso en la grada norte.",
        "ar": "من منظور مشجع NLA: كل انطلاقة هجومية تُعرض كموجة حماس تهز المدرجات الشمالية.",
        "hi": "NLA फैन नज़रिया: NLA का हर आगे बढ़ना नॉर्थ स्टैंड में जोश की लहर बनकर दिखता है।",
    },
    "MCS_LOYALIST": {
        "en": "MCS fan lens: every MCS possession is framed as control turning into inevitable danger.",
        "es": "Visión del aficionado del MCS: cada posesión del MCS se vive como control que se convierte en peligro.",
        "ar": "من منظور مشجع MCS: كل استحواذ يُعرض كسيطرة تتحول إلى خطر محتوم.",
        "hi": "MCS फैन नज़रिया: MCS का हर कब्ज़ा ऐसा नियंत्रण दिखता है जो खतरे में बदल रहा है।",
    },
}

DEFAULT_PERSONALIZATION = {
    "persona_mode": "TWINCAST_SPLIT",
    "metric_focus": "ALL",
    "favorite_club_bias": "NEUTRAL",
    "locked_player_id": None,
    "market_language": "en",
}


CAMERA_ZONES = {
    "counter_overload": "FINAL_THIRD_OVERLOAD",
    "pressing_trap": "MIDFIELD_PRESS_TRAP",
    "inversion": "INVERTED_FULLBACK_FLANK",
    "difficult_progression": "PROGRESSION_LANE",
    "threat_surge": "XT_SURGE_ZONE",
    "rhythm_shift": "BUILDUP_ZONE",
}


def build_camera_directive(ev: dict, metrics: dict, archetype: str) -> dict:
    """Autonomous 3D camera director: recommends a broadcast camera mode for the
    WebGL engine whenever a threshold event or God-Mode scenario fires."""
    ev = ev or {}
    sc = ev.get("scenario")
    chaos = (metrics or {}).get("chaos_index", 0.5)
    if sc == "chaos_counter" or archetype == "counter_overload":
        mode = "ACTION_ZOOM"
    elif archetype == "pressing_trap" or sc == "high_press_turnover":
        mode = "TACTICAL_DRONE"
    elif archetype == "inversion" or sc == "tactical_inversion":
        mode = "TACTICAL_DRONE"
    elif archetype == "difficult_progression" and (ev.get("pdr") or 0) > 88:
        mode = "PLAYER_LOCK_3RD_PERSON"
    elif chaos > 0.8:
        mode = "ACTION_ZOOM"
    else:
        mode = "TELE_BROADCAST"
    return {
        "recommended_mode": mode,
        "focus_target_id": ev.get("player_id"),
        "cinematic_slow_mo": bool(ev.get("type") == "GOAL" or (ev.get("pdr") or 0) > 92),
        "ar_highlight_zone": CAMERA_ZONES.get(archetype, "BUILDUP_ZONE"),
    }


class Personalizer:
    def __init__(self, cfg=settings):
        self.s = cfg
        self.last_d_ms = 0.0
        self.last_e_ms = 0.0

    @staticmethod
    def normalize_preferences(pref: Optional[dict]) -> dict:
        pref = dict(pref or {})
        persona = str(pref.get("persona_mode") or "TWINCAST_SPLIT").upper()
        focus = str(pref.get("metric_focus") or "ALL").upper()
        bias = str(pref.get("favorite_club_bias") or "NEUTRAL").upper()
        lang = str(pref.get("market_language") or "en").lower()
        locked = pref.get("locked_player_id") or None
        return {
            "persona_mode": persona if persona in PERSONA_MODES else "TWINCAST_SPLIT",
            "metric_focus": focus if focus in METRIC_FOCUS_OPTIONS else "ALL",
            "favorite_club_bias": bias if bias in CLUB_BIAS_OPTIONS else "NEUTRAL",
            "locked_player_id": str(locked) if locked else None,
            "market_language": lang if lang in ("en", "es", "ar", "hi") else "en",
        }

    # ------------------------------------------------------------- Stage (d)+(e)
    def build(self, stage_c: dict, ev: dict, metrics: dict, score: dict,
              pref: Optional[dict] = None, state: Optional[dict] = None) -> dict:
        t0 = time.perf_counter()
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
        if arch == "counter_overload" and state:
            attackers = sorted(
                (p for p in state.get("players", [])
                 if p.get("team") == team and p.get("role") != "GK"),
                key=lambda p: (p.get("x", 0.0) if team == "NLA"
                               else 105.0 - p.get("x", 0.0)),
                reverse=True,
            )
            for p in attackers:
                pid = p.get("id")
                if pid and pid not in highlight:
                    highlight.append(pid)
                if len(highlight) >= 3:
                    break
        overlay = {
            "timecode": ev.get("clock", "00:00"),
            "overlay_type": OVERLAY_TYPES.get(arch, "TACTICAL_PULSE_UPDATE"),
            "highlight_players": highlight,
            "draw_ghost_pass": bool(ev.get("ghost_pass")),
            "lower_third_title": title,
            "lower_third_subtitle": " • ".join(subtitle_parts),
        }

        self.last_d_ms = round((time.perf_counter() - t0) * 1000.0, 3)

        # ---- Stage (e): dual-persona fork + localization ----
        t_e = time.perf_counter()
        ppda = metrics.get("ppda", {})
        def_line = metrics.get("def_lines", {}).get(team, 40.0)
        team_row = (metrics.get("team_stats") or {}).get(team, {})
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
                f"Pass Acc {team_row.get('pass_accuracy', 0):.1f}% | "
                f"Shots {team_row.get('shots', 0)} | "
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
        packet = {
            "stage_c_explainability": stage_c.get("stage_c_explainability", {}),
            "stage_d_broadcast_overlay": overlay,
            "stage_e_personalization": personalization,
            "camera_directive": build_camera_directive(ev, metrics, arch),
        }
        out = self.apply_personalization(packet, ev, metrics, pref)
        self.last_e_ms = round((time.perf_counter() - t_e) * 1000.0, 3)
        return out

    def apply_personalization(self, packet: dict, ev: dict, metrics: dict,
                              pref: Optional[dict] = None) -> dict:
        prefs = self.normalize_preferences(pref)
        stage_e = packet.setdefault("stage_e_personalization", {})
        focus = prefs["metric_focus"]
        bias = prefs["favorite_club_bias"]
        meta = METRIC_FOCUS_META[focus]
        translations = dict(stage_e.get("translations") or {})
        story = translations.get("en") or (
            stage_e.get("casual_fan_mode", {}).get("story_card", ""))

        focus_text = METRIC_FOCUS_TEXT.get(focus)
        club_text = CLUB_FRAMES.get(bias)
        if focus_text:
            for lang in ("en", "es", "ar", "hi"):
                base = translations.get(lang, story)
                translations[lang] = f"{focus_text[lang]} {base}".strip()
            story = translations["en"]
            stage_e.setdefault("analyst_mode", {})["metric_focus_note"] = focus_text["en"]
        if club_text:
            for lang in ("en", "es", "ar", "hi"):
                translations[lang] = f"{translations.get(lang, story)} {club_text[lang]}".strip()
            story = translations["en"]
            stage_e.setdefault("analyst_mode", {})["club_bias_note"] = club_text["en"]

        if focus != "ALL":
            stage_e["metric_focus_note"] = focus_text["en"] if focus_text else meta["label"]
        stage_e["metric_lock"] = {
            "active": focus != "ALL",
            "focus": focus,
            "label": meta["label"],
            "filtered_tags": list(meta["tags"]),
        }
        stage_e["favorite_club_bias"] = bias
        stage_e["club_bias_frame"] = club_text["en"] if club_text else None
        stage_e["persona_mode"] = prefs["persona_mode"]
        stage_e["locked_player_id"] = prefs["locked_player_id"] or ev.get("player_id")
        stage_e["translations"] = translations
        stage_e["casual_fan_mode"] = {
            **(stage_e.get("casual_fan_mode") or {}),
            "story_card": story,
        }
        packet["personalization"] = prefs
        return packet

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

    async def build_async(self, stage_c: dict, ev: dict, metrics: dict, score: dict,
                          pref: Optional[dict] = None, state: Optional[dict] = None) -> dict:
        return await asyncio.to_thread(self.build, stage_c, ev, metrics, score, pref, state)
