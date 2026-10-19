"use client";
// AETHER PITCH v2.0 — TwinCast HUD: dual-persona feed (Tactical Analyst vs
// Casual Fan vs Split TwinCast) with the persona + language switchers living
// right in the dock, EN/ES/AR/HI localization and live voice synthesis.

import { useEffect, useRef } from "react";
import { Volume2, VolumeX, Gauge, BrainCircuit, Sparkles, Users, Heart, Layers } from "lucide-react";
import type { Insight, LangCode, Metrics, PersonaMode } from "@/lib/types";
import { LANG_LABELS, SPEECH_LOCALES } from "@/lib/types";
import { useSpeechController } from "@/hooks/useSpeechController";
import { cn } from "@/lib/utils";

interface Props {
  insights: Insight[];
  persona: PersonaMode;
  onPersona: (p: PersonaMode) => void;
  lang: LangCode;
  onLang: (l: LangCode) => void;
  metrics: Metrics | null;
}

function AnalystCard({ metrics }: { metrics: Metrics | null }) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        {[
          ["CHAOS", (metrics?.chaos_index ?? 0).toFixed(2), "text-tactical"],
          ["PPDA", `${metrics?.ppda.NLA ?? 0}/${metrics?.ppda.MCS ?? 0}`, "text-pitch"],
          ["Δ CHAOS 10s", (metrics?.delta_chaos ?? 0).toFixed(2), "text-gold"],
          ["LINE", `${metrics?.def_lines.NLA ?? 0}m / ${metrics?.def_lines.MCS ?? 0}m`, "text-slate-300"],
        ].map(([k, v, c]) => (
          <div key={k} className="clip-chamfer border border-white/10 bg-white/[0.03] px-2 py-1.5">
            <div className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">{k}</div>
            <div className={`font-tech text-[14px] font-bold ${c}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="clip-chamfer border border-white/10 bg-white/[0.03] px-2.5 py-2">
        <div className="mb-1 flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-tactical">
          <Gauge size={11} /> Live Metrics (Stage B)
        </div>
        <div className="font-tech text-[10.5px] leading-relaxed text-slate-300">
          {metrics
            ? `Turnovers/min ${metrics.turnover_rate.toFixed(1)} | Ball-σ² ${metrics.ball_speed_var.toFixed(0)} | Press ${metrics.pressing_intensity}/3 | Stretch ${metrics.stretch_m.toFixed(1)} m`
            : "—"}
        </div>
      </div>
    </div>
  );
}

function CasualCard({ insight, lang }: { insight: Insight; lang: LangCode }) {
  const c = insight.stage_e_personalization.casual_fan_mode;
  const t = insight.stage_e_personalization.translations;
  const text = lang === "en" ? c.story_card : t[lang] || c.story_card;
  return (
    <div className="space-y-2.5">
      <div className="clip-chamfer relative overflow-hidden border border-crimson/30 bg-gradient-to-br from-violetdeep/60 to-obsidian p-3">
        <div className="mb-1 font-display text-[10px] font-bold uppercase tracking-[0.25em] text-crimson">
          Match Story · {LANG_LABELS[lang]}
        </div>
        <p
          className={cn("text-[13px] font-medium leading-relaxed", lang === "ar" && "text-right")}
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          {text}
        </p>
      </div>
      <div className="clip-chamfer flex items-center gap-3 border border-white/10 bg-white/[0.03] px-3 py-2">
        <span className="font-display text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Excitement</span>
        <div className="h-2 flex-1 overflow-hidden bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-tactical via-pitch to-crimson transition-all duration-700"
            style={{ width: `${c.excitement_rating}%` }}
          />
        </div>
        <span className="font-tech text-sm font-bold text-crimson">{c.excitement_rating}</span>
      </div>
    </div>
  );
}

const PERSONAS: { id: PersonaMode; label: string; icon: React.ReactNode }[] = [
  { id: "analyst", label: "Analyst", icon: <Users size={12} /> },
  { id: "casual", label: "Fan", icon: <Heart size={12} /> },
  { id: "split", label: "TwinCast", icon: <Layers size={12} /> },
];

export default function TwinCastHUD({ insights, persona, onPersona, lang, onLang, metrics }: Props) {
  const { isSpeaking, isVoiceMuted, speakInsight, toggleMute } = useSpeechController();
  const spokenRef = useRef<string>("");
  const latest = insights[0];

  useEffect(() => {
    if (!latest || spokenRef.current === latest.id) return;
    spokenRef.current = latest.id;
    if (!isVoiceMuted) {
      const e = latest.stage_e_personalization;
      speakInsight(
        lang === "en" ? e.casual_fan_mode.story_card : e.translations[lang] || e.casual_fan_mode.story_card,
        lang
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id]);

  return (
    <section className="clip-ea flex h-full min-h-0 flex-col border border-white/15 bg-slate-950/78 backdrop-blur-xl">
      <div className="shrink-0 border-b border-white/10 px-3 py-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-display text-[14px] font-bold uppercase tracking-[0.26em] text-slate-200">
            <Sparkles size={13} className="text-pitch" /> TwinCast
          </h2>
          <button
            onClick={toggleMute}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 font-tech text-[10px] font-bold uppercase tracking-wider transition",
              isVoiceMuted ? "text-slate-500 hover:text-slate-300" : "bg-pitch/20 text-pitch"
            )}
            title="Localized AI voice commentary (Web Speech API + Azure AI Speech-ready) — click to mute/unmute"
          >
            {isVoiceMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            {isSpeaking && !isVoiceMuted && <span className="animate-breathe">LIVE</span>}
          </button>
        </div>
        <div className="mt-1.5 flex gap-1">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => onPersona(p.id)}
              className={cn(
                "clip-skew flex flex-1 items-center justify-center gap-1 py-1 font-tech text-[10.5px] font-bold uppercase tracking-wider transition",
                persona === p.id ? "bg-tactical/20 text-tactical" : "bg-white/[0.03] text-slate-400 hover:text-slate-200"
              )}
            >
              {p.icon}
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-1 flex gap-1">
          {(["en", "es", "ar", "hi"] as LangCode[]).map((l) => (
            <button
              key={l}
              onClick={() => onLang(l)}
              className={cn(
                "flex-1 py-0.5 font-tech text-[10px] font-bold uppercase tracking-wider transition",
                lang === l ? "bg-pitch/20 text-pitch" : "text-slate-500 hover:text-slate-300"
              )}
            >
              {l === "en" ? "EN" : l === "es" ? "ES" : l === "ar" ? "AR" : "HI"}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!latest && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <Sparkles size={22} className="text-slate-600" />
            <p className="text-[11.5px] leading-relaxed text-slate-500">
              Awaiting a tactical inflection…
              <br />
              The Studio Co-Pilot fires when the deterministic entropy gate trips.
            </p>
          </div>
        )}
        {latest && (persona === "analyst" || persona === "split") && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-display text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
                Tactical Analyst HUD
              </span>
              <span className="font-tech text-[9.5px] text-slate-600">
                {latest.stage_d_broadcast_overlay.timecode}
              </span>
            </div>
            <h3 className="mb-2 text-[13.5px] font-bold leading-snug text-slate-100">
              {latest.stage_c_explainability.moment_headline}
            </h3>
            <div className="clip-chamfer border border-white/10 bg-white/[0.03] px-2.5 py-2">
              <div className="mb-1 flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-crimson">
                <BrainCircuit size={11} /> Causal Chain (Stage C)
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300">
                {latest.stage_c_explainability.why_it_matters_causal}
              </p>
              <p className="mt-1.5 text-[10px] italic leading-relaxed text-slate-400">
                {latest.stage_e_personalization.analyst_mode.tactical_note}
              </p>
            </div>
            <div className="mt-2.5">
              <AnalystCard metrics={metrics} />
            </div>
            <div className="clip-chamfer mt-2.5 border border-white/10 bg-white/[0.03] px-2.5 py-2">
              <div className="mb-0.5 font-display text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Stage (E) Summary
              </div>
              <div className="font-tech text-[10.5px] leading-relaxed text-slate-300">
                {latest.stage_e_personalization.analyst_mode.metrics_summary}
              </div>
            </div>
          </div>
        )}
        {latest && (persona === "casual" || persona === "split") && (
          <div>
            <div className="mb-1.5 font-display text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
              Casual Fan Mode
            </div>
            <CasualCard insight={latest} lang={lang} />
          </div>
        )}
        {latest && (
          <div className="clip-chamfer border border-white/10 bg-white/[0.03] px-2.5 py-2">
            <div className="mb-1 font-display text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Commentator Talking Point
            </div>
            <p className="text-[11px] italic leading-relaxed text-amber-200/90">
              “{latest.stage_c_explainability.commentator_talking_point}”
            </p>
          </div>
        )}
        {insights.length > 1 && (
          <div>
            <div className="mb-1 font-display text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
              Earlier Moments
            </div>
            <div className="space-y-1">
              {insights.slice(1, 6).map((i) => (
                <div
                  key={i.id}
                  className="clip-chamfer flex w-full items-center gap-2 border border-white/5 bg-white/[0.02] px-2 py-1.5"
                  title={i.stage_c_explainability.moment_headline}
                >
                  <span className="font-tech text-[9.5px] font-bold text-tactical">
                    {i.stage_d_broadcast_overlay.timecode}
                  </span>
                  <span className="truncate text-[10.5px] text-slate-400">
                    {i.stage_c_explainability.moment_headline}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
