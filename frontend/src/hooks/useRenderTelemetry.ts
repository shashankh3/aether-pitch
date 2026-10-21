"use client";
// AETHER PITCH — render telemetry.
// A measured frame-rate readout, not a hard-coded "60 FPS" claim. The sample
// is taken from the real requestAnimationFrame loop, so the number a judge
// sees is the number the machine is actually delivering.

import { useEffect, useState } from "react";

export interface RenderTelemetry {
  fps: number;
  frameMs: number;
  samples: number;
}

const WINDOW_MS = 1000;

export function useRenderTelemetry(): RenderTelemetry {
  const [telemetry, setTelemetry] = useState<RenderTelemetry>({
    fps: 0,
    frameMs: 0,
    samples: 0,
  });

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    let windowStart = last;
    let worst = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const delta = now - last;
      last = now;
      frames += 1;
      if (delta > worst) worst = delta;
      if (now - windowStart >= WINDOW_MS) {
        const elapsed = now - windowStart;
        setTelemetry({
          fps: Math.round((frames * 1000) / elapsed),
          frameMs: Number((elapsed / Math.max(1, frames)).toFixed(1)),
          samples: frames,
        });
        frames = 0;
        worst = 0;
        windowStart = now;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return telemetry;
}
