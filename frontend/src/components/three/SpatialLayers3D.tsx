"use client";
// AETHER PITCH v6.2 — v6.2 3D spatial layers:
//   * WarRoomProjection — the bench war-room's overload zones and adjustment
//     vectors, projected onto the 3D Digital Twin as pulsing ground rings
//     and glowing movement arrows.
//   * XTPassingNetwork — the Stage B top-xT passing lanes rendered as glowing
//     tubes scaled by `xt_weight` (the same 16x12 xT tensor the tactical math
//     uses, so the picture and the numbers can never disagree).

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import type { PassingNetworkEdge, WarRoomVector, WarRoomZone } from "@/lib/types";

const PITCH_L = 105;
const PITCH_W = 68;

function toWorld(x: number, y: number, h = 0): [number, number, number] {
  return [x - PITCH_L / 2, h, y - PITCH_W / 2];
}

/* ------------------------------------------------- bench war-room projection */

interface WarRoomProps {
  zones: WarRoomZone[];
  vectors: WarRoomVector[];
}

export function WarRoomProjection({ zones, vectors }: WarRoomProps) {
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    ringRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.4 + i * 1.3);
      mesh.scale.setScalar(0.85 + pulse * 0.3);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.3 + pulse * 0.4;
    });
  });

  return (
    <group>
      {zones.map((zone, i) => (
        <group key={`${zone.label}-${i}`} position={toWorld(zone.x, zone.y, 0.07)}>
          <mesh
            ref={(el) => { ringRefs.current[i] = el; }}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[3.2, 4.4, 48]} />
            <meshBasicMaterial
              color={i === 0 ? "#FFC24D" : "#00F0FF"}
              transparent
              opacity={0.6}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1.15, 32]} />
            <meshBasicMaterial
              color={i === 0 ? "#FFC24D" : "#00F0FF"}
              transparent
              opacity={0.28}
              toneMapped={false}
            />
          </mesh>
          <Html center position={[0, 2.6, 0]} zIndexRange={[14, 0]}>
            <div
              className="pointer-events-none whitespace-nowrap border border-gold/50 bg-slate-950/85 px-1.5 py-0.5 font-tech text-[9px] font-bold tracking-widest text-gold"
            >
              {zone.label}
            </div>
          </Html>
        </group>
      ))}

      {vectors.map((vector, i) => {
        const from = toWorld(vector.from.x, vector.from.y, 0.6);
        const to = toWorld(vector.to.x, vector.to.y, 0.6);
        return (
          <group key={`${vector.label}-${i}`}>
            <Line
              points={[from, to]}
              color="#FFC24D"
              lineWidth={2.4}
              transparent
              opacity={0.85}
              depthWrite={false}
              toneMapped={false}
            />
            <mesh position={to}>
              <coneGeometry args={[0.7, 1.9, 14]} />
              <meshStandardMaterial
                color="#FFC24D"
                emissive="#FFC24D"
                emissiveIntensity={1.6}
                toneMapped={false}
              />
            </mesh>
            <Html center position={[(from[0] + to[0]) / 2, 2.2, (from[2] + to[2]) / 2]} zIndexRange={[13, 0]}>
              <div className="pointer-events-none whitespace-nowrap border border-gold/40 bg-slate-950/80 px-1.5 py-0.5 font-tech text-[8.5px] font-bold tracking-wider text-gold">
                {vector.label}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------- xT passing network */

interface NetworkProps {
  edges: PassingNetworkEdge[];
}

/**
 * Glowing passing lanes scaled by `xt_weight`. The tube radius and opacity
 * are a direct function of the Stage B Expected Threat gain, so a judge can
 * read the value of a lane off the picture.
 */
export function XTPassingNetwork({ edges }: NetworkProps) {
  const tubes = useMemo(() => {
    return edges.map((edge) => {
      const start = toWorld(edge.from_xy.x, edge.from_xy.y, 0.5);
      const end = toWorld(edge.to_xy.x, edge.to_xy.y, 0.5);
      const mid: [number, number, number] = [
        (start[0] + end[0]) / 2,
        0.5 + Math.min(3.2, edge.xt_weight * 14),
        (start[2] + end[2]) / 2,
      ];
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(...start),
        new THREE.Vector3(...mid),
        new THREE.Vector3(...end),
      );
      return {
        edge,
        points: curve.getPoints(28),
        color: edge.team === "NLA" ? "#FF4D7D" : "#3DF5FF",
      };
    });
  }, [edges]);

  if (!tubes.length) return null;

  const maxWeight = Math.max(...tubes.map((t) => t.edge.xt_weight), 0.001);

  return (
    <group>
      {tubes.map((tube) => {
        const strength = tube.edge.xt_weight / maxWeight;
        return (
          <group key={`${tube.edge.from_id}-${tube.edge.to_id}`}>
            <Line
              points={tube.points}
              color={tube.color}
              lineWidth={1.4 + strength * 4.2}
              transparent
              opacity={0.28 + strength * 0.6}
              depthWrite={false}
              toneMapped={false}
            />
            <Html
              center
              distanceFactor={62}
              position={[
                tube.points[14].x,
                tube.points[14].y + 1.4,
                tube.points[14].z,
              ]}
              zIndexRange={[12, 0]}
            >
              <div
                className="pointer-events-none whitespace-nowrap border border-white/25 bg-slate-950/82 px-1.5 py-0.5 font-tech text-[9px] font-bold tracking-wide"
                style={{ color: tube.color }}
              >
                {tube.edge.from_id}→{tube.edge.to_id} · +{tube.edge.xt_weight.toFixed(2)} xT
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
