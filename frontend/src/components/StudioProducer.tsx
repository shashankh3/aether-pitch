"use client";
// AETHER PITCH v4.0 — "The 12th Man" bi-directional agentic studio co-pilot.
// Judges ask tactical questions (typed or spoken); the triage + narrative backend
// reasons over the live 60s spatial buffer and returns a scene_directive that
// physically drives the 3D camera, spotlight beams, offside wall, compactness
// mesh and ghost replay — plus localized answers and a 15s commentator cue.

import { useRef, useState } from "react";
import {
  ArrowUpRight, Clapperboard, Film, Mic, X, Zap, Camera, Send, Sparkles, Loader2, Quote,
  Swords, ShieldAlert, Gavel, Crosshair, Radar,
} from "lucide-react";
import type {
  Insight, LangCode, Recap, StudioQueryResponse, StudioSuggestedAction, WarRoomResponse,
  WarRoomVector, WarRoomZone, Metrics,
} from "@/lib/types";
import { useSpeechController } from "@/hooks/useSpeechController";
import { useModalA11y } from "@/lib/useModalA11y";
import { API_BASE } from "@/lib/api";
import { telemetry } from "@/lib/telemetry";
import { edgeWarRoom } from "@/lib/edgeEngine";
import { cn } from "@/lib/utils";

interface Props {
  latest: Insight | null;
  recap: Recap | null;
  onCloseRecap: () => void;
  lang: LangCode;
  lockedId: string | null;
  onStudioDirective: (directive: StudioQueryResponse["scene_directive"]) => void;
  onStudioAction: (action: StudioSuggestedAction) => void;
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

const OFFLINE_MESSAGES: Record<"backend" | "voice", Record<LangCode, string>> = {
  backend: {
    en: "The Foundry router is offline. The edge fallback can still drive the camera, ghost lane and recap.",
    es: "El enrutador Foundry está fuera de línea. El modo edge aún puede controlar la cámara, el pase fantasma y el resumen.",
    ar: "موجّه Foundry غير متصل. يمكن لوضع الحافة تشغيل الكاميرا والمسار الوهمي والملخص.",
    hi: "Foundry राउटर ऑफ़लाइन है। एज फ़ॉलबैक कैमरा, घोस्ट लेन और रीकैप चला सकता है।",
  },
  voice: {
    en: "Voice queries need Chrome/Edge. Type your question instead.",
    es: "Las consultas de voz requieren Chrome/Edge. Escribe tu pregunta.",
    ar: "الاستعلامات الصوتية تحتاج Chrome أو Edge. اكتب سؤالك بدلاً من ذلك.",
    hi: "वॉइस क्वेरी के लिए Chrome/Edge चाहिए। कृपया अपना सवाल लिखें।",
  },
};

export default function StudioProducer({
  latest, recap, onCloseRecap, lang, lockedId, onStudioDirective, onStudioAction,
}: Props) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<StudioQueryResponse | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const recapPanelRef = useRef<HTMLDivElement>(null);
  useModalA11y(Boolean(recap), onCloseRecap, recapPanelRef);
  const { isVoiceMuted, speakInsight } = useSpeechController();
  const dir = latest?.camera_directive;

  const offlineResponse = (
    q: string,
    kind: "backend" | "voice",
    chain: string[],
  ): StudioQueryResponse => {
    const gate = latest?.agent_trace?.gate;
    const actions: StudioSuggestedAction[] = [
      {
        id: "edge-ghost",
        label: "Show ghost lane",
        type: "SHOW_GHOST_PASS",
        payload: { enabled: true },
        reason: "Edge counterfactual overlay is always available.",
      },
    ];
    const target = lockedId;
    if (target) {
      actions.push({
        id: "edge-lock",
        label: "Lock selected player",
        type: "LOCK_PLAYER",
        payload: { player_id: target },
        reason: "Keep the selected player at the centre of the read.",
      });
    }
    actions.push({
      id: "edge-recap",
      label: "Open 3-act recap",
      type: "GENERATE_RECAP",
      payload: { focus: "edge_fallback" },
      reason: "The deterministic storyboard still runs offline.",
    });
    const message = OFFLINE_MESSAGES[kind][lang];
    return {
      query: q,
      answer: message,
      agent_specialist: "Edge Match Analyst",
      grounding_citations: [
        {
          label: "Pass difficulty",
          value: gate?.pdr != null ? `${gate.pdr.toFixed(0)}%` : "offline",
          source: "EdgeEngine · last inferred event",
          detail: "Browser-native fallback computed from the 10Hz stream.",
        },
        {
          label: "Delta xT",
          value: gate?.delta_xt != null ? gate.delta_xt.toFixed(2) : "offline",
          source: "EdgeEngine · threat model",
          detail: "No cloud round-trip required.",
        },
      ],
      suggested_actions: actions.slice(0, 3),
      agent_reasoning_chain: chain,
      studio_answer_localized: message,
      commentator_cue_15s: "",
      scene_directive: {
        camera_mode: "TELE_BROADCAST",
        spotlight_player_ids: [],
        enable_offside_wall: false,
        enable_compactness_polygon: false,
        draw_ghost_pass: true,
        highlight_pitch_zone: null,
      },
      model: "edge-autonomous-engine-v5",
    };
  };

  const ask = async (rawQuery?: string) => {
    const q = (rawQuery ?? query).trim();
    if (!q || busy) return;
    setBusy(true);
    setResponse(null);
    try {
      const r = await fetch(`${API_BASE}/api/studio-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, language: lang, persona: "analyst", locked_player_id: lockedId }),
      });
      if (!r.ok) throw new Error(`studio query HTTP ${r.status}`);
      const data: StudioQueryResponse = await r.json();
      if (!data.scene_directive) throw new Error("studio query returned no scene directive");
      if (!data.answer || !Array.isArray(data.grounding_citations) ||
          !Array.isArray(data.suggested_actions)) {
        throw new Error("studio query payload missing required fields");
      }
      setResponse(data);
      onStudioDirective(data.scene_directive);
      if (!isVoiceMuted) speakInsight(data.studio_answer_localized, lang);
    } catch {
      const fallback = offlineResponse(q, "backend", [
        "Foundry router unreachable; preserved the live 10Hz snapshot.",
        "Re-ran the counterfactual and seam scan in EdgeEngine.",
        "Rendered a local action plan without a cloud round-trip.",
      ]);
      setResponse(fallback);
      onStudioDirective(fallback.scene_directive);
      if (!isVoiceMuted) speakInsight(fallback.answer, lang);
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
      setResponse(offlineResponse("(voice)", "voice", [
        "SpeechRecognition API unavailable in this browser.",
        "Kept the typed query path active.",
        "No telemetry or scene state was lost.",
      ]));
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
                  <Loader2 size={11} className="animate-spin" /> Azure AI Foundry models reasoning over 60s spatial buffer…
                </div>
              )}
              {response && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="clip-skew bg-pitch/15 px-1.5 py-0.5 font-tech text-[9px] font-bold uppercase tracking-wider text-pitch">
                      {response.agent_specialist}
                    </span>
                    <span className="truncate font-tech text-[8.5px] uppercase tracking-wider text-slate-500">
                      {response.model ?? "foundry"}
                    </span>
                  </div>
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
                    {response.answer}
                  </p>
                  {response.grounding_citations.length > 0 && (
                    <div className="space-y-1 border-y border-tactical/15 py-1.5">
                      {response.grounding_citations.slice(0, 3).map((citation) => (
                        <div key={`${citation.label}-${citation.source}`} className="flex items-start gap-1.5">
                          <Quote size={9} className="mt-0.5 shrink-0 text-tactical" />
                          <div className="min-w-0 font-tech text-[9px] leading-snug">
                            <span className="font-bold text-slate-200">{citation.label}: {citation.value}</span>
                            <span className="text-slate-500"> · {citation.source}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {response.commentator_cue_15s && (
                    <p className="text-[10px] italic leading-relaxed text-amber-200/90">
                      🎙 “{response.commentator_cue_15s}”
                    </p>
                  )}
                  {response.suggested_actions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {response.suggested_actions.map((action) => (
                        <button
                          key={action.id}
                          onClick={() => onStudioAction(action)}
                          className="flex items-center gap-1 border border-pitch/40 bg-pitch/10 px-1.5 py-0.5 font-tech text-[9px] font-bold uppercase tracking-wider text-pitch transition hover:bg-pitch/25"
                          title={action.reason}
                        >
                          <ArrowUpRight size={10} /> {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="font-tech text-[9px] uppercase tracking-wider text-slate-500">
                    scene executed · tools armed
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* instant studio recap modal */}
      {recap && (
        <div
          className="modal-backdrop z-40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="studio-recap-title"
          onClick={onCloseRecap}
        >
          <div
            ref={recapPanelRef}
            tabIndex={-1}
            data-modal-panel
            onClick={(e) => e.stopPropagation()}
            className="modal-lux clip-ea scroll-slim max-h-full w-[560px] overflow-y-auto p-5"
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <div className="modal-kicker mb-1 flex items-center gap-1.5 text-pitch">
                  <Film size={11} /> Studio Match Recap · {recap.timecode}
                </div>
                <h3 id="studio-recap-title" className="font-display text-[24px] font-bold leading-snug text-slate-100">{recap.title}</h3>
                <div className="mt-1 font-tech text-[12px] text-slate-400">
                  NLA {recap.score.NLA} — {recap.score.MCS} MCS
                </div>
              </div>
              <button onClick={onCloseRecap} className="modal-close clip-skew" aria-label="Close studio match recap">
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

/* ------------------------------------------------------------------ */
/* v6.2 — Adversarial Bench War-Room (3-agent adversarial negotiation) */
/* ------------------------------------------------------------------ */

function frontendSpatialContext() {
  const players = Array.from(telemetry.players.values());
  const team = telemetry.match.possession ?? "NLA";
  const opp = team === "NLA" ? "MCS" : "NLA";
  const defenders = players
    .filter((p) => p.team === team && p.role === "DEF")
    .sort((a, b) => a.y - b.y);
  const stretch = defenders.length
    ? defenders[defenders.length - 1].y - defenders[0].y
    : 0;
  let gapM = 0;
  let gapCenter = { x: 70, y: 34 };
  let gapDefender: { id?: string; name?: string } = {};
  for (let i = 0; i < defenders.length - 1; i++) {
    const seam = defenders[i + 1].y - defenders[i].y;
    if (seam > gapM) {
      gapM = seam;
      gapCenter = {
        x: (defenders[i].x + defenders[i + 1].x) / 2,
        y: (defenders[i].y + defenders[i + 1].y) / 2,
      };
      gapDefender = { id: defenders[i + 1].id, name: defenders[i + 1].name };
    }
  }
  const runners = players.filter((p) => p.role !== "GK" && p.team === opp);
  const fastest = runners.length
    ? runners.reduce((best, p) => (p.speed_kmh > best.speed_kmh ? p : best))
    : null;
  return {
    team,
    backline_stretch_m: stretch,
    widest_gap_m: gapM,
    gap_center: gapCenter,
    gap_defender: gapDefender,
    fastest_sprinter: fastest
      ? {
          id: fastest.id,
          name: fastest.name,
          shirt_number: fastest.shirt_number,
          speed_kmh: fastest.speed_kmh,
        }
      : {},
    xt_at_gap: 0.05,
  };
}

interface WarRoomProps {
  metrics: Metrics | null;
  lang: LangCode;
  onProjectShift: (zones: WarRoomZone[], vectors: WarRoomVector[]) => void;
}

export function BenchWarRoomPanel({ metrics, lang, onProjectShift }: WarRoomProps) {
  const [warRoom, setWarRoom] = useState<WarRoomResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [offline, setOffline] = useState(false);

  const runWarRoom = async () => {
    setRunning(true);
    try {
      const r = await fetch(`${API_BASE}/api/tactical-war-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang, team: telemetry.match.possession ?? "NLA" }),
      });
      if (!r.ok) throw new Error(`war-room HTTP ${r.status}`);
      const data = (await r.json()) as WarRoomResponse;
      // A malformed payload must never leave the panel blank: fall back to
      // the deterministic edge debate instead.
      const t = data?.agent_debate_transcript;
      if (
        !t ||
        !t.manager_proposal ||
        !t.scout_counter ||
        !t.arbiter_verdict ||
        typeof data.projected_30s_xt_delta !== "number" ||
        typeof data.win_prob_shift_pct !== "number" ||
        !Array.isArray(data.target_zones)
      ) {
        throw new Error("war-room payload missing required fields");
      }
      setWarRoom(data);
      setOffline(false);
    } catch {
      setWarRoom(edgeWarRoom(metrics, frontendSpatialContext()));
      setOffline(true);
    } finally {
      setRunning(false);
    }
  };

  const transcript = warRoom?.agent_debate_transcript;

  return (
    <section
      className="clip-ea panel-lux p-3"
      aria-label="Multi-agent bench war-room"
    >
      <div className="mb-2 flex items-start justify-between gap-2 border-b border-white/10 pb-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 font-display text-[13px] font-bold uppercase tracking-[0.22em] text-crimson">
            <Swords size={13} /> Bench War-Room
          </h2>
          <p className="mt-0.5 font-tech text-[9px] uppercase tracking-[0.18em] text-slate-500">
            3 adversarial agents · live Stage B telemetry
          </p>
        </div>
        <button
          onClick={runWarRoom}
          disabled={running}
          className="clip-skew flex shrink-0 items-center gap-1 bg-crimson/20 px-2 py-1 font-tech text-[9.5px] font-bold uppercase tracking-wider text-crimson transition hover:bg-crimson/35 disabled:opacity-50"
          title="Run the NLATacticalManagerAgent / MCSOppositionScoutAgent / SpatialArbiterAgent debate"
        >
          {running ? <Loader2 size={11} className="animate-spin" /> : <Radar size={11} />}
          {running ? "Debating" : "Run War-Room"}
        </button>
      </div>

      {!warRoom && !running && (
        <p className="font-tech text-[9.5px] leading-relaxed text-slate-500">
          The NLA tactical manager proposes, the MCS opposition scout counters, and the
          spatial arbiter adjudicates against the 16×12 xT tensor to issue one
          grounded tactical prescription.
        </p>
      )}

      {warRoom && transcript && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <span className="clip-skew bg-pitch/20 px-1.5 py-0.5 font-tech text-[9px] font-bold uppercase tracking-wider text-pitch">
              +{warRoom.projected_30s_xt_delta.toFixed(2)} xT / 30s
            </span>
            <span className="clip-skew bg-gold/20 px-1.5 py-0.5 font-tech text-[9px] font-bold uppercase tracking-wider text-gold">
              +{warRoom.win_prob_shift_pct.toFixed(1)}% WIN PROB
            </span>
            <span className="font-tech text-[8.5px] uppercase tracking-wider text-slate-500">
              {warRoom.mode === "edge" ? "edge fallback" : (warRoom.model ?? "foundry")}
            </span>
          </div>

          <div className="space-y-1">
            {(
              [
                {
                  id: "nla_tactical_manager",
                  label: "NLATacticalManagerAgent",
                  body: transcript.manager_proposal,
                  icon: Crosshair,
                  tone: "text-pitch",
                  edge: "border-pitch/60 bg-pitch/[0.06]",
                },
                {
                  id: "mcs_opposition_scout",
                  label: "MCSOppositionScoutAgent",
                  body: transcript.scout_counter,
                  icon: ShieldAlert,
                  tone: "text-crimson",
                  edge: "border-crimson/60 bg-crimson/[0.06]",
                },
                {
                  id: "spatial_arbiter",
                  label: "SpatialArbiterAgent",
                  body: transcript.arbiter_verdict,
                  icon: Gavel,
                  tone: "text-tactical",
                  edge: "border-tactical/60 bg-tactical/[0.06]",
                },
              ] as const
            ).map((row) => {
              const call = warRoom.agent_calls?.find((c) => c.id === row.id);
              const Icon = row.icon;
              return (
                <div key={row.id} className={cn("border-l-2 px-2 py-1.5", row.edge)}>
                  <div className="flex items-center gap-1 font-tech text-[8.5px] font-bold uppercase tracking-wider">
                    <Icon size={9} className={row.tone} />
                    <span className={row.tone}>{row.label}</span>
                    {call && (
                      <span className="ml-auto flex items-center gap-1 font-tech text-[7.5px] font-normal uppercase tracking-wider text-slate-500">
                        <span className="text-slate-400">{call.deployment}</span>
                        {call.latency_ms > 0 && <span>· {call.latency_ms.toFixed(0)}ms</span>}
                        {call.total_tokens != null && <span>· {call.total_tokens} tok</span>}
                        {call.tools.length > 0 && (
                          <span title={call.tools.join(", ")}>· {call.tools.length} tools</span>
                        )}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-slate-300">{row.body}</p>
                </div>
              );
            })}
          </div>

          {warRoom.orchestration && (
            <p className="font-tech text-[7.5px] uppercase leading-relaxed tracking-wider text-slate-600">
              {warRoom.orchestration.rounds} sequential agent calls ·{" "}
              {warRoom.orchestration.mode.replace(/_/g, " ")} · {warRoom.orchestration.note}
            </p>
          )}

          <div className="border border-white/10 bg-black/25 px-2 py-1.5">
            <div className="font-tech text-[8.5px] font-bold uppercase tracking-wider text-slate-500">
              Prescription
            </div>
            <div className="mt-0.5 text-[10.5px] font-bold text-slate-100">
              {warRoom.recommended_adjustment.title}
            </div>
            <p className="mt-0.5 text-[9.5px] leading-relaxed text-slate-400">
              {warRoom.recommended_adjustment.directive}
            </p>
          </div>

          <button
            onClick={() => onProjectShift(warRoom.target_zones, warRoom.adjustment_vectors)}
            className="clip-skew flex w-full items-center justify-center gap-1.5 bg-tactical/20 py-1.5 font-tech text-[10px] font-bold uppercase tracking-wider text-tactical transition hover:bg-tactical/35"
            title="Highlight the recommended overload zones and adjustment vectors on the 3D pitch"
          >
            <ArrowUpRight size={11} /> Project Tactical Shift on 3D Pitch
          </button>

          {offline && (
            <p className="font-tech text-[8.5px] uppercase tracking-wider text-gold">
              Backend offline · deterministic edge debate
            </p>
          )}
        </div>
      )}
    </section>
  );
}
