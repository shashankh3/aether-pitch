"use client";
// AETHER PITCH v6.0 — Production panel (STUDIO mode, left rail): broadcast
// alpha / chroma-key compositing, the machine-readable overlay JSON packet,
// the live pipeline audit and the 3-act recap studio.

import { Clapperboard, Film, LayoutGrid, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  alphaMode: boolean;
  alphaBackdrop: "checker" | "green";
  onToggleAlpha: () => void;
  onToggleBackdrop: () => void;
  onShowAlphaModal: () => void;
  onShowRubric: () => void;
  onShowRecap: () => void;
}

export default function ProductionPanel({
  alphaMode, alphaBackdrop, onToggleAlpha, onToggleBackdrop,
  onShowAlphaModal, onShowRubric, onShowRecap,
}: Props) {
  return (
    <section className="panel-enter clip-ea panel-lux w-full max-w-[352px] p-3" aria-label="Broadcast production controls">
      <div className="mb-2 border-b border-white/10 pb-2">
        <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.26em] text-gold">
          Production
        </h2>
        <p className="mt-0.5 font-tech text-[9px] uppercase tracking-[0.2em] text-slate-500">
          Compositing · packet · audit · recap
        </p>
      </div>

      <div className="space-y-1.5">
        <button
          onClick={onToggleAlpha}
          aria-pressed={alphaMode}
          className={cn(
            "clip-skew flex w-full items-center gap-2 px-2.5 py-2 font-tech text-[11px] font-bold uppercase tracking-wider transition",
            alphaMode ? "bg-gold/25 text-gold" : "bg-white/[0.03] text-slate-300 hover:text-white",
          )}
          title="Broadcast alpha / chroma-key overlay mode (?overlay=alpha)"
        >
          <Clapperboard size={13} />
          Studio Alpha
          <span className={cn("ml-auto font-tech text-[9px]", alphaMode ? "text-gold" : "text-slate-600")}>
            {alphaMode ? "ON AIR" : "OFF"}
          </span>
        </button>

        {alphaMode && (
          <button
            onClick={onToggleBackdrop}
            className="clip-skew flex w-full items-center gap-2 bg-white/[0.03] px-2.5 py-2 font-tech text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-white"
            title="Toggle transparent checkerboard / chroma green"
          >
            {alphaBackdrop === "green" ? "🟩 Chroma Green" : "▦ Alpha Checker"}
          </button>
        )}

        <button
          onClick={onShowAlphaModal}
          className="clip-skew flex w-full items-center gap-2 bg-white/[0.03] px-2.5 py-2 font-tech text-[10.5px] font-bold uppercase tracking-wider text-slate-300 transition hover:text-gold"
          title="Inspect the machine-readable AETHER_RENDER_PARTNER_V2 packet"
        >
          <LayoutGrid size={13} /> Overlay JSON Packet
        </button>

        <button
          onClick={onShowRubric}
          className="clip-skew flex w-full items-center gap-2 bg-pitch/10 px-2.5 py-2 font-tech text-[10.5px] font-bold uppercase tracking-wider text-pitch transition hover:bg-pitch/25"
          title="Run the live 5-stage pipeline audit"
        >
          <ShieldCheck size={13} /> Verify Pipeline
        </button>

        <button
          onClick={onShowRecap}
          className="clip-skew flex w-full items-center gap-2 bg-white/[0.03] px-2.5 py-2 font-tech text-[10.5px] font-bold uppercase tracking-wider text-slate-300 transition hover:text-white"
          title="3-act championship storyboard with time-travel and teleprompter export"
        >
          <Film size={13} /> Recap Studio (3-Act)
        </button>
      </div>

      <p className="mt-2 border-t border-white/10 pt-2 font-tech text-[8.5px] leading-relaxed text-slate-600">
        Alpha strips opaque surfaces and keeps the AR layer — ready for a real
        television compositor. 50fps SMPTE timecode appears while ON AIR.
      </p>
    </section>
  );
}
