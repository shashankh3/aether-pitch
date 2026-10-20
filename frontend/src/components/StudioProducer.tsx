"use client";
// AETHER PITCH v4.0 — "The 12th Man" bi-directional agentic studio co-pilot.
// Judges ask tactical questions (typed or spoken); the multi-agent backend
// reasons over the live 60s spatial buffer and returns a scene_directive that
// physically drives the 3D camera, spotlight beams, offside wall, compactness
// mesh and ghost replay — plus localized answers and a 15s commentator cue.

import { useRef, useState } from "react";
import { Clapperboard, Film, Mic, X, Zap, Camera, Send, Sparkles, Loader2 } from "lucide-react";
import type { Insight, LangCode, Recap, StudioQueryResponse } from "@/lib/types";
import { useSpeechController } from "@/hooks/useSpeechController";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  latest: Insight | null;
  recap: Recap | null;
  onCloseRecap: () => void;
  lang: LangCode;
  lockedId: string | null;
  onStudioDirective: (directive: StudioQueryResponse["scene_directive"]) => void;
}

const CAM_LABELS: Record<string, string> = {
  ACTION_ZOOM: "Action Zoom",
  TACTICAL_DRONE: "Tactical Drone",
  PLAYER_LOCK_3RD_PERSON: "Pro Cam",
  TELE_BROADCAST: "Tele Cam",
};

const PROMPT_CHIPS = [
  "🔍 Spot Defensive Weakness",
  "⚡ Explain Why Chaos Is Spiking",
  "👻 Analyze Ghost Pass Alternative",
  "📊 Evaluate Locked Player Impact",
];

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export default function StudioProducer({
  latest, recap, onCloseRecap, lang, lockedId, onStudioDirective,
}: Props) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<StudioQueryResponse | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const { isVoiceMuted, speakInsight } = useSpeechController();
  const dir = latest?.camera_directive;

  const ask = async (rawQuery?: string) => {
    const q = (rawQuery ?? query).trim();
    if (!q || busy) return;
    setBusy(true);
    setResponse(null);
    try {
      const r = await fetch(`${API_URL}/api/studio-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, language: lang, persona: "analyst", locked_player_id: lockedId }),
      });
      if (!r.ok) throw new Error(`studio query HTTP ${r.status}`);
      const data: StudioQueryResponse = await r.json();
      if (!data.scene_directive) throw new Error("studio query returned no scene directive");
      setResponse(data);
      onStudioDirective(data.scene_directive);
      if (!isVoiceMuted) speakInsight(data.studio_answer_localized, lang);
    } catch {
      setResponse({
        query: q,
        agent_reasoning_chain: ["Studio engine unreachable on :8000."],
        studio_answer_localized: "The 12th Man could not reach the pipeline. Is the backend running?",
        commentator_cue_15s: "",
        scene_directive: {
          camera_mode: "TELE_BROADCAST",
          spotlight_player_ids: [],
          enable_offside_wall: false,
          enable_compactness_polygon: false,
          draw_ghost_pass: false,
          highlight_pitch_zone: null,
        },
        model: "offline",
      });
    } finally {
      setBusy(false);
    }
  };

  const startVoiceQuery = () => {
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionLike)
      | undefined;
    if (!Ctor) {
      setResponse({
        query: "(voice)",
        agent_reasoning_chain: ["SpeechRecognition API unavailable in this browser."],
        studio_answer_localized: "Voice queries need Chrome/Edge — type your question instead.",
        commentator_cue_15s: "",
        scene_directive: {
          camera_mode: "TELE_BROADCAST", spotlight_player_ids: [],
          enable_offside_wall: false, enable_compactness_polygon: false,
          draw_ghost_pass: false, highlight_pitch_zone: null,
        },
        model: "offline",
      });
      return;
    }
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = lang === "en" ? "en-GB" : lang === "es" ? "es-ES" : lang === "ar" ? "ar-SA" : "hi-IN";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      setQuery(transcript);
      setListening(false);
      ask(transcript);
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  return (
    <>
      <section className="clip-ea pointer-events-auto shrink-0 border border-white/15 bg-slate-950/78 px-3 py-2.5 backdrop-blur-xl">
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-display text-[13px] font-bold uppercase tracking-[0.22em] text-slate-200">
            <Clapperboard size={12} className="text-pitch" /> The 12th Man
          </h2>
          {latest && (
            <span className="max-w-[120px] truncate font-tech text-[9px] uppercase text-slate-600" title={latest.model}>
              {latest.model}
            </span>
          )}
        </div>

        {/* ---- AI camera directive readout ---- */}
        {dir && (
          <div className="clip-skew mb-1.5 flex items-center gap-1.5 bg-gold/10 px-2 py-0.5">
            <Camera size={10} className="text-gold" />
            <span className="font-tech text-[9.5px] font-bold uppercase tracking-wider text-gold">
              AI Cam → {CAM_LABELS[dir.recommended_mode] ?? dir.recommended_mode}
              {dir.cinematic_slow_mo ? " · SLO-MO" : ""} · {dir.ar_highlight_zone.replace(/_/g, " ")}
            </span>
          </div>
        )}

        {/* ---- latest passive insight (hidden on short viewports to keep the rail compact) ---- */}
        {latest && (
          <div className="mb-2 hidden space-y-1 [@media(min-height:820px)]:block">
            <div className="flex items-start gap-2">
              <span className="clip-skew mt-0.5 shrink-0 bg-crimson/20 px-1.5 py-0.5 font-tech text-[9px] font-bold uppercase tracking-wider text-crimson">
                {latest.stage_d_broadcast_overlay.overlay_type.replace(/_/g, " ")}
              </span>
              <p className="text-[12px] font-bold leading-snug text-slate-100">
                {latest.stage_c_explainability.moment_headline}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-amber-300/90">
              <Zap size={10} />
              {latest.stage_c_explainability.tactical_catalyst}
            </div>
          </div>
        )}

        {/* ---- bi-directional co-pilot command bar ---- */}
        <div className="border-t border-white/10 pt-2">
          <div className="mb-1 flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-tactical">
            <Sparkles size={10} /> Ask The 12th Man (Azure AI Foundry Co-Pilot)
          </div>
          <div className="flex items-center gap-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ask about the live 60s spatial state…"
              className="min-w-0 flex-1 border border-white/15 bg-black/50 px-2 py-1 font-tech text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-tactical/60"
            />
            <button
              onClick={startVoiceQuery}
              className={listening ? "animate-pulse-crimson bg-crimson/30 p-1.5 text-crimson" : "bg-white/[0.06] p-1.5 text-slate-400 transition hover:text-tactical"}
              title="🎙️ Voice Query (Web Speech API)"
            >
              <Mic size={13} />
            </button>
            <button
              onClick={() => ask()}
              disabled={busy}
              className="bg-tactical/20 p-1.5 text-tactical transition hover:bg-tactical/40 disabled:opacity-50"
              title="Send query"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {PROMPT_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => ask(chip)}
                disabled={busy}
                className="clip-skew bg-white/[0.05] px-1.5 py-0.5 font-tech text-[9px] font-bold uppercase tracking-wider text-slate-400 transition hover:bg-tactical/20 hover:text-tactical disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* agent response */}
          {(response || busy) && (
            <div className="scroll-slim mt-1.5 max-h-[210px] overflow-y-auto border border-tactical/30 bg-tactical/[0.06] p-2 clip-chamfer">
              {busy && !response && (
                <div className="flex items-center gap-1.5 font-tech text-[10px] font-bold uppercase tracking-wider text-tactical">
                  <Loader2 size={11} className="animate-spin" /> Azure AI Foundry agents reasoning over 60s spatial buffer…
                </div>
              )}
              {response && (
                <div className="space-y-1">
                  <div className="flex flex-wrap gap-1">
                    {response.agent_reasoning_chain.slice(0, 3).map((step, i) => (
                      <span
                        key={i}
                        className="max-w-full border border-tactical/40 bg-black/40 px-1.5 py-0.5 font-tech text-[9px] leading-snug text-slate-300"
                        title={step}
                      >
                        <span className="text-tactical">STEP {i + 1}</span> · {step}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-200">
                    {response.studio_answer_localized}
                  </p>
                  {response.commentator_cue_15s && (
                    <p className="text-[10px] italic leading-relaxed text-amber-200/90">
                      🎙 “{response.commentator_cue_15s}”
                    </p>
                  )}
                  <div className="font-tech text-[9px] uppercase tracking-wider text-slate-500">
                    scene executed · {response.model ?? "foundry"}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* instant studio recap modal */}
      {recap && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-8 backdrop-blur-sm">
          <div className="clip-ea scroll-slim max-h-full w-[560px] overflow-y-auto border border-tactical/30 bg-slate-950/95 p-5 shadow-2xl animate-slide-up">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <div className="mb-1 flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.25em] text-pitch">
                  <Film size={11} /> Studio Match Recap · {recap.timecode}
                </div>
                <h3 className="font-display text-[24px] font-bold leading-snug text-slate-100">{recap.title}</h3>
                <div className="mt-1 font-tech text-[12px] text-slate-400">
                  NLA {recap.score.NLA} — {recap.score.MCS} MCS
                </div>
              </div>
              <button onClick={onCloseRecap} className="p-1 text-slate-400 transition hover:bg-white/10 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <ol className="space-y-3">
              {recap.items.map((item, i) => (
                <li key={i} className="clip-chamfer border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="bg-tactical/15 px-1.5 py-0.5 font-tech text-[10px] font-bold text-tactical">
                      {i + 1} · {item.clock}
                    </span>
                    <span className="text-[12px] font-bold text-slate-100">{item.headline}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">{item.detail}</p>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex items-start gap-2 border-t border-white/10 pt-3">
              <Mic size={12} className="mt-0.5 shrink-0 text-amber-300" />
              <div className="min-w-0">
                <p className="text-[11px] italic leading-relaxed text-amber-200/90" dir="rtl">
                  {recap.translations.ar}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">ES: {recap.translations.es}</p>
                <p className="text-[10px] text-slate-500">HI: {recap.translations.hi}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
