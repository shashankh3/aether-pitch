"use client";
// AETHER PITCH v5.0 — Judge Autopilot step banner. The 6-step engine
// (timers, voiceover, step choreography) lives in the page orchestrator so
// the TopBar trigger and the banner share one source of truth.

import { cn } from "@/lib/utils";

export interface AutopilotStep {
  label: string;
  title: string;
  rubric: string;
  voiceover: string;
  at: number;
  duration: number;
}

export const AUTOPILOT_STEPS: AutopilotStep[] = [
  {
    label: "LIVE 3D INGEST",
    title: "AI Broadcast Activation",
    rubric: "10Hz 3D tracking · 22 players",
    voiceover: "Welcome to AETHER PITCH. The engine just ingested twenty-two players at ten hertz, and the AI broadcast is live.",
    at: 0,
    duration: 10,
  },
  {
    label: "GOD-MODE SCENARIO",
    title: "Chaos Counter Injection",
    rubric: "God Mode scenario + live control surface",
    voiceover: "Judge trigger: chaos counter. Watch the control mesh flip, the defensive lasers fire, and the line-breaking pass arrive in under two seconds.",
    at: 10,
    duration: 10,
  },
  {
    label: "FREEZE & TELESTRATE",
    title: "Time Machine + Spatial Beam",
    rubric: "DVR freeze · spotlight · ghost counterfactual",
    voiceover: "Freeze the live feed. The DVR holds every ten-hertz frame. We spotlight the key players and draw the optimal ghost lane in 3D space.",
    at: 20,
    duration: 12,
  },
  {
    label: "BROADCAST ALPHA",
    title: "Transparent AR Compositing",
    rubric: "Chromakey / alpha overlay for live TV",
    voiceover: "This is broadcast alpha. Every opaque surface is stripped away, leaving only the AR layer ready for a real television compositor.",
    at: 32,
    duration: 12,
  },
  {
    label: "FAN PERSONALIZATION",
    title: "Metric Lock + Club Lens + i18n",
    rubric: "Stage E · ES / AR / HI localization",
    voiceover: "One fan wants pass quality, another wants chaos, another wants their club lens. Stage E adapts the same moment in Spanish, Arabic, and Hindi without freezing the stream.",
    at: 44,
    duration: 10,
  },
  {
    label: "3-ACT FINALE",
    title: "Championship Storyboard",
    rubric: "Milestones · recap · rubric proof",
    voiceover: "And the finale: three acts, full player snapshots, ghost-pass counterfactuals, and a downloadable teleprompter. That is the AETHER PITCH championship cut.",
    at: 54,
    duration: 6,
  },
];

interface Props {
  active: boolean;
  currentStep: number;
  elapsed: number;
}

export default function JudgeAutopilotTour({ active, currentStep, elapsed }: Props) {
  if (!active) return null;
  const step = AUTOPILOT_STEPS[Math.max(0, currentStep)] ?? AUTOPILOT_STEPS[0];

  return (
    <div className="pointer-events-none fixed left-1/2 top-[64px] z-[56] w-[min(620px,calc(100vw-24px))] -translate-x-1/2">
      <div
        className={cn(
          "clip-ea border bg-slate-950/92 px-3 py-2 shadow-[0_0_38px_rgba(255,194,77,0.18)] backdrop-blur-xl",
          "border-gold/45",
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-between">
          <span className="font-display text-[9px] font-bold uppercase tracking-[0.28em] text-gold">
            Rubric {currentStep + 1}/6 · {step.label}
          </span>
          <span className="font-tech text-[9px] font-bold text-tactical">{step.rubric}</span>
        </div>
        <div className="mt-0.5 font-display text-[15px] font-bold uppercase tracking-wide text-white">
          {step.title}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-slate-300">
          {step.voiceover}
        </p>
        <div className="mt-1.5 h-1 overflow-hidden bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-gold via-tactical to-pitch transition-all duration-200"
            style={{ width: `${Math.min(100, (elapsed / 60) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
