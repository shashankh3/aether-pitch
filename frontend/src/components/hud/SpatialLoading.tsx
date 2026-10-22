"use client";

export default function SpatialLoading() {
  return (
    <div
      className="spatial-loading"
      role="status"
      aria-live="polite"
      aria-label="Calibrating the spatial pitch engine"
    >
      <div className="spatial-horizon" aria-hidden />
      <div className="spatial-floor" aria-hidden />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="hud-kicker animate-breathe !text-hud-cyan">Spatial engine</div>
          <div className="mt-2 font-display text-[26px] font-bold uppercase tracking-[0.22em] text-white sm:text-[34px]">
            Calibrating pitch
          </div>
          <div className="mx-auto mt-4 h-px w-44 overflow-hidden bg-white/10">
            <span className="block h-full w-1/3 animate-[signal-scan_1.8s_ease-in-out_infinite] bg-hud-cyan shadow-[0_0_12px_#00F0FF]" />
          </div>
          <div className="mt-3 font-tech text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500">
            22 rigs · 10 Hz synthetic feed · WebGL
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center font-mono text-[8px] uppercase tracking-[0.24em] text-slate-600">
        Aether // spatial pipeline
      </div>
    </div>
  );
}
