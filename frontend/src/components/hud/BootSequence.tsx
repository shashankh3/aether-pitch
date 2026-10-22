"use client";

import { useEffect, useRef, useState } from "react";
import AetherMark from "@/components/hud/AetherMark";

const STAGES = [
  { code: "A", label: "Ingest 10 Hz" },
  { code: "B", label: "Tactical Math" },
  { code: "C", label: "Grounded AI" },
  { code: "D", label: "WebGL Render" },
  { code: "E", label: "Personalize" },
];

export default function BootSequence() {
  const [phase, setPhase] = useState<"boot" | "leave" | "done">("boot");
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (new URLSearchParams(window.location.search).get("overlay") === "alpha") {
      setPhase("done");
      return;
    }
    const timer = setTimeout(() => setPhase("leave"), reduced.current ? 550 : 2450);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "leave") return;
    const timer = setTimeout(() => setPhase("done"), reduced.current ? 80 : 640);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "boot") return;
    const skip = () => setPhase("leave");
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });
    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, [phase]);

  if (phase === "done") return null;

  return (
    <div
      className={`boot-screen ${phase === "leave" ? "boot-leave pointer-events-none" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="AETHER PITCH spatial broadcast engine initializing"
    >
      <div className="boot-content">
        <div className="boot-mark">
          <AetherMark size={68} />
        </div>

        <div className="mt-5">
          <div className="boot-wordmark">
            AETHER <span className="text-hud-cyan">PITCH</span>
          </div>
          <div className="boot-subtitle">Spatial Broadcast System</div>
        </div>

        <div className="boot-bar" aria-hidden />
        <div className="boot-stages" aria-hidden>
          {STAGES.map((stage, index) => (
            <div
              key={stage.code}
              className="boot-stage"
              data-live={index === STAGES.length - 1}
              style={{ animationDelay: `${620 + index * 250}ms` }}
            >
              {stage.code} · {stage.label}
            </div>
          ))}
        </div>

        <div className="boot-meta">
          <span>NLA vs MCS // Synthetic League</span>
          <span className="hidden sm:inline">Seed 42 // 10.00 Hz</span>
          <span className="text-hud-cyan/80">Zero-hallucination pipeline</span>
        </div>
      </div>

      <div className="boot-skip">Click or press any key to skip</div>

      <div className="pointer-events-none absolute left-5 top-5 font-mono text-[8px] uppercase tracking-[0.24em] text-slate-600">
        Aether // Horizon 7.0
      </div>
      <div className="pointer-events-none absolute right-5 top-5 font-mono text-[8px] uppercase tracking-[0.24em] text-slate-600">
        Boot 04 // Spatial
      </div>
    </div>
  );
}
