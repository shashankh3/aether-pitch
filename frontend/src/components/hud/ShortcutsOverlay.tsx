"use client";
// AETHER PITCH v6.1 — keyboard shortcuts overlay (opened with "?" or the
// Control Center footer). Every shortcut the app honours, documented in-app.

import { useRef } from "react";
import { Keyboard } from "lucide-react";
import { useHud } from "@/lib/hudContext";
import { useModalA11y } from "@/lib/useModalA11y";

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Control Center",
    rows: [
      ["L", "Watch: cameras and overlays"],
      ["A", "Match stats and player intelligence"],
      ["S", "Studio: alpha, recap and pipeline"],
    ],
  },
  {
    title: "God-Mode Scenarios",
    rows: [
      ["1", "33km/h Chaos Counter"],
      ["2", "High-Press Trap"],
      ["3", "Invert Right Fullback"],
      ["4", "Studio Match Recap"],
    ],
  },
  {
    title: "Presentation",
    rows: [
      ["H", "Cinema clean-feed toggle"],
      ["F", "Fullscreen toggle"],
      ["Esc", "Exit cinema / close panels"],
      ["?", "This shortcuts panel"],
    ],
  },
];

export default function ShortcutsOverlay() {
  const { shortcutsOpen, setShortcutsOpen } = useHud();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(shortcutsOpen, () => setShortcutsOpen(false), panelRef);

  if (!shortcutsOpen) return null;

  return (
    <div
      className="modal-backdrop z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onClick={() => setShortcutsOpen(false)}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-modal-panel
        onClick={(e) => e.stopPropagation()}
        className="modal-lux clip-ea w-[min(560px,calc(100vw-32px))] p-5"
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <div className="modal-kicker mb-1 flex items-center gap-1.5 text-tactical">
              <Keyboard size={11} /> Director&apos;s Console
            </div>
            <h2 id="shortcuts-title" className="font-display text-[24px] font-bold uppercase tracking-wide text-slate-100">
              Keyboard Shortcuts
            </h2>
          </div>
          <button onClick={() => setShortcutsOpen(false)} className="modal-close clip-skew" aria-label="Close shortcuts">
            <span className="text-[13px]">✕</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.title} className="clip-chamfer border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 font-display text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
                {g.title}
              </div>
              <div className="space-y-1.5">
                {g.rows.map(([k, label]) => (
                  <div key={k} className="flex items-center gap-2">
                    <kbd className="clip-skew min-w-[26px] border border-white/15 bg-black/50 px-1.5 py-0.5 text-center font-tech text-[10px] font-bold text-tactical">
                      {k}
                    </kbd>
                    <span className="text-[11px] leading-snug text-slate-300">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 font-tech text-[9px] uppercase tracking-[0.18em] text-slate-600">
          Shortcuts pause while typing or a dialog is open.
        </p>
      </div>
    </div>
  );
}
