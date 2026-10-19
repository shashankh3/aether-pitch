"use client";
// AETHER PITCH — HoloPitchCanvas (EA Sports FC broadcast edition)
// 60fps HTML5 tactical canvas with smooth 2D <-> 2.5D isometric tilt.
//   Presentation: stadium bowl + crowd, LED ad boards, glowing turf, vignette
//   Layer 1  pitch + 16x12 xT threat heatmap
//   Layer 2  discretised Voronoi pitch-control mesh
//   Layer 3  defensive compactness lines + line-height tags
//   Layer 4  HyperMotion rings, FOV cone, telemetry badge, sprint streaks,
//            ball trail, press-trap / inversion AR markers
//   Layer 5  ballistic pass arcs + dashed cyan "Ghost Pass" counterfactual
//   FX       GOAL celebration shockwave + screen flash

import { useEffect, useRef } from "react";
import type { MatchEvent, MatchTick, PlayerTick } from "@/lib/types";
import { TEAM_COLORS } from "@/lib/types";

const PITCH_L = 105;
const PITCH_W = 68;
const TEAM_RGB: Record<string, [number, number, number]> = {
  NLA: [255, 42, 84],
  MCS: [56, 189, 248],
};
const BOARD_LABELS = [
  "AETHER PITCH", "AZURE AI FOUNDRY", "PITCHFORGE", "TACTICAL PULSE",
  "PLAYERLOCK 360", "TWINCAST", "HOLOPITCH",
];

// deterministic pseudo-random (stable crowd layout across frames)
function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function xtAt(x: number, y: number): number {
  const dGoal = Math.hypot(PITCH_L - x, 34 - y);
  const dCentral = Math.abs(y - 34);
  return 0.35 * Math.exp(-dGoal / 30) + 0.05 * Math.exp(-dCentral / 18);
}

interface PassAnim {
  from: [number, number];
  to: [number, number];
  ghost?: { x: number; y: number; delta_xt: number } | null;
  t0: number;
  dur: number;
  color: string;
  shot: boolean;
}
interface Marker { x: number; y: number; t0: number; kind: "trap" | "inversion" }

interface Props {
  tickRef: React.MutableRefObject<MatchTick | null>;
  lockedId: string | null;
  onLock: (id: string | null) => void;
  tilt: boolean;
  events: MatchEvent[];
  possession: string;
}

export default function HoloPitchCanvas({
  tickRef, lockedId, onLock, tilt, events, possession,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tiltTarget = useRef(tilt ? 1 : 0);
  const tiltT = useRef(0);
  const passAnims = useRef<PassAnim[]>([]);
  const markers = useRef<Marker[]>([]);
  const goalFx = useRef<{ t0: number; team: string; x: number } | null>(null);
  const ballTrail = useRef<{ x: number; y: number }[]>([]);
  const lastEventId = useRef<string>("");
  const lockRef = useRef(lockedId);
  const possRef = useRef(possession);

  lockRef.current = lockedId;
  possRef.current = possession;

  useEffect(() => {
    tiltTarget.current = tilt ? 1 : 0;
  }, [tilt]);

  // Watch the event stream for animation triggers (newest first, until last seen)
  useEffect(() => {
    for (const ev of events) {
      if (ev.id === lastEventId.current) break;
      const now = performance.now();
      if ((ev.type === "PASS" || ev.type === "SHOT") && ev.start && ev.end) {
        const dist = Math.hypot(ev.end[0] - ev.start[0], ev.end[1] - ev.start[1]);
        passAnims.current.push({
          from: ev.start, to: ev.end, ghost: ev.ghost_pass ?? null,
          t0: now, dur: ev.type === "SHOT" ? 650 : 380 + dist * 16,
          color: ev.team === "MCS" ? TEAM_COLORS.MCS : TEAM_COLORS.NLA,
          shot: ev.type === "SHOT",
        });
        if (passAnims.current.length > 4) passAnims.current.shift();
      } else if (ev.type === "PRESSURE_TRAP" && ev.x != null) {
        markers.current.push({ x: ev.x, y: ev.y ?? 34, t0: now, kind: "trap" });
      } else if (ev.type === "TACTICAL_INVERSION" && ev.x != null) {
        markers.current.push({ x: ev.x, y: ev.y ?? 34, t0: now, kind: "inversion" });
      } else if (ev.type === "GOAL") {
        goalFx.current = { t0: now, team: ev.team ?? "NLA", x: ev.team === "MCS" ? 105 : 0 };
      }
    }
    lastEventId.current = events[0]?.id ?? lastEventId.current;
  }, [events]);

  // ---- render loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    let raf = 0;

    const makeProj = (t: number) => {
      const cx = W / 2;
      const cy = H / 2 + 6;
      const spanX = Math.min(W * 0.9, 1150);
      const spanY = Math.min(H * 0.84, 760) * (1 - 0.42 * t);
      return (x: number, y: number): [number, number] => {
        const nx = x / PITCH_L - 0.5;
        const ny = y / PITCH_W - 0.5;
        return [cx + nx * spanX + ny * spanX * 0.07 * t, cy + ny * spanY];
      };
    };

    // Affine world->screen transform (matches makeProj) for world-space art:
    // crowd, LED boards, goal FX, ball trail — everything skews with the tilt.
    const worldTransform = (t: number) => {
      const cx = W / 2;
      const cy = H / 2 + 6;
      const spanX = Math.min(W * 0.9, 1150);
      const spanY = Math.min(H * 0.84, 760) * (1 - 0.42 * t);
      const a = spanX / PITCH_L;
      const b = (spanX * 0.07 * t) / PITCH_W;
      const d = spanY / PITCH_W;
      const e = cx - 0.5 * spanX - 0.5 * spanX * 0.07 * t;
      const f = cy - 0.5 * spanY;
      ctx.setTransform(dpr * a, 0, dpr * b, dpr * d, dpr * e, dpr * f);
      return { a, b, d };
    };

    // crowd: two tiers of stands on all four sides
    const crowd: { x: number; y: number; c: string }[] = [];
    for (let i = 0; i < 1500; i++) {
      const h1 = hash(i);
      const h2 = hash(i + 9999);
      const h3 = hash(i + 4242);
      let x: number;
      let y: number;
      const side = i % 4;
      if (side === 0) { x = -16 + h1 * 137; y = -13.5 + h2 * 7.5; }
      else if (side === 1) { x = -16 + h1 * 137; y = 74 + h2 * 7.5; }
      else if (side === 2) { x = -13.5 + h1 * 7.5; y = -10 + h2 * 88; }
      else { x = 111.5 + h1 * 7.5; y = -10 + h2 * 88; }
      const r = h3;
      const c =
        r < 0.1 ? "rgba(255,42,84,0.5)" :
        r < 0.2 ? "rgba(56,189,248,0.45)" :
        r < 0.28 ? "rgba(255,255,255,0.5)" :
        r < 0.34 ? "rgba(255,194,77,0.4)" :
        `rgba(148,163,184,${0.14 + h3 * 0.3})`;
      crowd.push({ x, y, c });
    }

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      tiltT.current += (tiltTarget.current - tiltT.current) * 0.07;
      const t = tiltT.current;
      const proj = makeProj(t);
      // debug/automation hook: world->screen projection for the current frame
      (window as unknown as Record<string, unknown>).__aetherProj = proj;
      const tick = tickRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // obsidian bowl base
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#05070C");
      bg.addColorStop(0.55, "#0A0F18");
      bg.addColorStop(1, "#05070C");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const quad = (x0: number, y0: number, x1: number, y1: number) => {
        const [ax, ay] = proj(x0, y0);
        const [bx, by] = proj(x1, y0);
        const [cx2, cy2] = proj(x1, y1);
        const [dx, dy] = proj(x0, y1);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(cx2, cy2);
        ctx.lineTo(dx, dy);
        ctx.closePath();
      };

      // ============ world-space presentation layer (stands, boards) ============
      const wt = worldTransform(t);
      // stand tiers
      ctx.fillStyle = "#0B1119";
      ctx.fillRect(-30, -24, 165, 116);
      const standGrad = ctx.createLinearGradient(0, -16, 0, 84);
      standGrad.addColorStop(0, "rgba(23,32,48,0.85)");
      standGrad.addColorStop(0.5, "rgba(13,19,30,0.9)");
      standGrad.addColorStop(1, "rgba(23,32,48,0.85)");
      ctx.fillStyle = standGrad;
      ctx.fillRect(-22, -18, 149, 104);
      // crowd dots
      for (const p of crowd) {
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, 0.42, 0.42);
      }
      // walkway rings
      ctx.strokeStyle = "rgba(148,163,184,0.12)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(-8.5, -6, 122, 80);
      ctx.strokeRect(-6.5, -4.8, 118, 77.6);

      // LED ad boards (four sides)
      const drawBoard = (x: number, y: number, w: number, h: number) => {
        ctx.fillStyle = "#05070C";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(0,240,255,0.35)";
        ctx.lineWidth = 0.14;
        ctx.strokeRect(x, y, w, h);
      };
      drawBoard(0, -4.6, 105, 2.6);
      drawBoard(0, 70, 105, 2.6);
      drawBoard(-4.4, 8, 2.6, 52);
      drawBoard(106.8, 8, 2.6, 52);
      ctx.fillStyle = "rgba(0,240,255,0.85)";
      ctx.font = '700 1.9px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < 8; i++) {
        const label = BOARD_LABELS[i % BOARD_LABELS.length];
        const cx0 = 6.5 + i * 13;
        ctx.fillText(label, cx0, -3.3);
        ctx.fillText(label, cx0, 71.3);
      }
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.translate(-3.1, 16 + i * 12);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(BOARD_LABELS[(i + 2) % BOARD_LABELS.length], 0, 0);
        ctx.restore();
        ctx.save();
        ctx.translate(108.1, 16 + i * 12);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(BOARD_LABELS[(i + 4) % BOARD_LABELS.length], 0, 0);
        ctx.restore();
      }

      // ============ turf ============
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // outer glow behind the grass
      ctx.save();
      ctx.shadowColor = "rgba(0,255,133,0.16)";
      ctx.shadowBlur = 46;
      quad(-2.2, -2.2, PITCH_L + 2.2, PITCH_W + 2.2);
      ctx.fillStyle = "#0C1D16";
      ctx.fill();
      ctx.restore();

      const bands = 12;
      for (let i = 0; i < bands; i++) {
        const x0 = (i * PITCH_L) / bands;
        const x1 = ((i + 1) * PITCH_L) / bands;
        quad(x0, 0, x1, PITCH_W);
        ctx.fillStyle = i % 2 === 0 ? "rgba(17,42,33,0.62)" : "rgba(11,30,24,0.62)";
        ctx.fill();
      }
      // turf sheen + edge shading
      quad(0, 0, PITCH_L, PITCH_W);
      const turf = ctx.createLinearGradient(0, 0, PITCH_L * 0.4, PITCH_W);
      turf.addColorStop(0, "rgba(120,255,190,0.05)");
      turf.addColorStop(1, "rgba(0,0,0,0.16)");
      ctx.fillStyle = turf;
      ctx.fill();

      const players: PlayerTick[] = tick?.players ?? [];
      const poss = possRef.current || tick?.possession || "NLA";

      // ---- Layer 1b: xT threat heatmap (16x12) ----
      const heatTowards = poss === "MCS" ? -1 : 1;
      for (let c = 0; c < 16; c++) {
        for (let r = 0; r < 12; r++) {
          const x = ((c + 0.5) * PITCH_L) / 16;
          const y = ((r + 0.5) * PITCH_W) / 12;
          const xs = heatTowards === 1 ? x : PITCH_L - x;
          const v = xtAt(xs, y) / 0.35;
          if (v < 0.14) continue;
          quad((c * PITCH_L) / 16, (r * PITCH_W) / 12, ((c + 1) * PITCH_L) / 16, ((r + 1) * PITCH_W) / 12);
          ctx.fillStyle = `rgba(255, ${Math.round(150 - 110 * v)}, 40, ${(0.02 + 0.10 * v).toFixed(3)})`;
          ctx.fill();
        }
      }

      // ---- Layer 2: discretised Voronoi pitch control ----
      for (let c = 0; c < 16; c++) {
        for (let r = 0; r < 12; r++) {
          const x = ((c + 0.5) * PITCH_L) / 16;
          const y = ((r + 0.5) * PITCH_W) / 12;
          let best = 1e9;
          let bestTeam: string | null = null;
          for (const p of players) {
            const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
            if (d < best) { best = d; bestTeam = p.team; }
          }
          if (!bestTeam || best > 20 * 20) continue;
          const rgb = TEAM_RGB[bestTeam];
          quad(c * (PITCH_L / 16), r * (PITCH_W / 12), (c + 1) * (PITCH_L / 16), (r + 1) * (PITCH_W / 12));
          ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.06)`;
          ctx.fill();
        }
      }

      // ---- markings ----
      ctx.strokeStyle = "rgba(235,245,255,0.30)";
      ctx.lineWidth = 1.5;
      const line = (x0: number, y0: number, x1: number, y1: number) => {
        const [ax, ay] = proj(x0, y0);
        const [bx, by] = proj(x1, y1);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      };
      const arc = (cxw: number, cyw: number, r: number, a0: number, a1: number) => {
        ctx.beginPath();
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
          const a = a0 + ((a1 - a0) * i) / steps;
          const [px, py] = proj(cxw + r * Math.cos(a), cyw + r * Math.sin(a));
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      };
      const box = (side: 0 | 1) => {
        const gx = side === 0 ? 0 : PITCH_L;
        const dir = side === 0 ? 1 : -1;
        line(gx, 13.85, gx + dir * 16.5, 13.85);
        line(gx + dir * 16.5, 13.85, gx + dir * 16.5, 54.15);
        line(gx + dir * 16.5, 54.15, gx, 54.15);
        line(gx, 24.84, gx + dir * 5.5, 24.84);
        line(gx + dir * 5.5, 24.84, gx + dir * 5.5, 43.16);
        line(gx + dir * 5.5, 43.16, gx, 43.16);
        arc(gx + dir * 11, 34, 9.15, dir === 1 ? -0.93 : Math.PI - 0.93, dir === 1 ? 0.93 : Math.PI + 0.93);
        // goal frame (neon)
        ctx.strokeStyle = "rgba(0,255,133,0.85)";
        ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(0,255,133,0.8)";
        ctx.shadowBlur = 12;
        line(gx, 34 - 3.66, gx, 34 + 3.66);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(235,245,255,0.30)";
        ctx.lineWidth = 1.5;
      };
      quad(0, 0, PITCH_L, PITCH_W);
      ctx.stroke();
      line(PITCH_L / 2, 0, PITCH_L / 2, PITCH_W);
      arc(PITCH_L / 2, 34, 9.15, 0, Math.PI * 2);
      arc(PITCH_L / 2, 34, 0.35, 0, Math.PI * 2);
      box(0);
      box(1);
      // corner arcs
      arc(0, 0, 1.2, 0, Math.PI / 2);
      arc(PITCH_L, 0, 1.2, Math.PI / 2, Math.PI);
      arc(PITCH_L, PITCH_W, 1.2, Math.PI, Math.PI * 1.5);
      arc(0, PITCH_W, 1.2, Math.PI * 1.5, Math.PI * 2);

      // ---- Layer 3: defensive compactness ----
      for (const team of ["NLA", "MCS"] as const) {
        const dfs = players.filter((p) => p.team === team && p.role === "DF").sort((a, b) => a.y - b.y);
        if (dfs.length < 2) continue;
        const rgb = TEAM_RGB[team];
        ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.55)`;
        ctx.lineWidth = 2;
        ctx.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.8)`;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        dfs.forEach((p, i) => {
          const [px, py] = proj(p.x, p.y);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
        const deepest = team === "NLA"
          ? dfs.reduce((a, b) => (a.x < b.x ? a : b))
          : dfs.reduce((a, b) => (a.x > b.x ? a : b));
        const height = team === "NLA" ? deepest.x : PITCH_L - deepest.x;
        const [lx, ly] = proj(deepest.x, deepest.y - 4);
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.95)`;
        ctx.font = '600 10px "Rajdhani", ui-monospace, monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(`${height.toFixed(1)} m`, lx, ly - 10);
      }

      // ---- Layer 5a: pass arcs + ghost vectors ----
      passAnims.current = passAnims.current.filter((a) => now - a.t0 < a.dur + 900);
      const qpoint = (a: PassAnim, u: number): [number, number] => {
        const mx = (a.from[0] + a.to[0]) / 2;
        const my = (a.from[1] + a.to[1]) / 2;
        const dx = a.to[0] - a.from[0];
        const dy = a.to[1] - a.from[1];
        const len = Math.hypot(dx, dy) || 1;
        const bow = Math.min(7, len * 0.1);
        const nx = -dy / len;
        const ny = dx / len;
        const side = mx + nx * bow < PITCH_L / 2 ? 1 : -1;
        const cpx = mx + nx * bow * side;
        const cpy = my + ny * bow * side;
        const iu = 1 - u;
        return [
          iu * iu * a.from[0] + 2 * iu * u * cpx + u * u * a.to[0],
          iu * iu * a.from[1] + 2 * iu * u * cpy + u * u * a.to[1],
        ];
      };
      let visualBall: [number, number] | null = null;
      let visualBallLift = 0;
      for (const a of passAnims.current) {
        const u = Math.min(1, (now - a.t0) / a.dur);
        const fade = Math.max(0, 1 - Math.max(0, (now - a.t0 - a.dur) / 900));
        ctx.globalAlpha = 0.25 + 0.75 * fade;
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.shot ? 4 : 3;
        ctx.shadowColor = a.color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        const steps = 40;
        for (let i = 0; i <= steps * u; i++) {
          const [px, py] = proj(...qpoint(a, i / steps));
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (a.ghost && u > 0.25) {
          ctx.strokeStyle = "rgba(0,240,255,0.9)";
          ctx.setLineDash([7, 6]);
          ctx.lineWidth = 2;
          const [gx0, gy0] = proj(a.from[0], a.from[1]);
          const [gx1, gy1] = proj(a.ghost.x, a.ghost.y);
          ctx.beginPath();
          ctx.moveTo(gx0, gy0);
          ctx.lineTo(gx1, gy1);
          ctx.stroke();
          ctx.setLineDash([]);
          const [mx, my] = proj((a.from[0] + a.ghost.x) / 2, (a.from[1] + a.ghost.y) / 2);
          ctx.fillStyle = "rgba(0,240,255,0.95)";
          ctx.font = '700 11px "Barlow Condensed", sans-serif';
          ctx.textAlign = "center";
          ctx.fillText(`GHOST +${a.ghost.delta_xt.toFixed(2)} xT`, mx, my - 8);
        }
        if (u < 1) {
          const [bx, by] = qpoint(a, u);
          visualBall = proj(bx, by);
          visualBallLift = Math.sin(u * Math.PI) * 12;
        }
        ctx.globalAlpha = 1;
      }

      // ---- AR markers: press traps + inversion ----
      markers.current = markers.current.filter((m) => now - m.t0 < 2600);
      for (const m of markers.current) {
        const p = (now - m.t0) / 2600;
        const [px, py] = proj(m.x, m.y);
        const alpha = 1 - p;
        if (m.kind === "trap") {
          ctx.strokeStyle = `rgba(255,42,84,${(0.9 * alpha).toFixed(2)})`;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([5, 5]);
          ctx.lineDashOffset = -now / 20;
          ctx.beginPath();
          ctx.arc(px, py, 16 + p * 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = `rgba(255,42,84,${(0.95 * alpha).toFixed(2)})`;
          ctx.font = '700 10px "Barlow Condensed", sans-serif';
          ctx.textAlign = "center";
          ctx.fillText("PRESS TRAP", px, py - 22 - p * 8);
        } else {
          ctx.strokeStyle = `rgba(0,240,255,${(0.9 * alpha).toFixed(2)})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(px, py, 14 + p * 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = `rgba(0,240,255,${(0.95 * alpha).toFixed(2)})`;
          ctx.font = '700 10px "Barlow Condensed", sans-serif';
          ctx.textAlign = "center";
          ctx.fillText("INVERTED", px, py - 20 - p * 8);
        }
      }

      // ---- Layer 4: players ----
      for (const p of players) {
        const [px, py] = proj(p.x, p.y);
        const rgb = TEAM_RGB[p.team];
        const isCarrier = tick?.carrier === p.id;
        const r = 8;

        // ground shadow
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        ctx.ellipse(px + 1.5, py + 2.5, r * 0.95, r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        const sp = Math.hypot(p.vx, p.vy);
        // sprint streaks
        if (sp > 7.0) {
          ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`;
          ctx.lineWidth = 2;
          for (let k = 1; k <= 3; k++) {
            ctx.beginPath();
            ctx.moveTo(px - (p.vx / sp) * (r + k * 7), py - (p.vy / sp) * (r + k * 7));
            ctx.lineTo(px - (p.vx / sp) * (r + k * 7 + 6), py - (p.vy / sp) * (r + k * 7 + 6));
            ctx.stroke();
          }
        } else if (sp > 3.5) {
          ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.75)`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + (p.vx / sp) * (r + 8), py + (p.vy / sp) * (r + 8));
          ctx.stroke();
        }

        if (p.id === lockRef.current) {
          ctx.strokeStyle = "#00F0FF";
          ctx.lineWidth = 2.4;
          ctx.setLineDash([9, 7]);
          ctx.lineDashOffset = -now / 28;
          ctx.shadowColor = "#00F0FF";
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.arc(px, py, r + 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.shadowBlur = 0;
          if (sp > 0.5) {
            const ang = Math.atan2(p.vy, p.vx);
            ctx.fillStyle = "rgba(0,240,255,0.10)";
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.arc(px, py, 36, ang - 0.35, ang + 0.35);
            ctx.closePath();
            ctx.fill();
          }
        }

        if (isCarrier) {
          ctx.strokeStyle = "rgba(255,255,255,0.95)";
          ctx.lineWidth = 1.8;
          ctx.shadowColor = "rgba(255,255,255,0.8)";
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(px, py, r + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // jersey body with gradient + rim light
        const grad = ctx.createRadialGradient(px - r * 0.4, py - r * 0.5, 1, px, py, r);
        if (p.role === "GK") {
          grad.addColorStop(0, "#CBD5E1");
          grad.addColorStop(1, "#64748B");
        } else {
          grad.addColorStop(0, `rgba(${Math.min(255, rgb[0] + 70)},${Math.min(255, rgb[1] + 70)},${Math.min(255, rgb[2] + 70)},1)`);
          grad.addColorStop(1, `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
        }
        ctx.fillStyle = grad;
        ctx.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.9)`;
        ctx.shadowBlur = 9;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#0B1220";
        ctx.font = '700 9px "Barlow Condensed", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(p.number), px, py + 0.5);

        // locked-player angled telemetry chip
        if (p.id === lockRef.current) {
          const label = `${p.name}  ${p.speed_kmh.toFixed(1)} KM/H`;
          ctx.font = '600 11px "Barlow Condensed", sans-serif';
          const w = ctx.measureText(label).width + 22;
          const bx = px - w / 2;
          const by = py - r - 40;
          ctx.beginPath();
          ctx.moveTo(bx + 6, by);
          ctx.lineTo(bx + w, by);
          ctx.lineTo(bx + w - 6, by + 20);
          ctx.lineTo(bx, by + 20);
          ctx.closePath();
          ctx.fillStyle = "rgba(5,8,14,0.88)";
          ctx.fill();
          ctx.strokeStyle = p.speed_kmh > 30 ? "#FF2A54" : "#00F0FF";
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.fillStyle = p.speed_kmh > 30 ? "#FF2A54" : "#00F0FF";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, px, by + 10);
          ctx.fillStyle = "rgba(148,163,184,0.3)";
          ctx.fillRect(bx + 4, by + 22, w - 8, 3);
          ctx.fillStyle = "#00FF85";
          ctx.fillRect(bx + 4, by + 22, (w - 8) * (p.stamina / 100), 3);
        }
      }

      // ---- ball trail + ball (world space for correct skew) ----
      worldTransform(t);
      const ball = tick?.ball;
      if (ball) {
        const trail = ballTrail.current;
        const last = trail[trail.length - 1];
        if (!last || Math.hypot(last.x - ball.x, last.y - ball.y) > 0.25) {
          trail.push({ x: ball.x, y: ball.y });
          if (trail.length > 12) trail.shift();
        }
        if (trail.length > 1) {
          ctx.strokeStyle = "rgba(255,255,255,0.22)";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          trail.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.stroke();
        }
      }

      // GOAL shockwave rings (world space)
      const gfx = goalFx.current;
      if (gfx && now - gfx.t0 < 1900) {
        const p = (now - gfx.t0) / 1900;
        const rgb = TEAM_RGB[gfx.team];
        for (let k = 0; k < 3; k++) {
          const pr = (p + k * 0.14) % 1;
          ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.8 * (1 - pr)).toFixed(2)})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(gfx.x, 34, 2 + pr * 26, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // ---- ball (screen space on top) ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (ball) {
        const [bx, by] = visualBall ?? proj(ball.x, ball.y);
        const lift = visualBall ? visualBallLift : (ball.z || 0) * 1.6;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath();
        ctx.ellipse(bx, by + 3.5, 4.5, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.shadowColor = "#FFFFFF";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(bx, by - lift, 4.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(200,220,255,0.9)";
        ctx.beginPath();
        ctx.arc(bx - 1.2, by - lift - 1.2, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // GOAL screen flash
      if (gfx && now - gfx.t0 < 650) {
        const p = (now - gfx.t0) / 650;
        const rgb = TEAM_RGB[gfx.team];
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(0.28 * (1 - p)).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
      void wt;
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [tickRef]);

  // ---- click-to-lock ----
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const t = tiltT.current;
    const cx = rect.width / 2;
    const cy = rect.height / 2 + 6;
    const spanX = Math.min(rect.width * 0.9, 1150);
    const spanY = Math.min(rect.height * 0.84, 760) * (1 - 0.42 * t);
    const tick = tickRef.current;
    if (!tick) return;
    let best: { id: string; d: number } | null = null;
    for (const p of tick.players) {
      const nx = p.x / PITCH_L - 0.5;
      const ny = p.y / PITCH_W - 0.5;
      const px = cx + nx * spanX + ny * spanX * 0.07 * t;
      const py = cy + ny * spanY;
      const d = Math.hypot(px - mx, py - my);
      if (d < 26 && (!best || d < best.d)) best = { id: p.id, d };
    }
    onLock(best ? best.id : null);
  };

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} onClick={handleClick} className="cursor-crosshair select-none" />
    </div>
  );
}
