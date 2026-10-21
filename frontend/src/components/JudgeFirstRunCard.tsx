"use client";
// AETHER PITCH — first-run judge card.
// Judges arrive with ~2 minutes. This dismissible card routes them straight
// to the live proof for each prize track instead of making them explore. It
// shows once (localStorage) so the fan-first default stays uncluttered.

import { useEffect, useState } from "react";
import {
  FlaskConical, Swords, CloudCog, Play, X, Sparkles, ArrowRight,
} from "lucide-react";
import { useHud } from "@/lib/hudContext";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "aether.judgeCard.dismissed.v1";

interface ProofRow {
  id: "foundry" | "multi-agent" | "cloud-native";
  label: string;
  detail: string;
  tab: "data" | "prod" | "copilot";
  icon: React.ReactNode;
  accent: string;
}

const PROOFS: ProofRow[] = [
  {
    id: "foundry",
    label: "Best Use of Microsoft Foundry",
    detail: "Prompt Shield, RAI scorecard, 4-node grounded handoff",
    tab: "data",
    icon: <FlaskConical size={13} />,
    accent: "text-tactical border-tactical/40 bg-tactical/10",
  },
  {
    id: "multi-agent",
    label: "Best Multi-Agent System",
    detail: "3-agent bench war-room + adversarial arbitration",
    tab: "prod",
    icon: <Swords size={13} />,
    accent: "text-crimson border-crimson/40 bg-crimson/10",
  },
  {
    id: "cloud-native",
    label: "Best Azure Cloud Native",
    detail: "6-second cloud-outage drill, measured failover",
    tab: "copilot",
    icon: <CloudCog size={13} />,
    accent: "text-gold border-gold/40 bg-gold/10",
  },
];

export default function JudgeFirstRunCard({ onRunAutopilot }: { onRunAutopilot?: () => void }) {
  const { openControlCenter } = useHud();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (!dismissed) {
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* storage unavailable — the card simply shows again next time */
    }
  };

  const openProof = (row: ProofRow) => {
    openControlCenter(row.tab);
    dismiss();
  };

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[64px] z-[58] flex justify-center px-3"
      role="dialog"
      aria-label="Judge quick start"
    >
      <div className="clip-ea pointer-events-auto w-[min(560px,calc(100vw-24px))] border border-gold/35 bg-slate-950/94 p-3 shadow-[0_0_40px_rgba(255,194,77,0.18)] backdrop-blur-xl">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-display text-[12px] font-bold uppercase tracking-[0.22em] text-gold">
              <Sparkles size={13} /> 60 seconds to the proof
            </div>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-400">
              AETHER PITCH runs a live synthetic football match on 100% self-generated
              10&nbsp;Hz telemetry. Open any prize track to see its evidence first-hand.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss quick start"
            className="shrink-0 p-1 text-slate-500 transition hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-1">
          {PROOFS.map((row) => (
            <button
              key={row.id}
              onClick={() => openProof(row)}
              className={cn(
                "flex w-full items-center gap-2 border px-2 py-1.5 text-left transition",
                row.accent,
                "hover:brightness-125"
              )}
            >
              {row.icon}
              <span className="min-w-0 flex-1">
                <span className="block font-tech text-[10px] font-bold uppercase tracking-wider">
                  {row.label}
                </span>
                <span className="block font-tech text-[8.5px] text-slate-500">
                  {row.detail}
                </span>
              </span>
              <ArrowRight size={13} className="shrink-0 opacity-70" />
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
          <span className="font-tech text-[8.5px] uppercase tracking-wider text-slate-600">
            or let the studio drive itself
          </span>
          <button
            onClick={() => {
              dismiss();
              onRunAutopilot?.();
            }}
            className="clip-skew flex items-center gap-1 bg-gold/20 px-2 py-1 font-tech text-[9.5px] font-bold uppercase tracking-wider text-gold transition hover:bg-gold/35"
          >
            <Play size={11} /> Run the 80s autopilot
          </button>
        </div>
      </div>
    </div>
  );
}
