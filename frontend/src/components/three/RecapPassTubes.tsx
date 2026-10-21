"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Html, Line } from "@react-three/drei";
import type { RecapPassArc } from "@/lib/types";

function world(x: number, y: number, lift = 0.35) {
  return new THREE.Vector3(x - 52.5, lift, y - 34);
}

export default function RecapPassTubes({ arc }: { arc: RecapPassArc | null }) {
  const key = arc
    ? `${arc.start.x},${arc.start.y},${arc.end.x},${arc.end.y},${arc.ghostEnd.x},${arc.ghostEnd.y}`
    : "empty";

  const geometry = useMemo(() => {
    if (!arc) return null;
    const start = world(arc.start.x, arc.start.y);
    const end = world(arc.end.x, arc.end.y);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    mid.y += 1.6;
    return new THREE.TubeGeometry(
      new THREE.QuadraticBezierCurve3(start, mid, end),
      48,
      0.085,
      8,
      false
    );
  }, [key]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!arc || !geometry) return null;
  const ghostStart = world(arc.ghostStart.x, arc.ghostStart.y, 0.5);
  const ghostEnd = world(arc.ghostEnd.x, arc.ghostEnd.y, 0.5);
  const ghostMid = ghostStart.clone().add(ghostEnd).multiplyScalar(0.5);
  ghostMid.y += 2.0;
  const ghostPoints = new THREE.QuadraticBezierCurve3(
    ghostStart, ghostMid, ghostEnd
  ).getPoints(48);

  return (
    <group>
      <mesh geometry={geometry} renderOrder={3}>
        <meshStandardMaterial
          color="#FFD24D"
          emissive="#FF8A1E"
          emissiveIntensity={2.2}
          transparent
          opacity={0.96}
          toneMapped={false}
        />
      </mesh>
      <Line
        points={ghostPoints}
        color="#38F4FF"
        lineWidth={3}
        dashed
        dashSize={0.7}
        gapSize={0.45}
        transparent
        opacity={0.95}
        depthWrite={false}
      />
      <Html
        center
        position={[arc.end.x - 52.5, 1.5, arc.end.y - 34]}
        distanceFactor={48}
        zIndexRange={[20, 0]}
      >
        <div className="pointer-events-none whitespace-nowrap border border-gold/60 bg-slate-950/85 px-2 py-0.5 font-tech text-[10px] font-bold tracking-wide text-gold">
          ACTUAL BALL
        </div>
      </Html>
      <Html
        center
        position={[arc.ghostEnd.x - 52.5, 1.9, arc.ghostEnd.y - 34]}
        distanceFactor={48}
        zIndexRange={[20, 0]}
      >
        <div className="pointer-events-none whitespace-nowrap border border-tactical/60 bg-slate-950/85 px-2 py-0.5 font-tech text-[10px] font-bold tracking-wide text-tactical">
          GHOST LANE {arc.deltaXt >= 0 ? "+" : ""}{arc.deltaXt.toFixed(3)} xT
          {arc.targetId ? ` · ${arc.targetId}` : ""}
        </div>
      </Html>
    </group>
  );
}
