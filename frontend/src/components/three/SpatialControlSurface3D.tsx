"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { telemetry } from "@/lib/telemetry";

const COLS = 21;
const ROWS = 14;
const PITCH_L = 105;
const PITCH_W = 68;
const UPDATE_MS = 100;

interface Props {
  showControl: boolean;
  showNetwork: boolean;
}

function ControlSurface() {
  const mesh = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastUpdate = useRef(0);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = COLS;
    canvas.height = ROWS;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    canvasRef.current = canvas;
    setTexture(tex);
    return () => {
      tex.dispose();
      canvasRef.current = null;
    };
  }, []);

  useFrame(() => {
    if (!texture || !canvasRef.current) return;
    const now = performance.now();
    if (now - lastUpdate.current < UPDATE_MS) return;
    lastUpdate.current = now;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const players = Array.from(telemetry.players.values());
    if (!players.length) return;
    const image = ctx.createImageData(COLS, ROWS);
    const data = image.data;
    const sigma = 8.5;
    const denom = 2 * sigma * sigma;
    let idx = 0;
    for (let row = 0; row < ROWS; row++) {
      const worldZ = (row + 0.5) * (PITCH_W / ROWS) - PITCH_W / 2;
      for (let col = 0; col < COLS; col++) {
        const worldX = (col + 0.5) * (PITCH_L / COLS) - PITCH_L / 2;
        let nla = 0;
        let mcs = 0;
        for (const p of players) {
          const px = p.x - PITCH_L / 2 + p.vx * 0.45;
          const pz = p.y - PITCH_W / 2 + p.vy * 0.45;
          const dx = worldX - px;
          const dz = worldZ - pz;
          const influence = Math.exp(-(dx * dx + dz * dz) / denom)
            * (0.55 + Math.min(0.75, p.speed_kmh / 45));
          if (p.team === "NLA") nla += influence;
          else mcs += influence;
        }
        const control = (nla - mcs) / (nla + mcs + 0.08);
        const strength = Math.min(1, Math.abs(control));
        const alpha = Math.min(232, 22 + strength * 214);
        if (control >= 0) {
          data[idx] = 255;
          data[idx + 1] = 30;
          data[idx + 2] = 86;
        } else {
          data[idx] = 0;
          data[idx + 1] = 240;
          data[idx + 2] = 255;
        }
        data[idx + 3] = alpha;
        idx += 4;
      }
    }
    ctx.putImageData(image, 0, 0);
    texture.needsUpdate = true;
  });

  if (!texture) return null;
  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} renderOrder={-1}>
      <planeGeometry args={[PITCH_L, PITCH_W]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.38}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

function PassingNetwork() {
  const lastRefresh = useRef(0);
  const [version, setVersion] = useState(0);

  useFrame(() => {
    const now = performance.now();
    if (now - lastRefresh.current < 700) return;
    lastRefresh.current = now;
    setVersion((v) => (v + 1) % 100000);
  });

  const links = useMemo(() => {
    const now = performance.now();
    const possession = telemetry.match.possession;
    return Array.from(telemetry.passLinks.values())
      .filter((link) => now - link.lastAt < 45000 && link.count >= 1)
      .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
      .slice(0, 14)
      .map((link) => {
        const fromPlayer = telemetry.players.get(link.from);
        const toPlayer = telemetry.players.get(link.to);
        const start = link.start ?? (fromPlayer ? [fromPlayer.x, fromPlayer.y] as [number, number] : null);
        const end = link.end ?? (toPlayer ? [toPlayer.x, toPlayer.y] as [number, number] : null);
        const active = link.team === possession;
        return {
          ...link,
          start,
          end,
          active,
          points: start && end
            ? [
                [start[0] - PITCH_L / 2, 0.45, start[1] - PITCH_W / 2],
                [end[0] - PITCH_L / 2, 0.45, end[1] - PITCH_W / 2],
              ] as [number, number, number][]
            : null,
        };
      })
      .filter((link) => link.points);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return (
    <group>
      {links.map((link) => (
        <Line
          key={link.key}
          points={link.points!}
          color={link.team === "NLA" ? "#FF4D7D" : "#3DF5FF"}
          transparent
          opacity={link.active ? 0.82 : 0.34}
          lineWidth={1.2 + Math.min(3.2, link.count * 0.24)}
          depthWrite={false}
          toneMapped={false}
        />
      ))}
      {links.slice(0, 3).filter((link) => link.count >= 3 && link.start && link.end).map((link) => (
        <Html
          key={`label_${link.key}`}
          center
          distanceFactor={58}
          position={[
            ((link.start![0] + link.end![0]) / 2) - PITCH_L / 2,
            0.9,
            ((link.start![1] + link.end![1]) / 2) - PITCH_W / 2,
          ]}
          zIndexRange={[12, 0]}
        >
          <div
            className="pointer-events-none whitespace-nowrap border border-white/25 bg-slate-950/80 px-1.5 py-0.5 font-tech text-[9px] font-bold tracking-wide backdrop-blur-md"
            style={{ color: link.team === "NLA" ? "#FF4D7D" : "#3DF5FF" }}
          >
            {link.count}x · {link.deltaXt >= 0 ? "+" : ""}{link.deltaXt.toFixed(2)} xT
          </div>
        </Html>
      ))}
    </group>
  );
}

export default function SpatialControlSurface3D({ showControl, showNetwork }: Props) {
  return (
    <group>
      {showControl && <ControlSurface />}
      {showNetwork && <PassingNetwork />}
    </group>
  );
}
