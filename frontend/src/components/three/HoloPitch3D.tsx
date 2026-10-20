"use client";
// AETHER PITCH v3.0/v4.0 — HoloPitch3D
// The full WebGL scene root: night-stadium lighting, 22 articulated 14-part
// avatars, the 3D ball, volumetric AR overlays, the telestrator layer, the
// 4-mode broadcast camera rig and Bloom post-processing.
// Broadcast Alpha mode: strips every opaque surface and keeps only the AR
// layer over a transparent / chroma-green canvas for live TV compositing.

import { memo, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import StadiumEnvironment3D from "./StadiumEnvironment3D";
import PlayerAvatar3D from "./PlayerAvatar3D";
import PassVectors3D from "./PassVectors3D";
import BroadcastCameraRig from "./BroadcastCameraRig";
import Telestrator3DOverlays from "./Telestrator3DOverlays";
import SpatialControlSurface3D from "./SpatialControlSurface3D";
import RecapPassTubes from "./RecapPassTubes";
import { DefensiveLasers, XTGrid } from "./TacticalOverlays3D";
import { telemetry, tickAlpha } from "@/lib/telemetry";
import type {
  CameraDirective, CameraMode, HighlightZone, Metrics, RecapPassArc, TelestratorState,
} from "@/lib/types";

export interface OverlayToggles {
  xtGrid: boolean;
  ghost: boolean;
  lasers: boolean;
  pitchControl: boolean;
  passingNetwork: boolean;
}

interface Props {
  camMode: CameraMode;
  override: { directive: CameraDirective; at: number } | null;
  toggles: OverlayToggles;
  lockedId: string | null;
  keyIds: string[];
  metrics: Metrics | null;
  telestrator: TelestratorState;
  highlightZone: HighlightZone | null;
  alphaMode: boolean;
  recapPass: RecapPassArc | null;
  onLock: (id: string | null) => void;
}

/* --------------------------------------------------------------- the ball */
function Ball3D() {
  const mesh = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.PointLight>(null);
  const spin = useRef(0);
  useFrame((state, delta) => {
    const b = telemetry.ball;
    const now = performance.now();
    const a = tickAlpha(b, now);
    const k = Math.min(1, a);
    const x = b.px + (b.x - b.px) * k - 52.5;
    const z = b.py + (b.y - b.py) * k - 34;
    const y = b.pz + (b.z - b.pz) * k;
    if (mesh.current) {
      mesh.current.position.set(x, 0.12 + y, z);
      spin.current += (b.speed_kmh / 3.6) * delta * 2.2;
      mesh.current.rotation.set(spin.current * 0.6, spin.current, 0);
    }
    if (glow.current) {
      glow.current.position.set(x, 0.4 + y, z);
      glow.current.intensity = 2 + Math.min(6, b.speed_kmh * 0.06);
    }
  });
  return (
    <group>
      <mesh ref={mesh} castShadow>
        <sphereGeometry args={[0.12, 18, 18]} />
        <meshStandardMaterial color="#F4F7FA" roughness={0.35} metalness={0.05} />
      </mesh>
      <pointLight ref={glow} color="#AAFFCC" intensity={2} distance={7} decay={2} />
    </group>
  );
}

/* ------------------------------------------------------------ avatar layer */
function AvatarLayer({ lockedId, keyIds, alphaOnly, onLock }: {
  lockedId: string | null;
  keyIds: string[];
  alphaOnly: boolean;
  onLock: (id: string | null) => void;
}) {
  const keySet = useMemo(() => new Set(keyIds), [keyIds]);
  const [ids, setIds] = useState<string[]>([]);
  const sizeRef = useRef(-1);
  useFrame(() => {
    if (telemetry.players.size !== 0 && telemetry.players.size !== sizeRef.current) {
      sizeRef.current = telemetry.players.size;
      setIds(Array.from(telemetry.players.keys()));
    }
  });
  return (
    <group>
      {ids.map((id) => (
        <PlayerAvatar3D
          key={id}
          id={id}
          locked={lockedId === id}
          showPill={keySet.has(id)}
          alphaOnly={alphaOnly}
          onLock={onLock}
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ scene */
function Scene({
  camMode, override, toggles, lockedId, keyIds, metrics,
  telestrator, highlightZone, alphaMode, recapPass, onLock,
}: Props) {
  return (
    <>
      {!alphaMode && <color attach="background" args={["#04060A"]} />}
      {!alphaMode && <fog attach="fog" args={["#04060A", 130, 420]} />}

      {/* lighting: one shadow-casting floodlight + atmospheric fills */}
      <hemisphereLight args={["#33415C", "#0A0F14", 0.42]} />
      <ambientLight intensity={0.16} />
      <directionalLight
        position={[42, 85, 40]}
        intensity={1.35}
        color="#EAF2FF"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-60, 50, -40]} intensity={0.4} color="#7FA8FF" />
      <directionalLight position={[55, 40, -55]} intensity={0.3} color="#FFD9A8" />

      <StadiumEnvironment3D alphaMode={alphaMode} />
      {!alphaMode && <Ball3D />}
      <AvatarLayer lockedId={lockedId} keyIds={keyIds} alphaOnly={alphaMode} onLock={onLock} />

      {/* volumetric AR layers */}
      <XTGrid visible={toggles.xtGrid} possession={metrics?.possession ?? "NLA"} />
      <DefensiveLasers visible={toggles.lasers} metrics={metrics} />
      <PassVectors3D showGhost={toggles.ghost} />
      <SpatialControlSurface3D
        showControl={toggles.pitchControl}
        showNetwork={toggles.passingNetwork}
      />
      <Telestrator3DOverlays telestrator={telestrator} highlightZone={highlightZone} />
      <RecapPassTubes arc={recapPass} />

      <BroadcastCameraRig mode={camMode} lockedId={lockedId} override={override} />

      <EffectComposer>
        <Bloom intensity={0.85} luminanceThreshold={0.6} mipmapBlur radius={0.72} />
        <Vignette eskil={false} offset={0.18} darkness={0.72} />
      </EffectComposer>
    </>
  );
}

const MemoScene = memo(Scene);

export default function HoloPitch3D(props: Props) {
  return (
    <div className="fixed inset-0 z-0" data-testid="holopitch-3d">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
        camera={{ fov: 42, position: [0, 38, 55], near: 0.5, far: 700 }}
      >
        <MemoScene {...props} />
      </Canvas>
    </div>
  );
}
