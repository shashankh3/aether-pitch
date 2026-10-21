"use client";
// AETHER PITCH — Interactive Spatial "What-If" Counterfactual Sandbox (3D).
//
// A transparent catch-plane over the grass raycasts the pointer onto the
// ground. The dragged avatar moves to the pointer, a ghost anchor ring stays
// at the original telemetry position, and a glowing tether measures the
// displacement. All state lives in the mutable `sandbox` store so a 60 fps
// drag never triggers a React re-render.
//
// Coordinate note: the 3D scene is centred on the origin (x -52.5, z -34)
// while telemetry uses absolute pitch metres (0..105, 0..68). The conversion
// happens here, at the 3D boundary.

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import {
  moveSandboxPlayer, sandbox, setSandboxDragging,
} from "@/lib/sandboxStore";

const PITCH_L = 105;
const PITCH_W = 68;

const toWorldX = (pitchX: number) => pitchX - PITCH_L / 2;
const toWorldZ = (pitchY: number) => pitchY - PITCH_W / 2;
const toPitchX = (worldX: number) => worldX + PITCH_L / 2;
const toPitchY = (worldZ: number) => worldZ + PITCH_W / 2;

export default function CounterfactualDragLayer({
  active,
  onSelectPlayer,
}: {
  /** React prop, not the store: the layer must mount when the sandbox opens. */
  active: boolean;
  onSelectPlayer?: (playerId: string, x: number, y: number) => void;
}) {
  const { camera, gl } = useThree();
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const hit = useRef(new THREE.Vector3());
  const dragging = useRef(false);
  const ringRef = useRef<THREE.Mesh>(null);
  const tetherRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    // The target ring pulses so the judge can see the drop point at a glance.
    if (ringRef.current) {
      const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 4);
      ringRef.current.scale.setScalar(0.9 + pulse * 0.22);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.45 + pulse * 0.45;
    }
  });

  const pointerToPitch = (event: { point?: THREE.Vector3 }): [number, number] | null => {
    const point = event.point;
    if (!point) return null;
    return [
      Math.max(1, Math.min(PITCH_L - 1, toPitchX(point.x))),
      Math.max(1, Math.min(PITCH_W - 1, toPitchY(point.z))),
    ];
  };

  const handlePointerDown = (event: { point?: THREE.Vector3; stopPropagation: () => void }) => {
    event.stopPropagation();
    const pitch = pointerToPitch(event);
    if (!pitch) return;
    dragging.current = true;
    setSandboxDragging(true);
    gl.domElement.style.cursor = "grabbing";
    // Clicking bare grass moves the currently selected player there.
    if (sandbox.playerId) moveSandboxPlayer(pitch[0], pitch[1]);
  };

  const handlePointerMove = (event: { point?: THREE.Vector3 }) => {
    // `sandbox.dragging` is the shared flag: the drag may have started on an
    // avatar (which owns the grab) and continued over bare grass.
    if (!sandbox.dragging || !sandbox.playerId) return;
    const pitch = pointerToPitch(event);
    if (!pitch) return;
    moveSandboxPlayer(pitch[0], pitch[1]);
  };

  const handlePointerUp = () => {
    if (!sandbox.dragging && !dragging.current) return;
    dragging.current = false;
    setSandboxDragging(false);
    gl.domElement.style.cursor = "";
  };

  if (!active || !sandbox.active) return null;

  const originX = toWorldX(sandbox.originX);
  const originZ = toWorldZ(sandbox.originY);
  const currentX = toWorldX(sandbox.x);
  const currentZ = toWorldZ(sandbox.y);

  return (
    <group>
      {/* Transparent catch-plane: receives the pointer, never renders */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerMissed={handlePointerUp}
      >
        <planeGeometry args={[PITCH_L, PITCH_W]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Ghost anchor at the original telemetry position */}
      <mesh position={[originX, 0.06, originZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.85, 1.15, 32]} />
        <meshBasicMaterial
          color="#FFB300"
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[originX, 0.05, originZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.18, 16]} />
        <meshBasicMaterial
          color="#FFB300"
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/* Displacement tether: original -> counterfactual */}
      <group ref={tetherRef}>
        <Line
          points={[
            [originX, 0.35, originZ],
            [currentX, 0.35, currentZ],
          ]}
          color="#00E5FF"
          lineWidth={2.6}
          dashed
          dashScale={3}
          transparent
          opacity={0.9}
          toneMapped={false}
        />
      </group>

      {/* Target ring at the counterfactual position */}
      <mesh
        ref={ringRef}
        position={[currentX, 0.07, currentZ]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[1.15, 1.5, 32]} />
        <meshBasicMaterial
          color="#00E5FF"
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
