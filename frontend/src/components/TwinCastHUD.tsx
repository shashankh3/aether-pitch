"use client";
// AETHER PITCH — TwinCast HUD: dual-persona feed (Tactical Analyst vs Casual
// Fan vs split TwinCast) with EN/ES/AR/HI localization + voice synthesis.

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Gauge, BrainCircuit, Sparkles } from "lucide-react";
import type { Insight, LangCode, Metrics, PersonaMode } from "@/lib/types";
import { LANG_LABELS, SPEECH_LOCALES } from "@/lib/types";

interface Props {
  insights: Insight[];
  persona: PersonaMode;
  lang: LangCode;
  metrics: Metrics | null;
}

function AnalystCard({ metrics }: { metrics: Metrics | null }) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        {[
          ["CHAOS", (metrics?.chaos_index ?? 0).toFixed(2), "text-tactical"],
          ["PPDA", `${metrics?.ppda.NLA ?? 0}/${metrics?.ppda.MCS ?? 0}`, "text-pitch"],
          ["Δ CHAOS 10s", (metrics?.delta_chaos ?? 0).toFixed(2), "text-amber-400"],
          ["LINE", `${metrics?.def_lines.NLA ?? 0}m / ${metrics?.def_lines.MCS ?? 0}m`, "text-slate-300"],
        ].map(([k, v, c]) => (
          <div key={k} className="glass-soft rounded px-2 py-1.5">
            <div className="text-[8px] font-bold tracking-[0.2em] text-slate-500">{k}</div>
            <div className={`font-mono text-sm font-bold ${c}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="glass-soft rounded px-2.5 py-2">
        <div className="mb-1 flex items-center gap-1 text-[9px] font-bold tracking-[0.2em] text-tactical">
          <Gauge size={11} /> LIVE METRICS (STAGE B)
        </div>
        <div className="font-mono text-[10.5px] leading-relaxed text-slate-300">
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
      <div className="relative overflow-hidden rounded-lg border border-crimson/30 bg-gradient-to-br from-violetdeep/60 to-obsidian p-3">
        <div className="mb-1 text-[9px] font-bold tracking-[0.25em] text-crimson">
          MATCH STORY · {LANG_LABELS[lang]}
        </div>
        <p
          className={`text-[13px] font-medium leading-relaxed ${lang === "ar" ? "text-right" : ""}`}
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          {text}
        </p>
      </div>
      <div className="glass-soft flex items-center gap-3 rounded px-3 py-2">
        <span className="text-[9px] font-bold tracking-[0.2em] text-slate-500">EXCITEMENT</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-tactical via-pitch to-crimson transition-all duration-700"
            style={{ width: `${c.excitement_rating}%` }}
          />
        </div>
        <span className="font-mono text-sm font-bold text-crimson">{c.excitement_rating}</span>
      </div>
    </div>
  );
}

export default function TwinCastHUD({ insights, persona, lang, metrics }: Props) {
  const [voiceOn, setVoiceOn] = useState(false);
  const voiceOnRef = useRef(false);
  const spokenRef = useRef<string>("");
  const latest = insights[0];

  const speak = (insight: Insight, l: LangCode) => {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const e = insight.stage_e_personalization;
      const text = l === "en" ? e.casual_fan_mode.story_card : e.translations[l] || e.casual_fan_mode.story_card;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LOCALES[l];
      u.rate = 1.05;
      synth.speak(u);
    } catch {
      /* speech synthesis unsupported — stay silent */
    }
  };

  useEffect(() => {
    if (!latest || spokenRef.current === latest.id) return;
    spokenRef.current = latest.id;
    if (voiceOnRef.current) speak(latest, lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id]);

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    voiceOnRef.current = next;
    if (!next) {
      window.speechSynthesis?.cancel();
    } else if (latest) {
      speak(latest, lang);
    }
  };

  const empty = (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      <Sparkles size={22} className="text-slate-600" />
      <p className="text-[11px] leading-relaxed text-slate-500">
        Awaiting a tactical inflection…
        <br />
        The Studio Co-Pilot fires when the deterministic entropy gate trips.
      </p>
    </div>
  );

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2">
        <h2 className="flex items-center gap-1.5 font-display text-[13px] font-bold uppercase tracking-[0.28em] text-slate-300">
          <Sparkles size={13} className="text-pitch" /> TwinCast Feed
        </h2>
        <button
          onClick={toggleVoice}
          className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold tracking-wider transition ${
            voiceOn ? "bg-pitch/20 text-pitch" : "text-slate-500 hover:text-slate-300"
          }`}
          title="Toggle localized AI voice commentary (Web Speech API)"
        >
          {voiceOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
          {LANG_LABELS[lang]}
        </button>
      </div>
      <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!latest && empty}
        {latest && (persona === "analyst" || persona === "split") && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
                Tactical Analyst HUD
              </span>
              <span className="font-mono text-[9px] text-slate-600">
                {latest.stage_d_broadcast_overlay.timecode}
              </span>
            </div>
            <h3 className="mb-2 text-[13px] font-bold leading-snug text-slate-100">
              {latest.stage_c_explainability.moment_headline}
            </h3>
            <div className="glass-soft rounded px-2.5 py-2">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] text-crimson">
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
            <div className="glass-soft mt-2.5 rounded px-2.5 py-2">
              <div className="mb-0.5 text-[9px] font-bold tracking-[0.2em] text-slate-500">
                STAGE (E) SUMMARY
              </div>
              <div className="font-mono text-[10.5px] leading-relaxed text-slate-300">
                {latest.stage_e_personalization.analyst_mode.metrics_summary}
              </div>
            </div>
          </div>
        )}
        {latest && (persona === "casual" || persona === "split") && (
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
              Casual Fan Mode
            </div>
            <CasualCard insight={latest} lang={lang} />
          </div>
        )}
        {latest && (
          <div className="glass-soft rounded px-2.5 py-2">
            <div className="mb-1 text-[9px] font-bold tracking-[0.2em] text-slate-500">
              COMMENTATOR TALKING POINT
            </div>
            <p className="text-[11px] italic leading-relaxed text-amber-200/90">
              “{latest.stage_c_explainability.commentator_talking_point}”
            </p>
          </div>
        )}
        {insights.length > 1 && (
          <div>
            <div className="mb-1 text-[9px] font-bold tracking-[0.25em] text-slate-500">
              EARLIER MOMENTS
            </div>
            <div className="space-y-1">
              {insights.slice(1, 6).map((i) => (
                <div
                  key={i.id}
                  className="glass-soft flex w-full items-center gap-2 rounded px-2 py-1.5 text-left"
                  title={i.stage_c_explainability.moment_headline}
                >
                  <span className="font-mono text-[9px] text-tactical">
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
