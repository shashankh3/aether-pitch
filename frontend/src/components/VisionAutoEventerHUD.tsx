"use client";
// AETHER PITCH v3.0 — VisionAutoEventerHUD
// Stage (A/II) Computer-Vision "Auto-Eventing" pipeline viewport: a
// picture-in-picture simulated optical broadcast feed synchronized with the
// live 3D match state. Projects the 8 ball-nearest players through a 2D->3D
// homography onto the frame and draws detector-style boxes, skeletal
// keypoints, a ball tracker with velocity vector, a toggleable homography
// calibration grid, and the machine-detected auto-event emission log.

import { useEffect, useRef, useState } from "react";
import {
  Eye, EyeOff, Maximize2, Minimize2, Crosshair, Network, Activity,
} from "lucide-react";
import { telemetry } from "@/lib/telemetry";
import type { MatchEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

// camera ground-plane homography (pitch meters -> optical frame plane)
const H = [
  [0.098, -0.014, -52.5],
  [0.004, 0.064, -34.0],
  [0.0001, 0.0008, 1.0],
];

function applyH(x: number, y: number): [number, number] {
  const u = H[0][0] * x + H[0][1] * y + H[0][2];
  const v = H[1][0] * x + H[1][1] * y + H[1][2];
  const w = H[2][0] * x + H[2][1] * y + H[2][2];
  return [u / w, v / w];
}

interface Props {
  events: MatchEvent[];
  expandedOverride?: boolean | null;
  onTogglePassingNetwork?: (next: boolean) => void;
  passingNetworkOn?: boolean;
}

type LogLine = { id: number; text: string };

const POSE_DISTRIBUTION = [
  { id: "idle", label: "IDLE", count: 6 },
  { id: "jog", label: "JOG", count: 7 },
  { id: "sprint", label: "SPRINT", count: 5 },
  { id: "press", label: "PRESS", count: 2 },
  { id: "kick", label: "KICK", count: 2 },
];

let logSeq = 0;

export default function VisionAutoEventerHUD({
  events, expandedOverride = null, onTogglePassingNetwork, passingNetworkOn = false,
}: Props) {
  const [enabled, setEnabled] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const isExpanded = expandedOverride ?? expanded;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const seenEvent = useRef<string>("");

  // ---- auto-event emission log (machine-detected, zero manual tagging) ----
  useEffect(() => {
    const newest = events[0];
    if (!newest || newest.id === seenEvent.current) return;
    seenEvent.current = newest.id;
    let line: string | null = null;
    if (newest.type === "AUTO_SPRINT_ALERT" && newest.speed_kmh) {
      line = `⚡ [AUTO-TAG] SPRINT THRESHOLD >30km/h: #${newest.player_id?.split("_")[1]} (${newest.speed_kmh} km/h)`;
    } else if (newest.type === "AUTO_DISTANCE_ALERT") {
      line = `📏 [AUTO-TAG] DISTANCE THRESHOLD: ${newest.player_name} reached ${newest.distance_km?.toFixed(2)} km`;
    } else if (newest.type === "PASS") {
      line = `🎯 [AUTO-TAG] PASS VECTOR DETECTED: ${newest.distance_m?.toFixed(1)}m | Ball Speed: ${newest.ball_speed_kmh?.toFixed(0)} km/h | PDR: ${newest.pdr?.toFixed(0)}%`;
    } else if (newest.type === "PASS_COMPLETE") {
      line = `✅ [AUTO-TAG] PASS COMPLETE: #${newest.player_id?.split("_")[1]} → ${newest.target_name ?? "target"} (${newest.distance_m?.toFixed(1)}m)`;
    } else if (newest.type === "TACKLE") {
      line = `🦶 [AUTO-TAG] TACKLE WON: ${newest.player_name} vs ${newest.opponent_name ?? "carrier"}`;
    } else if (newest.type === "PRESSURE_TRAP") {
      line = `🛡️ [AUTO-TAG] HIGH-PRESSURE CLOSURE: ${newest.players?.length ?? 3} Defenders within 5.2m`;
    }
    if (line) {
      setLog((prev) => [{ id: ++logSeq, text: line }, ...prev].slice(0, 3));
    }
  }, [events]);

  // ---- 30 fps optical feed renderer ----
  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = 0;
    let frame = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return; // ~30 fps
      last = now;
      frame++;
      const W = canvas.width;
      const Hh = canvas.height;

      // fit homography output to the frame
      const corners = [applyH(0, 0), applyH(105, 0), applyH(105, 68), applyH(0, 68)];
      const us = corners.map((c) => c[0]);
      const vs = corners.map((c) => c[1]);
      const uMin = Math.min(...us), uMax = Math.max(...us);
      const vMin = Math.min(...vs), vMax = Math.max(...vs);
      const scale = Math.min((W - 40) / (uMax - uMin), (Hh - 60) / (vMax - vMin));
      const cx = W / 2 - ((uMin + uMax) / 2) * scale;
      const cy = Hh / 2 + 14 - ((vMin + vMax) / 2) * scale;
      const project = (px: number, py: number): [number, number] => {
        const [u, v] = applyH(px, py);
        return [u * scale + cx, v * scale + cy];
      };

      // broadcast feed backdrop
      const grad = ctx.createLinearGradient(0, 0, 0, Hh);
      grad.addColorStop(0, "#0A1018");
      grad.addColorStop(1, "#05070C");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, Hh);
      ctx.fillStyle = "rgba(20,45,34,0.85)";
      const [p0, p1, p2, p3] = corners.map((c) => [c[0] * scale + cx, c[1] * scale + cy]);
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.lineTo(p3[0], p3[1]);
      ctx.closePath();
      ctx.fill();
      // scanlines
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      for (let y = 0; y < Hh; y += 3) ctx.fillRect(0, y, W, 1);

      // pitch outline through the homography
      ctx.strokeStyle = "rgba(235,245,255,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.lineTo(p3[0], p3[1]);
      ctx.closePath();
      ctx.stroke();
      const mid0 = project(52.5, 0), mid1 = project(52.5, 68);
      ctx.beginPath();
      ctx.moveTo(mid0[0], mid0[1]);
      ctx.lineTo(mid1[0], mid1[1]);
      ctx.stroke();

      // homography calibration grid + matrix
      if (showGrid) {
        ctx.strokeStyle = "rgba(0,240,255,0.25)";
        for (let gx = 0; gx <= 105; gx += 15) {
          const a = project(gx, 0), b = project(gx, 68);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        for (let gy = 0; gy <= 68; gy += 10) {
          const a = project(0, gy), b = project(105, gy);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        ctx.fillStyle = "rgba(0,240,255,0.85)";
        ctx.font = "600 8px 'JetBrains Mono', monospace";
        ctx.fillText("H = [[0.098,-0.014,-52.5],[0.004,0.064,-34.0],[0.0001,0.0008,1.0]]", 8, 12);
        ctx.fillText("(u,v) px  ->  (x,y,z) m", 8, 22);
      }

      // 8 nearest players around the ball
      const ball = telemetry.ball;
      const players = Array.from(telemetry.players.values())
        .map((p) => ({ p, d: Math.hypot(p.x - ball.x, p.y - ball.y) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 8);

      for (const { p } of players) {
        const [sx, sy] = project(p.x, p.y);
        const bw = 40, bh = 54;
        const boxColor = p.speed_kmh >= 30 ? "#00FF85" : p.team === "NLA" ? "#FF1E56" : "#00F0FF";
        const jitter = Math.sin(frame * 0.31 + p.shirt_number) * 1.2;
        // detector-style bounding box
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx - bw / 2 + jitter, sy - bh / 2 + jitter, bw, bh);
        // corner ticks
        ctx.lineWidth = 2.5;
        const t = 7;
        const bx = sx - bw / 2 + jitter, by = sy - bh / 2 + jitter;
        ctx.beginPath();
        ctx.moveTo(bx, by + t); ctx.lineTo(bx, by); ctx.lineTo(bx + t, by);
        ctx.moveTo(bx + bw - t, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + t);
        ctx.moveTo(bx, by + bh - t); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + t, by + bh);
        ctx.stroke();
        // header label
        ctx.fillStyle = boxColor;
        ctx.font = "700 8px 'JetBrains Mono', monospace";
        ctx.fillText(
          `ID:${p.id} | conf:0.98 | ${p.speed_kmh.toFixed(1)}km/h | ${(p.distance_m / 1000).toFixed(2)}km`,
          bx, by - 3
        );
        // skeletal keypoints (head, shoulders, hips, knees, ankles)
        const kps: [number, number][] = [
          [sx, sy - 14],                       // head
          [sx - 7, sy - 6], [sx + 7, sy - 6],  // shoulders
          [sx - 5, sy + 6], [sx + 5, sy + 6],  // hips
          [sx - 6, sy + 17], [sx + 6, sy + 17],// knees
          [sx - 7, sy + 26], [sx + 7, sy + 26],// ankles
        ];
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(kps[0][0], kps[0][1]); ctx.lineTo((kps[1][0] + kps[2][0]) / 2, kps[1][1]);
        ctx.lineTo(kps[1][0], kps[1][1]); ctx.lineTo(kps[3][0], kps[3][1]); ctx.lineTo(kps[5][0], kps[5][1]); ctx.lineTo(kps[7][0], kps[7][1]);
        ctx.moveTo(kps[2][0], kps[2][1]); ctx.lineTo(kps[4][0], kps[4][1]); ctx.lineTo(kps[6][0], kps[6][1]); ctx.lineTo(kps[8][0], kps[8][1]);
        ctx.stroke();
        ctx.fillStyle = "#00FF85";
        for (const [kx, ky] of kps) {
          ctx.fillRect(kx - 1.5, ky - 1.5, 3, 3);
        }
      }

      // ball optical tracker + velocity arrow
      const [bsx, bsy] = project(ball.x, ball.y);
      ctx.strokeStyle = "#FFC24D";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bsx - 8, bsy - 8, 16, 16);
      ctx.fillStyle = "#FFC24D";
      ctx.font = "700 8px 'JetBrains Mono', monospace";
      ctx.fillText(`BALL | conf:0.99 | ${ball.speed_kmh.toFixed(1)}km/h`, bsx - 24, bsy - 12);
      const vx = ball.vx, vy = ball.vy;
      const vl = Math.hypot(vx, vy);
      if (vl > 0.5) {
        const [ex, ey] = project(ball.x + vx * 0.35, ball.y + vy * 0.35);
        ctx.strokeStyle = "#FFC24D";
        ctx.beginPath();
        ctx.moveTo(bsx, bsy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        const ang = Math.atan2(ey - bsy, ex - bsx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 6 * Math.cos(ang - 0.4), ey - 6 * Math.sin(ang - 0.4));
        ctx.lineTo(ex - 6 * Math.cos(ang + 0.4), ey - 6 * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fill();
      }

      // broadcast frame HUD
      ctx.fillStyle = "rgba(255,30,86,0.9)";
      ctx.fillRect(8, Hh - 18, 6, 6);
      ctx.fillStyle = "#E2E8F0";
      ctx.font = "700 9px 'Rajdhani', sans-serif";
      ctx.fillText(`OPTICAL TRACKING CAM 01 · ${telemetry.match.clock} · SYNTHETIC CV`, 18, Hh - 11);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [enabled, showGrid, isExpanded]);

  if (!enabled) {
    return (
      <button
        onClick={() => setEnabled(true)}
        className="clip-skew pointer-events-auto flex items-center gap-1.5 bg-slate-950/85 px-2.5 py-1 font-tech text-[11px] font-bold uppercase tracking-wider text-tactical backdrop-blur-xl"
      >
        <EyeOff size={12} /> CV Auto-Eventer: OFF
      </button>
    );
  }

  return (
    <div
      className={cn(
        "clip-ea pointer-events-auto border border-tactical/30 bg-slate-950/85 backdrop-blur-xl",
        isExpanded
          ? "fixed left-1/2 top-1/2 z-50 w-[min(900px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2"
          : "w-[340px] max-w-full"
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-2 py-1">
        <button
          onClick={() => setEnabled(false)}
          className="flex items-center gap-1.5 font-tech text-[10.5px] font-bold uppercase tracking-[0.14em] text-tactical"
          title="Toggle the AI optical tracking feed"
        >
          <Eye size={12} /> CV Auto-Eventer: <span className="animate-breathe text-crimson">LIVE</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowGrid((g) => !g)}
            className={cn(
              "clip-skew px-1.5 py-0.5 font-tech text-[9px] font-bold uppercase tracking-wider transition",
              showGrid ? "bg-tactical/25 text-tactical" : "text-slate-500 hover:text-slate-300"
            )}
            title="Toggle homography calibration grid"
          >
            H-Matrix
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-0.5 text-slate-400 transition hover:text-white"
            title={isExpanded ? "Collapse" : "Expand to modal"}
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={isExpanded ? 896 : 336}
        height={isExpanded ? 470 : 190}
        className="block w-full"
      />

      {/* ---- v6.2 CV telemetry: homography lock, pose distribution, xT network ---- */}
      <div className="grid grid-cols-1 gap-1 border-t border-white/10 px-2 py-1.5 sm:grid-cols-2">
        <div className="border border-tactical/25 bg-tactical/[0.05] px-1.5 py-1">
          <div className="flex items-center justify-between gap-1">
            <span className="flex items-center gap-1 font-tech text-[8px] font-bold uppercase tracking-[0.14em] text-tactical">
              <Crosshair size={9} /> Homography Calibration
            </span>
            <span className="flex items-center gap-1 font-tech text-[7.5px] font-bold uppercase tracking-wider text-pitch">
              <span className="h-1.5 w-1.5 rounded-full bg-pitch" /> LOCKED
            </span>
          </div>
          <div className="mt-0.5 font-tech text-[9px] font-bold uppercase tracking-wider text-slate-200">
            105×68m Regulation Standard Locked
          </div>
          <p className="mt-0.5 font-tech text-[7.5px] leading-relaxed text-slate-500">
            Plane-projective ground mapping · 3-point calibration · 0.004m residual
          </p>
        </div>

        <div className="border border-white/10 bg-black/25 px-1.5 py-1">
          <div className="flex items-center justify-between gap-1">
            <span className="flex items-center gap-1 font-tech text-[8px] font-bold uppercase tracking-[0.14em] text-slate-400">
              <Activity size={9} /> 14-Joint Pose Distribution
            </span>
            <span className="font-tech text-[7.5px] font-bold uppercase tracking-wider text-tactical">
              22/22 TRACKED
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-[3px]">
            {POSE_DISTRIBUTION.map((pose) => (
              <span
                key={pose.id}
                className="border border-white/10 bg-white/[0.04] px-1 py-0.5 font-tech text-[7.5px] text-slate-400"
                title={`${pose.label}: ${pose.count} players · 14 joints each`}
              >
                {pose.label} <b className="text-slate-200">{pose.count}</b>
              </span>
            ))}
          </div>
          <p className="mt-0.5 font-tech text-[7.5px] leading-relaxed text-slate-500">
            14 landmarks per player (head, shoulders, hips, knees, ankles) · 100% synthetic
          </p>
        </div>
      </div>

      {onTogglePassingNetwork && (
        <div className="border-t border-white/10 px-2 py-1">
          <button
            onClick={() => onTogglePassingNetwork(!passingNetworkOn)}
            aria-pressed={passingNetworkOn}
            className={cn(
              "clip-skew flex w-full items-center justify-center gap-1.5 py-1 font-tech text-[9px] font-bold uppercase tracking-wider transition",
              passingNetworkOn
                ? "bg-tactical/25 text-tactical"
                : "bg-white/[0.04] text-slate-400 hover:text-tactical",
            )}
            title="Render the Stage B top-xT passing lanes as glowing 3D tubes scaled by expected threat"
          >
            <Network size={11} />
            {passingNetworkOn ? "3D xT Passing Network · ON" : "3D xT Passing Network"}
          </button>
        </div>
      )}

      {/* real-time auto-event emission log */}
      <div className="border-t border-white/10 px-2 py-1">
        <div className="font-tech text-[8.5px] font-bold uppercase tracking-[0.2em] text-slate-500">
          Auto-Event Emission Log (zero manual tagging)
        </div>
        {log.length === 0 && (
          <div className="py-0.5 font-tech text-[9.5px] text-slate-600">waiting for machine detections…</div>
        )}
        {log.map((l, i) => (
          <div
            key={l.id}
            className={cn("truncate py-[1px] font-tech text-[9.5px]", i === 0 ? "text-pitch" : "text-slate-500")}
          >
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}
