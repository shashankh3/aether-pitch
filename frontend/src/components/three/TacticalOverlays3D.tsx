"use client";
// AETHER PITCH v2.0 — TacticalOverlays3D
// Volumetric tactical AR layers, toggled in Analyst / TwinCast mode:
//   * 16x12 Expected Threat floor grid — InstancedMesh, cyan->magenta heat,
//     mirrored per possession direction
//   * 3D defensive-unit laser links (back-4 + mid-3 per team) with floating
//     metric badges (line height, backline stretch)

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { telemetry } from "@/lib/telemetry";
import type { Metrics } from "@/lib/types";

const PL = 105;
const PW = 68;
const COLS = 16;
const ROWS = 12;
const CYAN = new THREE.Color("#00F0FF");
const MAGENTA = new THREE.Color("#FF2AD4");

function xtAt(x: number, y: number): number {
  const dGoal = Math.hypot(PL - x, 34 - y);
  const dCentral = Math.abs(y - 34);
  return 0.35 * Math.exp(-dGoal / 30) + 0.05 * Math.exp(-dCentral / 18);
}

/* ------------------------------------------------- xT threat floor (16x12) */
const tileGeo = (() => {
  const g = new THREE.PlaneGeometry(PL / COLS - 0.12, PW / ROWS - 0.12);
  g.rotateX(-Math.PI / 2);
  return g;
})();

export function XTGrid({ visible, possession }: { visible: boolean; possession: "NLA" | "MCS" }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const COUNT = COLS * ROWS;

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const mat4 = new THREE.Matrix4();
    const color = new THREE.Color();
    const dir = possession === "MCS" ? -1 : 1;
    let i = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const x = (c + 0.5) * (PL / COLS) - PL / 2;
        const z = (r + 0.5) * (PW / ROWS) - PW / 2;
        const xs = dir === 1 ? x + PL / 2 : PL / 2 - x;
        const v = xtAt(xs, z + 34) / 0.35;
        const vv = Math.max(0, Math.min(1, v));
        // near-zero tiles collapse away so the floor only glows where it matters
        if (vv < 0.12) {
          mat4.makeScale(0, 0, 0);
        } else {
          mat4.makeTranslation(x, 0.02, z);
        }
        m.setMatrixAt(i, mat4);
        color.lerpColors(CYAN, MAGENTA, vv);
        m.setColorAt(i, color);
        i++;
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [possession, visible]);

  if (!visible) return null;
  return (
    <instancedMesh ref={mesh} args={[tileGeo, undefined, COUNT]}>
      <meshBasicMaterial
        transparent
        opacity={0.2}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

/* ------------------------------------------------ defensive laser links */
function TeamLinks({ team, color }: { team: "NLA" | "MCS"; color: string }) {
  const backLine = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 }));
  }, [color]);
  const midLine = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 3), 3));
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
  }, [color]);

  useFrame(() => {
    const players = Array.from(telemetry.players.values()).filter((p) => p.team === team);
    const backs = players.filter((p) => p.role === "DEF").sort((a, b) => a.y - b.y).slice(0, 4);
    const mids = players.filter((p) => p.role === "MID").sort((a, b) => a.y - b.y).slice(0, 3);
    const fill = (line: THREE.Line, group: typeof backs) => {
      const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      group.forEach((p, i) => {
        attr.setXYZ(i, p.x - 52.5, 0.06, p.y - 34);
      });
      for (let i = group.length; i < attr.count; i++) attr.setXYZ(i, group[0] ? group[0].x - 52.5 : 0, 0.06, group[0] ? group[0].y - 34 : 0);
      attr.needsUpdate = true;
      line.visible = group.length >= 2;
    };
    fill(backLine, backs);
    fill(midLine, mids);
  });

  return (
    <>
      <primitive object={backLine} />
      <primitive object={midLine} />
    </>
  );
}

export function DefensiveLasers({ visible, metrics }: { visible: boolean; metrics: Metrics | null }) {
  // badge text refreshes via the `metrics` prop (2Hz from the WS stream)
  if (!visible) return null;
  const nla = metrics?.def_lines.NLA ?? 0;
  const mcs = metrics?.def_lines.MCS ?? 0;
  const stretch = metrics?.stretch_m ?? 0;
  return (
    <group>
      <TeamLinks team="NLA" color="#FF1E56" />
      <TeamLinks team="MCS" color="#00F0FF" />
      <Html position={[-44, 1.6, 0]} center distanceFactor={60} zIndexRange={[15, 0]}>
        <div className="clip-ea pointer-events-none whitespace-nowrap border border-crimson/50 bg-slate-950/80 px-2 py-0.5 font-tech text-[11px] font-bold tracking-wide text-crimson backdrop-blur-md">
          NLA LINE {nla.toFixed(1)}m
        </div>
      </Html>
      <Html position={[44, 1.6, 0]} center distanceFactor={60} zIndexRange={[15, 0]}>
        <div className="clip-ea pointer-events-none whitespace-nowrap border border-tactical/50 bg-slate-950/80 px-2 py-0.5 font-tech text-[11px] font-bold tracking-wide text-tactical backdrop-blur-md">
          MCS LINE {mcs.toFixed(1)}m
        </div>
      </Html>
      <Html position={[0, 2.2, 24]} center distanceFactor={60} zIndexRange={[15, 0]}>
        <div className="clip-ea pointer-events-none whitespace-nowrap border border-gold/50 bg-slate-950/80 px-2 py-0.5 font-tech text-[11px] font-bold tracking-wide text-gold backdrop-blur-md">
          BACKLINE STRETCH {stretch.toFixed(1)}m
        </div>
      </Html>
    </group>
  );
}
