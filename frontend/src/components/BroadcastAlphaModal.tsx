"use client";
// AETHER PITCH v4.0 — Broadcast Alpha / Chroma-Key production mode +
// SMPTE 50fps timecode + machine-readable AETHER_RENDER_PARTNER_V2 JSON.
//
// The alpha mode hides every opaque surface (turf fill, stands, crowd, boards,
// avatar bodies) and keeps ONLY the volumetric AR graphics — proving the stack
// can sit downstream of an OBS / Vizrt / Singular.live production truck with
// the WebGL canvas composited over the real broadcast camera feed.

import { useEffect, useRef, useState } from "react";
import { Clapperboard, Copy, Check, X, Radio } from "lucide-react";
import { telemetry } from "@/lib/telemetry";
import type { Insight } from "@/lib/types";

/* ------------------------------------------- SMPTE 50fps timecode chip */
export function SMPTEChip({ visible }: { visible: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const startRef = useRef<number>(0);
  const BASE_S = 1 * 3600 + 14 * 60 + 22; // 01:14:22:00
  useEffect(() => {
    if (!visible) return;
    startRef.current = performance.now();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const elapsed = (performance.now() - startRef.current) / 1000;
      const total = BASE_S + elapsed;
      const h = Math.floor(total / 3600) % 24;
      const m = Math.floor((total % 3600) / 60);
      const s = Math.floor(total % 60);
      const f = Math.floor((total % 1) * 50);
      if (ref.current) {
        ref.current.textContent =
          `TC ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")} • 50fps SYNC LOCKED`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);
  if (!visible) return null;
  return (
    <div className="clip-skew flex items-center gap-1.5 border border-gold/40 bg-slate-950/85 px-2 py-1 backdrop-blur-xl">
      <Radio size={11} className="animate-breathe text-gold" />
      <span ref={ref} className="font-tech text-[11px] font-bold tracking-wider text-gold">
        TC 01:14:22:00 • 50fps SYNC LOCKED
      </span>
    </div>
  );
}

/* ---------------------------------------- production overlay JSON builder */
export function buildProductionPacket(insight: Insight | null) {
  const b = telemetry.ball;
  const poss = telemetry.match.possession;
  const rings = Array.from(telemetry.players.values())
    .filter((p) => telemetry.match.carrier === p.id || p.speed_kmh >= 30 || p.playstyle_badge)
    .slice(0, 6)
    .map((p) => ({
      id: p.id,
      pos_m: [Number((p.x - 52.5).toFixed(2)), Number((p.y - 34).toFixed(2)), 0.0],
      speed_kmh: p.speed_kmh,
      style: p.speed_kmh >= 30 ? "CRIMSON_SPRINT_PULSE" : telemetry.match.carrier === p.id ? "GOLD_CARRIER_RING" : "TEAM_STANDARD",
    }));
  const peak = b.is_lofted ? 6.5 : 1.2;
  const lt = insight?.stage_d_broadcast_overlay;
  return {
    protocol: "AETHER_RENDER_PARTNER_V2",
    smpte_timecode: (() => {
      const total = telemetry.match.t_match;
      const h = Math.floor(total / 3600) % 24;
      const m = Math.floor((total % 3600) / 60);
      const s = Math.floor(total % 60);
      const f = Math.floor((total % 1) * 50);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
    })(),
    frame_rate: 50,
    sync_ttl_ms: 4500,
    camera_calibration_homography: [
      [0.098, -0.014, -52.5],
      [0.004, 0.064, -34.0],
      [0.0001, 0.0008, 1.0],
    ],
    ar_world_layers: {
      player_rings: rings,
      ballistic_arc: b.pass_start && b.pass_end
        ? {
            start_m: [b.pass_start[0] - 52.5, b.pass_start[1] - 34, 0.0],
            end_m: [b.pass_end[0] - 52.5, b.pass_end[1] - 34, 0.0],
            peak_z_m: peak,
            is_lofted: b.is_lofted,
          }
        : null,
      counterfactual_ghost_arc: telemetry.ghost
        ? {
            start_m: [b.x - 52.5, b.y - 34, 0.0],
            end_m: [telemetry.ghost.x - 52.5, telemetry.ghost.y - 34, 0.0],
            delta_xt: telemetry.ghost.delta_xt,
          }
        : null,
      possession_team: poss,
      chaos_index: telemetry.metrics?.chaos_index ?? null,
    },
    lower_third_graphic: lt
      ? {
          template_id:
            lt.overlay_type === "CHAOS_OVERLOAD_ALERT" ? "PL_STUDIO_CHAOS_ALERT_L3"
            : lt.overlay_type === "PRESSING_TRAP_ALERT" ? "PL_STUDIO_PRESS_TRAP_L3"
            : lt.overlay_type === "TACTICAL_INVERSION_FLAG" ? "PL_STUDIO_INVERSION_L3"
            : "PL_STUDIO_TACTICAL_PULSE_L3",
          headline: lt.lower_third_title,
          subline: lt.lower_third_subtitle,
          persona_variant: "TACTICAL_ANALYST",
          insight_id: insight?.id ?? null,
        }
      : null,
  };
}

/* ------------------------------------------------------- inspector modal */
interface Props {
  open: boolean;
  onClose: () => void;
  insight: Insight | null;
}

export default function BroadcastAlphaModal({ open, onClose, insight }: Props) {
  const [copied, setCopied] = useState(false);
  const [packet, setPacket] = useState<string>("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) return;
    const refresh = () => setPacket(JSON.stringify(buildProductionPacket(insight), null, 2));
    refresh();
    timer.current = setInterval(refresh, 500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [open, insight?.id]);

  if (!open) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(packet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-8 backdrop-blur-sm">
      <div className="clip-ea flex max-h-full w-[640px] flex-col border border-gold/40 bg-slate-950/95 shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h3 className="flex items-center gap-2 font-display text-[19px] font-bold uppercase tracking-wide text-gold">
              <Clapperboard size={16} /> Production Overlay JSON
            </h3>
            <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-slate-500">
              AETHER_RENDER_PARTNER_V2 · Singular.live / Vizrt machine-readable
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={copy}
              className="clip-skew flex items-center gap-1.5 bg-pitch/20 px-2.5 py-1 font-tech text-[11px] font-bold uppercase tracking-wider text-pitch transition hover:bg-pitch/35"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={onClose} className="p-1 text-slate-400 transition hover:bg-white/10 hover:text-white">
              <X size={16} />
            </button>
          </div>
        </div>
        <pre className="scroll-slim min-h-0 flex-1 overflow-auto p-4 font-mono text-[10.5px] leading-relaxed text-slate-300">
          {packet}
        </pre>
      </div>
    </div>
  );
}
