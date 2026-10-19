"use client";
// AETHER PITCH v2.0 — Camera Director bar (top-right):
// 4 broadcast camera modes + volumetric AR overlay toggles
// (xT grid, ghost pass vector, defensive lasers).

import { Video, User, Orbit, Sparkles, Grid3x3, Ghost, Zap } from "lucide-react";
import type { CameraMode } from "@/lib/types";
import type { OverlayToggles } from "@/components/three/HoloPitch3D";
import { cn } from "@/lib/utils";

const CAMS: { id: CameraMode; label: string; icon: React.ReactNode; key: string }[] = [
  { id: "TELE_BROADCAST", label: "Tele Cam", icon: <Video size={14} />, key: "1" },
  { id: "PLAYER_LOCK_3RD_PERSON", label: "Pro Cam", icon: <User size={14} />, key: "2" },
  { id: "TACTICAL_DRONE_ORBIT", label: "Drone Orbit", icon: <Orbit size={14} />, key: "3" },
  { id: "AUTO_DIRECTOR", label: "Auto-Director", icon: <Sparkles size={14} />, key: "4" },
];

const TOGGLES: { id: keyof OverlayToggles; label: string; icon: React.ReactNode }[] = [
  { id: "xtGrid", label: "xT Grid", icon: <Grid3x3 size={12} /> },
  { id: "ghost", label: "Ghost Pass", icon: <Ghost size={12} /> },
  { id: "lasers", label: "Def. Lasers", icon: <Zap size={12} /> },
];

interface Props {
  mode: CameraMode;
  onMode: (m: CameraMode) => void;
  toggles: OverlayToggles;
  onToggle: (id: keyof OverlayToggles) => void;
  aiDirected: boolean;
}

export default function CameraDirectorBar({ mode, onMode, toggles, onToggle, aiDirected }: Props) {
  return (
    <div className="clip-ea pointer-events-auto w-[240px] border border-white/15 bg-slate-950/80 p-2 backdrop-blur-xl">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
          Camera Director
        </span>
        {aiDirected && (
          <span className="clip-skew animate-breathe bg-gold/20 px-1.5 py-0.5 font-tech text-[9px] font-bold uppercase tracking-wider text-gold">
            AI Take
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {CAMS.map((c) => (
          <button
            key={c.id}
            onClick={() => onMode(c.id)}
            className={cn(
              "clip-chamfer flex items-center gap-1.5 px-2 py-1.5 font-tech text-[11px] font-bold uppercase tracking-wider transition",
              mode === c.id
                ? "bg-tactical/20 text-tactical shadow-[0_0_14px_rgba(0,240,255,0.25)]"
                : "bg-white/[0.03] text-slate-400 hover:bg-white/[0.07] hover:text-slate-200"
            )}
            title={`${c.label} (key ${c.key})`}
          >
            {c.icon}
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 border-t border-white/10 pt-1.5">
        {TOGGLES.map((t) => (
          <button
            key={t.id}
            onClick={() => onToggle(t.id)}
            className={cn(
              "clip-skew flex flex-1 items-center justify-center gap-1 px-1 py-1 font-tech text-[9.5px] font-bold uppercase tracking-wider transition",
              toggles[t.id] ? "bg-pitch/20 text-pitch" : "bg-white/[0.03] text-slate-500 hover:text-slate-300"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
