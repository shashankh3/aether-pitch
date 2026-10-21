"use client";
// AETHER PITCH v4.0 — TacticalRadarMiniMap
// Translucent 2D pitch radar (230x148) anchored bottom-center:
// real-time 22-player dots, pulsing gold ring on the locked player, ball flare,
// live pass vector, dashed ghost vector, telestrator spotlight rings —
// and click-to-lock that flies the 3D camera to the picked player.

import { useEffect, useRef } from "react";
import { telemetry } from "@/lib/telemetry";
import type { TelestratorState } from "@/lib/types";

const W = 230;
const H = 148;
const MARGIN = 12;
const SX = (W - MARGIN * 2) / 105;
const SY = (H - MARGIN * 2) / 68;
const px = (x: number) => MARGIN + x * SX;
const py = (y: number) => MARGIN + y * SY;

interface Props {
  lockedId: string | null;
  telestrator: TelestratorState;
  onLock: (id: string | null) => void;
}

export default function TacticalRadarMiniMap({ lockedId, telestrator, onLock }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return; // ~30 fps
      last = now;
      ctx.clearRect(0, 0, W, H);

      // translucent pitch slab
      ctx.fillStyle = "rgba(10,30,22,0.72)";
      ctx.fillRect(MARGIN, MARGIN, W - MARGIN * 2, H - MARGIN * 2);
      ctx.strokeStyle = "rgba(235,245,255,0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px(0), py(0), 105 * SX, 68 * SY);
      ctx.beginPath();
      ctx.moveTo(px(52.5), py(0));
      ctx.lineTo(px(52.5), py(68));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px(52.5), py(34), 9.15 * SX, 0, Math.PI * 2);
      ctx.stroke();

      // pass vector + ghost vector
      const b = telemetry.ball;
      if (b.pass_start && b.pass_end) {
        ctx.strokeStyle = "#00FF85";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(px(b.pass_start[0]), py(b.pass_start[1]));
        ctx.lineTo(px(b.pass_end[0]), py(b.pass_end[1]));
        ctx.stroke();
      }
      const ghost = telemetry.ghost;
      if (ghost && performance.now() - ghost.at < 4200) {
        ctx.strokeStyle = "rgba(0,240,255,0.9)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(px(b.x), py(b.y));
        ctx.lineTo(px(ghost.x), py(ghost.y));
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // players
      for (const p of telemetry.players.values()) {
        const spot = telestrator.spotlightPlayerIds.includes(p.id);
        if (spot) {
          ctx.strokeStyle = "rgba(255,194,77,0.9)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), 6 + Math.sin(now / 180) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = p.team === "NLA" ? "#FF1E56" : "#00F0FF";
        ctx.beginPath();
        ctx.arc(px(p.x), py(p.y), 2.6, 0, Math.PI * 2);
        ctx.fill();
        if (p.speed_kmh >= 30) {
          ctx.strokeStyle = "#00FF85";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), 4.4, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (p.id === lockedId) {
          const pulse = 5 + Math.sin(now / 150) * 1.6;
          ctx.strokeStyle = "#FFC24D";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(px(p.x), py(p.y), pulse, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // ball flare
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "#FFFFFF";
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.arc(px(b.x), py(b.y), 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // DVR paused tint
      if (telemetry.playbackPaused) {
        ctx.fillStyle = "rgba(255,194,77,0.9)";
        ctx.font = "700 9px 'Rajdhani', sans-serif";
        ctx.fillText("⏸ DVR REPLAY", W / 2 - 30, H - 4);
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [lockedId, telestrator]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    let best: { id: string; d: number } | null = null;
    for (const p of telemetry.players.values()) {
      const d = Math.hypot(px(p.x) - mx, py(p.y) - my);
      if (d < 11 && (!best || d < best.d)) best = { id: p.id, d };
    }
    onLock(best ? best.id : lockedId);
  };

  return (
    <div className="clip-ea pointer-events-auto border border-white/15 bg-slate-950/85 p-1 backdrop-blur-xl">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onClick={handleClick}
        className="block cursor-crosshair"
        style={{ width: W, height: H }}
      />
      <div className="px-1 pb-0.5 font-tech text-[8.5px] font-bold uppercase tracking-[0.24em] text-slate-500">
        Tactical Radar · Click To Lock
      </div>
    </div>
  );
}
