"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clapperboard, Download, FileText, Loader2, Play, RefreshCw, Sparkles, X,
} from "lucide-react";
import { useModalA11y } from "@/lib/useModalA11y";
import { API_BASE } from "@/lib/api";
import type {
  LangCode, MatchEvent, MatchRecapStoryboard, MatchTick, PipelineAudit, RecapAct,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onLoadAct: (act: RecapAct, recap: MatchRecapStoryboard) => void;
  lang: LangCode;
  tick: MatchTick | null;
  events: MatchEvent[];
}

function fallbackStoryboard(tick: MatchTick | null, events: MatchEvent[]): MatchRecapStoryboard {
  const base = tick ?? {
    t_match: 3720, clock: "62:00", score: { NLA: 1, MCS: 1 }, possession: "NLA" as const,
    players: [], ball: {
      x: 52.5, y: 34, z: 0, vx: 0, vy: 0, vz: 0, speed_kmh: 0,
      pass_start: null, pass_end: null, is_lofted: false,
    },
    carrier: null, scenario: null, scenario_left: null,
  };
  const passEvents = events.filter((e) => e.type === "PASS");
  const specs = [
    ["The Tactical Catalyst", "The inversion that broke the first line"],
    ["The Pressure Rupture", "The defensive line pushed beyond its safe limit"],
    ["The Counter-Factual Storm", "The transition where the game turned"],
  ];
  const acts: RecapAct[] = specs.map(([title, subtitle], i) => {
    const ev = passEvents[i] ?? passEvents[0];
    const start = ev?.start ?? [52.5, 34] as [number, number];
    const end = ev?.end ?? [78, 34] as [number, number];
    const ghost = ev?.ghost_pass;
    const targetId = ev?.target_id ?? ghost?.target_id ?? base.players[i + 3]?.id ?? null;
    const target = base.players.find((p) => p.id === targetId);
    return {
      act: i + 1,
      title,
      subtitle,
      clock: ev?.clock ?? base.clock,
      score: base.score,
      team: ev?.team ?? base.possession,
      event_type: ev?.type ?? "PASS",
      player_id: ev?.player_id ?? base.carrier,
      player_name: ev?.player_name ?? base.carrier ?? "the carrier",
      pdr: ev?.pdr ?? 84,
      delta_xt: ev?.delta_xt ?? 0.12,
      chaos: 0.6 + i * 0.08,
      actual_pass: {
        start: { x: start[0], y: start[1] },
        end: { x: end[0], y: end[1] },
      },
      ghost_pass: {
        start: { x: start[0], y: start[1] },
        end: { x: ghost?.x ?? 82, y: ghost?.y ?? 48 },
        delta_xt: ghost?.delta_xt ?? 0.214,
        target_id: targetId,
        openness_m: ghost?.openness_m ?? 12,
        actual_delta_xt: ghost?.actual_delta_xt ?? ev?.delta_xt ?? 0.12,
        ghost_delta_xt: ghost?.ghost_delta_xt ?? ghost?.delta_xt ?? 0.214,
        net_xt_gain: ghost?.net_xt_gain
          ?? ((ghost?.delta_xt ?? 0.214) - (ev?.delta_xt ?? 0.12)),
        completion_probability: ghost?.completion_probability ?? null,
        receiver_target_xy: ghost?.receiver_target_xy
          ?? { x: ghost?.x ?? 82, y: ghost?.y ?? 48 },
      },
      key_player_ids: [ev?.player_id, targetId, target?.id].filter(Boolean) as string[],
      highlight_zone: {
        x_min: Math.max(0, Math.min(start[0], end[0]) - 12),
        x_max: Math.min(105, Math.max(start[0], end[0]) + 12),
        y_min: Math.max(0, Math.min(start[1], end[1]) - 9),
        y_max: Math.min(68, Math.max(start[1], end[1]) + 9),
        label: title.toUpperCase(),
      },
      camera_mode: "TACTICAL_DRONE_ORBIT",
      snapshot: base,
      analyst_tactical_summary: `Act ${i + 1} — ${title}. ${subtitle}. PDR ${(ev?.pdr ?? 84).toFixed(0)}% for ${(ev?.delta_xt ?? 0.12).toFixed(2)} xT.`,
      casual_story: `Act ${i + 1}: ${title}! The stadium felt the momentum swing.`,
      localized_commentary: {
        en: `Act ${i + 1} — ${title}. ${subtitle}.`,
        es: `Acto ${i + 1} — ${title}. ${subtitle}.`,
        ar: `الفصل ${i + 1} — ${title}. ${subtitle}.`,
        hi: `अंक ${i + 1} — ${title}. ${subtitle}.`,
      },
    };
  });
  return {
    title: "The Championship Finale — Three Acts That Decided It",
    subtitle: "Offline Edge Storyboard · full UI fallback",
    model: "edge-autonomous-engine-v5",
    score: base.score,
    timecode: base.clock,
    acts,
    milestones: [
      { id: "fallback_1", type: "MILESTONE_SPRINT_PEAK", clock: acts[0].clock, headline: "Sprint peak crossed 31.5 km/h", detail: "Edge speed detector" },
      { id: "fallback_2", type: "MILESTONE_PASS_MASTERY", clock: acts[1].clock, headline: "Five consecutive line-breaking passes", detail: "PDR ≥78 streak" },
      { id: "fallback_3", type: "MILESTONE_PRESS_DOMINANCE", clock: acts[2].clock, headline: "Sustained press siege converted", detail: "30s final-third threshold" },
    ],
  };
}

export default function MatchRecapStudioModal({
  open, onClose, onLoadAct, lang, tick, events,
}: Props) {
  const [data, setData] = useState<MatchRecapStoryboard | null>(null);
  const [audit, setAudit] = useState<PipelineAudit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const live = useRef({ tick, events });
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, panelRef);

  useEffect(() => {
    live.current = { tick, events };
  }, [tick, events]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setAudit(null);
    fetch(`${API_BASE}/api/match-recap`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<MatchRecapStoryboard>;
      })
      .then((storyboard) => {
        if (!cancelled) setData(storyboard);
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) return;
        setData(fallbackStoryboard(live.current.tick, live.current.events));
        setError("Storyboard service unreachable — showing the edge-generated 3-act cut.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    fetch(`${API_BASE}/api/health/pipeline-audit`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Audit HTTP ${r.status}`);
        return r.json() as Promise<PipelineAudit>;
      })
      .then((packet) => {
        if (!cancelled) setAudit(packet);
      })
      .catch(() => {
        if (!cancelled) setAudit(null);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, attempt]);

  const teleprompter = useMemo(() => {
    if (!data) return "";
    const lines = [
      data.title,
      data.subtitle,
      `${data.timecode} · NLA ${data.score.NLA}–${data.score.MCS} MCS`,
      "",
      "MILESTONES",
      ...data.milestones.map((m) => `• ${m.clock} — ${m.headline}: ${m.detail}`),
      "",
      ...data.acts.flatMap((act) => [
        `ACT ${act.act} · ${act.clock} · ${act.title}`,
        act.subtitle,
        act.localized_commentary?.[lang] ?? act.analyst_tactical_summary ?? "",
        `PDR ${act.pdr.toFixed(0)}% · ΔxT ${act.delta_xt.toFixed(2)} · Ghost ${act.ghost_pass.delta_xt.toFixed(3)} xT`,
        "",
      ]),
      `MODEL: ${data.model}`,
    ];
    return lines.join("\n");
  }, [data, lang]);

  const buildDossier = () => {
    if (!data) return null;
    const metadata = tick?.match_metadata;
    const sorted = [...data.acts].sort((a, b) => b.delta_xt - a.delta_xt);
    const topDelta = sorted.slice(0, 3).map((act) => ({
      clock: act.clock,
      player: act.player_name,
      team: act.team,
      type: act.event_type,
      delta_xt: act.delta_xt,
      pdr: act.pdr,
      ghost_delta_xt: act.ghost_pass.delta_xt,
    }));
    const ghostAct = data.acts.find((act) => act.ghost_pass) ?? data.acts[0];
    const stageB = audit?.stage_b_summary ?? {
      peak_chaos_index: Number(Math.max(...data.acts.map((act) => act.chaos)).toFixed(3)),
      team_ppda: {},
      top_delta_xt: topDelta,
      ghost_counterfactual: ghostAct ? {
        clock: ghostAct.clock,
        team: ghostAct.team,
        player_id: ghostAct.player_id,
        player_name: ghostAct.player_name,
        target_id: ghostAct.ghost_pass.target_id,
        actual_delta_xt: ghostAct.ghost_pass.actual_delta_xt ?? ghostAct.delta_xt,
        ghost_delta_xt: ghostAct.ghost_pass.ghost_delta_xt ?? ghostAct.ghost_pass.delta_xt,
        net_xt_gain: ghostAct.ghost_pass.net_xt_gain
          ?? (ghostAct.ghost_pass.delta_xt - ghostAct.delta_xt),
        completion_probability: ghostAct.ghost_pass.completion_probability ?? null,
        receiver_target_xy: ghostAct.ghost_pass.receiver_target_xy
          ?? ghostAct.ghost_pass.end,
      } : null,
    };
    const trace = audit?.agent_trace;
    return {
      schema_version: "aether.audit.dossier.v1",
      artifact: "AETHER PITCH — Full Match & Foundry Audit Dossier",
      generated_at: new Date().toISOString(),
      provenance: {
        league: "AETHER Synthetic League",
        teams: ["North Larchmont Athletic (NLA)", "Meridian City SC (MCS)"],
        data_path: "Stage A 10Hz synthetic feed → Stage B deterministic math → Stage C Foundry router → Stage D WebGL → Stage E Atlas",
        synthetic: metadata?.synthetic ?? true,
        no_external_video: true,
      },
      match_summary: audit?.match_summary ?? {
        home: metadata?.home_team.short_name ?? "NLA",
        away: metadata?.away_team.short_name ?? "MCS",
        competition: metadata?.competition ?? "AETHER Synthetic League",
        venue: metadata?.venue ?? "AETHER 3D DIGITAL TWIN",
        clock: data.timecode,
        score: data.score,
        synthetic_provenance: metadata?.synthetic ?? true,
        data_source: metadata?.data_source ?? "Stage A deterministic 10Hz synthetic engine",
        provenance: "No real footage, third-party broadcast marks, or external video assets.",
      },
      stage_b: stageB,
      storyboard: {
        title: data.title,
        subtitle: data.subtitle,
        timecode: data.timecode,
        score: data.score,
        model: data.model,
        milestones: data.milestones,
        acts: data.acts.map((act) => ({
          act: act.act,
          title: act.title,
          subtitle: act.subtitle,
          clock: act.clock,
          team: act.team,
          event_type: act.event_type,
          player_name: act.player_name,
          pdr: act.pdr,
          delta_xt: act.delta_xt,
          chaos: act.chaos,
          ghost_pass: act.ghost_pass,
          camera_mode: act.camera_mode,
          localized_commentary: act.localized_commentary,
        })),
      },
      foundry_execution: {
        trace_id: trace?.trace_id ?? "edge-local",
        mode: trace?.mode ?? "edge",
        model: trace?.model ?? data.model,
        anchor_clock: trace?.anchor_clock ?? data.timecode,
        gate: trace?.gate ?? null,
        handoff_chain: trace?.handoff_chain ?? [],
        grounding: trace?.grounding ?? null,
        guardrail: trace?.guardrail ?? null,
        latency_p95: audit?.latency_p95 ?? {},
        handoff_counts: audit?.handoff_counts ?? null,
        gate_efficiency: audit?.gate_efficiency ?? null,
        stage_timings: audit?.audit ?? null,
        stage_modes: audit?.stage_modes ?? {},
        azure: audit?.azure ?? null,
      },
      compliance: {
        synthetic_data_compliance: audit?.synthetic_data_compliance ?? true,
        no_external_video: true,
        fictional_entities: true,
        disclaimer: metadata?.disclaimer
          ?? "All teams, players, kits, marks and competition names are fictional.",
        human_review: "Human-in-the-loop review required before publishing generated commentary.",
      },
    };
  };

  const downloadFile = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportTeleprompter = () => {
    if (!teleprompter) return;
    downloadFile(`aether-pitch-recap-${Date.now()}.txt`, teleprompter, "text/plain;charset=utf-8");
  };

  const exportDossier = (format: "json" | "md") => {
    const dossier = buildDossier();
    if (!dossier) return;
    const stamp = Date.now();
    if (format === "json") {
      downloadFile(
        `aether-pitch-audit-dossier-${stamp}.json`,
        JSON.stringify(dossier, null, 2),
        "application/json;charset=utf-8",
      );
      return;
    }
    const ghost = dossier.stage_b.ghost_counterfactual;
    const foundry = dossier.foundry_execution;
    const lines = [
      "# AETHER PITCH — Full Match & Foundry Audit Dossier",
      "",
      `Generated: ${dossier.generated_at}`,
      `Schema: ${dossier.schema_version}`,
      "",
      "## 1 · Match summary",
      `- Fixture: ${dossier.match_summary.home} vs ${dossier.match_summary.away}`,
      `- Competition: ${dossier.match_summary.competition}`,
      `- Venue: ${dossier.match_summary.venue}`,
      `- Clock / score: ${dossier.match_summary.clock ?? "n/a"} · NLA ${dossier.storyboard.score.NLA}–${dossier.storyboard.score.MCS} MCS`,
      `- Synthetic provenance: ${dossier.match_summary.synthetic_provenance ? "yes" : "no"}`,
      `- Source: ${dossier.match_summary.data_source}`,
      "",
      "## 2 · Deterministic Stage B",
      `- Peak chaos index: ${dossier.stage_b.peak_chaos_index.toFixed(3)}`,
      `- Team PPDA: ${JSON.stringify(dossier.stage_b.team_ppda)}`,
      `- Top ΔxT: ${dossier.stage_b.top_delta_xt.map((row) => `${row.clock} ${row.player} ${row.delta_xt.toFixed(3)}`).join("; ") || "n/a"}`,
      ghost
        ? `- Ghost counterfactual: ${ghost.player_name ?? ghost.player_id ?? "carrier"} → ${ghost.target_id ?? "target"} · actual ${ghost.actual_delta_xt.toFixed(3)} xT · ghost ${ghost.ghost_delta_xt.toFixed(3)} xT · net ${ghost.net_xt_gain.toFixed(3)} xT · ${ghost.completion_probability?.toFixed(0) ?? "n/a"}% completion`
        : "- Ghost counterfactual: unavailable",
      "",
      "## 3 · Three-act storyboard",
      ...dossier.storyboard.acts.flatMap((act) => [
        `### Act ${act.act} — ${act.title} (${act.clock})`,
        act.subtitle,
        `PDR ${act.pdr.toFixed(0)}% · Actual ${act.delta_xt.toFixed(2)} xT · Ghost ${act.ghost_pass.delta_xt.toFixed(2)} xT · Net ${(act.ghost_pass.net_xt_gain ?? (act.ghost_pass.delta_xt - act.delta_xt)).toFixed(2)} xT`,
        act.localized_commentary?.[lang] ?? "",
        "",
      ]),
      "## 4 · Foundry + multi-agent execution",
      `- Trace: ${foundry.trace_id}`,
      `- Mode / model: ${foundry.mode} / ${foundry.model}`,
      `- Anchor: ${foundry.anchor_clock}`,
      `- Handoffs: ${foundry.handoff_chain.map((span) => `${span.agent} [${span.status}]`).join(" → ") || "edge-local"}`,
      `- Gate: ${foundry.gate ? `PDR ${foundry.gate.pdr ?? "n/a"} · ΔxT ${foundry.gate.delta_xt ?? "n/a"} · Δchaos ${foundry.gate.delta_chaos ?? "n/a"}` : "n/a"}`,
      `- Grounding: ${foundry.grounding ? `${foundry.grounding.status} (${foundry.grounding.score.toFixed(0)}%, ${foundry.grounding.checked_numbers} numbers checked)` : "n/a"}`,
      `- Guardrail: ${foundry.guardrail?.triggered ? `TRIGGERED — ${foundry.guardrail.action}` : "not triggered"}`,
      `- Handoff counts: ${JSON.stringify(foundry.handoff_counts)}`,
      `- Latency P95: ${JSON.stringify(foundry.latency_p95)}`,
      "",
      "## 5 · Compliance & provenance",
      ...Object.entries(dossier.compliance).map(([key, value]) => `- ${key}: ${String(value)}`),
      `- Data lineage: ${dossier.provenance.data_path}`,
      "",
    ];
    downloadFile(
      `aether-pitch-audit-dossier-${stamp}.md`,
      lines.join("\n"),
      "text/markdown;charset=utf-8",
    );
  };

  if (!open) return null;

  return (
    <div
      className="modal-backdrop z-[70]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recap-modal-title"
      aria-busy={loading}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-modal-panel
        className="modal-lux clip-ea relative flex max-h-[92vh] w-[min(1040px,calc(100vw-24px))] flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h3 id="recap-modal-title" className="flex items-center gap-2 font-display text-[18px] font-bold uppercase tracking-[0.18em] text-white">
              <Clapperboard size={18} className="text-gold" /> Studio Match Recap
            </h3>
            <div className="modal-kicker mt-0.5">
              Milestone engine · ghost-pass counterfactuals · time travel
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => exportDossier("json")}
              disabled={!data || loading}
              className="modal-action clip-skew"
              data-tone="gold"
              aria-label="Export full match and Foundry audit dossier as JSON"
            >
              <Download size={12} /> <span className="hidden sm:inline">Dossier</span> JSON
            </button>
            <button
              onClick={() => exportDossier("md")}
              disabled={!data || loading}
              className="modal-action clip-skew"
              aria-label="Export full match and Foundry audit dossier as Markdown"
            >
              <FileText size={12} /> <span className="hidden sm:inline">Dossier</span> MD
            </button>
            <button
              onClick={exportTeleprompter}
              disabled={!teleprompter || loading}
              className="modal-action clip-skew"
              data-tone="gold"
              aria-label="Export recap teleprompter"
            >
              <Download size={12} /> <span className="hidden sm:inline">Export</span> Teleprompter
            </button>
            <button onClick={onClose} className="modal-close clip-skew" aria-label="Close studio match recap">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {loading && (
            <div className="flex h-[280px] items-center justify-center gap-2 font-tech text-[12px] text-tactical" role="status" aria-live="polite">
              <Loader2 size={18} className="animate-spin" /> Compiling 22-player snapshots and ghost lanes…
            </div>
          )}
          {error && (
            <div role="alert" className="mb-3 flex items-center justify-between gap-2 border border-gold/30 bg-gold/10 px-3 py-2 font-tech text-[10px] text-gold">
              <span>{error}</span>
              <button onClick={() => setAttempt((a) => a + 1)} className="flex shrink-0 items-center gap-1 hover:text-white">
                <RefreshCw size={11} /> retry
              </button>
            </div>
          )}
          {data && !loading && (
            <>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="font-display text-[22px] font-bold uppercase leading-tight tracking-wide text-white sm:text-[26px]">
                    {data.title}
                  </div>
                  <div className="font-tech text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {data.subtitle}
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <div className="font-display text-[24px] font-bold text-white">
                    {data.score.NLA}–{data.score.MCS}
                  </div>
                  <div className="font-tech text-[9px] uppercase tracking-[0.2em] text-slate-500">
                    {data.timecode} · {data.model}
                  </div>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {data.acts.map((act) => (
                  <div key={act.act} className="clip-chamfer flex flex-col border border-white/10 bg-white/[0.025] p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold">
                        Act {act.act}
                      </span>
                      <span className="font-tech text-[10px] font-bold text-tactical">{act.clock}</span>
                    </div>
                    <div className="mt-1 font-display text-[16px] font-bold uppercase leading-tight text-white">
                      {act.title}
                    </div>
                    <div className="mt-1 min-h-[30px] text-[10.5px] leading-snug text-slate-400">
                      {act.subtitle}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1 border-t border-white/10 pt-2">
                      {[
                        ["PDR", `${act.pdr.toFixed(0)}%`],
                        ["ΔxT", `${act.delta_xt >= 0 ? "+" : ""}${act.delta_xt.toFixed(2)}`],
                        ["GHOST", `${act.ghost_pass.delta_xt >= 0 ? "+" : ""}${act.ghost_pass.delta_xt.toFixed(2)}`],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div className="font-display text-[8px] uppercase tracking-wider text-slate-600">{k}</div>
                          <div className="font-tech text-[12px] font-bold text-pitch">{v}</div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 line-clamp-3 text-[10.5px] leading-relaxed text-slate-300">
                      {act.localized_commentary?.[lang] ?? act.analyst_tactical_summary}
                    </p>
                    <button
                      onClick={() => { onLoadAct(act, data); onClose(); }}
                      className="clip-skew mt-2 flex items-center justify-center gap-1 bg-gold/15 py-1.5 font-tech text-[10px] font-bold uppercase tracking-wider text-gold transition hover:bg-gold/30"
                    >
                      <Play size={11} /> Load Act · Time Travel
                    </button>
                  </div>
                ))}
              </div>

              <div className="clip-chamfer border border-tactical/20 bg-tactical/[0.04] p-3">
                <div className="mb-2 flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.22em] text-tactical">
                  <Sparkles size={12} /> Milestone Engine
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {data.milestones.map((m) => (
                    <div key={m.id} className="border-l-2 border-tactical/50 pl-2">
                      <div className="font-tech text-[9px] font-bold text-tactical">{m.clock}</div>
                      <div className="text-[10.5px] font-semibold leading-snug text-slate-200">{m.headline}</div>
                      <div className="font-tech text-[9px] leading-snug text-slate-500">{m.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
