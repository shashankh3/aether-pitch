"use client";
// AETHER PITCH — Interactive Spatial "What-If" Counterfactual Sandbox HUD.
//
// A broadcast-calibrated glass panel that floats above the pitch while a judge
// relocates a player. It reports the live Stage B deltas and can hand the
// counterfactual straight to the Stage C war-room.
//
// The panel subscribes to the sandbox store and re-renders on its own, so the
// page and the 3D scene never re-render during a 60 fps drag.

import { useEffect, useState } from "react";
import { Crosshair, GitCompareArrows, Send, Undo2, X, TrendingUp, TrendingDown } from "lucide-react";
import {
  evaluateSandbox, subscribeSandbox, type SandboxDelta,
} from "@/lib/sandboxStore";
import type { MatchTick } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  tick: MatchTick | null;
  active: boolean;
  onReset: () => void;
  onClose: () => void;
  onSubmit: (delta: SandboxDelta) => void;
}

export default function CounterfactualDeltaHUD({
  tick, active, onReset, onClose, onSubmit,
}: Props) {
  const [delta, setDelta] = useState<SandboxDelta | null>(null);

  useEffect(() => {
    if (!active) {
      setDelta(null);
      return;
    }
    const refresh = () => setDelta(evaluateSandbox(tick));
    refresh();
    const unsub = subscribeSandbox(refresh);
    // The pitch-control rescan is throttled to ~12 Hz; the 3D position itself
    // is interpolated at 60 fps inside the avatar's own useFrame.
    const timer = setInterval(refresh, 80);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [active, tick]);

  if (!active) return null;

  const up = (delta?.deltaXT ?? 0) >= 0;
  const ctrlUp = (delta?.deltaControlPct ?? 0) >= 0;

  return (
    <div
      className="pointer-events-auto fixed bottom-[92px] left-1/2 z-[45] w-[min(760px,calc(100vw-24px))] -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div className="clip-ea border border-cyan-300/40 bg-slate-950/92 px-3 py-2.5 shadow-[0_0_38px_rgba(0,229,255,0.16)] backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
            <Crosshair size={12} /> What-If Sandbox
            {delta && (
              <span className="font-tech text-[9px] font-normal normal-case tracking-wider text-slate-500">
                {delta.team} #{delta.shirtNumber} {delta.playerName}
              </span>
            )}
          </span>
          <button
            onClick={onClose}
            aria-label="Exit the counterfactual sandbox"
            className="p-0.5 text-slate-500 transition hover:text-white"
          >
            <X size={14} />
          </button>
        </div>

        {!delta ? (
          <p className="font-tech text-[10px] leading-relaxed text-slate-400">
            Sandbox armed — click any avatar on the pitch and drag it to a new
            position. The Stage B twin recomputes Expected Threat and Pitch
            Control against the relocated player.
          </p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-tech text-[9.5px] uppercase tracking-wider text-slate-500">
              <span>
                Displacement{" "}
                <b className="text-slate-200">
                  ({delta.originX.toFixed(1)}, {delta.originY.toFixed(1)}) → ({delta.x.toFixed(1)}, {delta.y.toFixed(1)})
                </b>
              </span>
              <span>
                Moved <b className="text-slate-200">{delta.displacementM.toFixed(1)} m</b>
              </span>
              <span>
                xT at position{" "}
                <b className="text-slate-200">
                  {delta.originalXT.toFixed(3)} → {delta.newXT.toFixed(3)}
                </b>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              <div className="border border-white/10 bg-black/35 px-2 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-tech text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Δ Expected Threat
                  </span>
                  {up ? (
                    <TrendingUp size={10} className="text-pitch" />
                  ) : (
                    <TrendingDown size={10} className="text-crimson" />
                  )}
                </div>
                <div
                  className={cn(
                    "font-display text-[16px] font-bold tabular-nums",
                    up ? "text-pitch" : "text-crimson"
                  )}
                >
                  {up ? "+" : ""}
                  {delta.deltaXT.toFixed(3)} xT
                </div>
              </div>

              <div className="border border-white/10 bg-black/35 px-2 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-tech text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Δ {delta.team} Pitch Control
                  </span>
                  {ctrlUp ? (
                    <TrendingUp size={10} className="text-cyan-300" />
                  ) : (
                    <TrendingDown size={10} className="text-gold" />
                  )}
                </div>
                <div
                  className={cn(
                    "font-display text-[16px] font-bold tabular-nums",
                    ctrlUp ? "text-cyan-300" : "text-gold"
                  )}
                >
                  {ctrlUp ? "+" : ""}
                  {delta.deltaControlPct.toFixed(1)} pts
                </div>
                <div className="font-tech text-[7.5px] uppercase tracking-wider text-slate-600">
                  {delta.originalControlPct.toFixed(1)}% → {delta.newControlPct.toFixed(1)}%
                </div>
              </div>

              <div className="border border-white/10 bg-black/35 px-2 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-tech text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Opponent Control
                  </span>
                  <GitCompareArrows size={10} className="text-slate-500" />
                </div>
                <div className="font-display text-[16px] font-bold tabular-nums text-slate-300">
                  {delta.opponentControlPct.toFixed(1)}%
                </div>
                <div className="font-tech text-[7.5px] uppercase tracking-wider text-slate-600">
                  {delta.team === "NLA" ? "MCS" : "NLA"} territory
                </div>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => onSubmit(delta)}
                className="clip-skew flex items-center gap-1 bg-cyan-300/20 px-2 py-1 font-tech text-[9.5px] font-bold uppercase tracking-wider text-cyan-300 transition hover:bg-cyan-300/35"
                title="Hand this counterfactual to the Stage C war-room for adjudication"
              >
                <Send size={11} /> Send to War-Room
              </button>
              <button
                onClick={onReset}
                className="clip-skew flex items-center gap-1 bg-white/[0.06] px-2 py-1 font-tech text-[9.5px] font-bold uppercase tracking-wider text-slate-300 transition hover:bg-white/[0.12]"
              >
                <Undo2 size={11} /> Revert
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
