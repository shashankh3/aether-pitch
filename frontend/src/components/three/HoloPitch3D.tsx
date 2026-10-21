"use client";
// AETHER PITCH v3.0/v4.0 — HoloPitch3D
// The full WebGL scene root: night-stadium lighting, 22 articulated 14-part
// avatars, the 3D ball, volumetric AR overlays, the telestrator layer, the
// 4-mode broadcast camera rig and Bloom post-processing.
// Broadcast Alpha mode: strips every opaque surface and keeps only the AR
// layer over a transparent / chroma-green canvas for live TV compositing.

import { memo, useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, ChromaticAberration, Noise, BrightnessContrast } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { PerformanceMonitor, Sparkles, Trail } from "@react-three/drei";
import StadiumEnvironment3D from "./StadiumEnvironment3D";
import PlayerAvatar3D from "./PlayerAvatar3D";
import PassVectors3D from "./PassVectors3D";
import BroadcastCameraRig from "./BroadcastCameraRig";
import Telestrator3DOverlays from "./Telestrator3DOverlays";
import SpatialControlSurface3D from "./SpatialControlSurface3D";
import RecapPassTubes from "./RecapPassTubes";
import { WarRoomProjection, XTPassingNetwork } from "./SpatialLayers3D";
import CounterfactualDragLayer from "./CounterfactualDragLayer";
import { DefensiveLasers, XTGrid } from "./TacticalOverlays3D";
import { telemetry, tickAlpha } from "@/lib/telemetry";
import { STANDARD_PALETTE, type BroadcastPalette } from "@/lib/hudContext";
import type {
  CameraDirective, CameraMode, HighlightZone, Metrics, RecapPassArc, TelestratorState,
  WarRoomVector, WarRoomZone,
} from "@/lib/types";

const CA_OFFSET = new THREE.Vector2(0.00045, 0.00045);
const MAX_DPR = 1.5;
const DPR_RANGE: [number, number] = [1, MAX_DPR];
const GL_CONFIG = {
  antialias: false,
  powerPreference: "high-performance" as const,
  alpha: true,
  stencil: false,
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.08,
};
const CAMERA_CONFIG = {
  fov: 42,
  position: [0, 72, 118] as [number, number, number],
  near: 0.5,
  far: 700,
};

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
  warRoomShift: { zones: WarRoomZone[]; vectors: WarRoomVector[] } | null;
  palette?: BroadcastPalette;
  sandboxActive?: boolean;
  onLock: (id: string | null) => void;
}

/* --------------------------------------------------------------- the ball */
function Ball3D() {
  const mesh = useRef<THREE.Mesh>(null);
  const aura = useRef<THREE.Sprite>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const glow = useRef<THREE.PointLight>(null);
  const spin = useRef(0);
  const glowTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(235,255,244,0.95)");
    g.addColorStop(0.35, "rgba(150,255,210,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
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
    if (aura.current) {
      aura.current.position.set(x, 0.16 + y, z);
      const s = 1.8 + Math.min(2.4, b.speed_kmh * 0.035) + Math.sin(state.clock.elapsedTime * 5) * 0.12;
      aura.current.scale.set(s, s, 1);
      (aura.current.material as THREE.SpriteMaterial).opacity = 0.45 + Math.min(0.35, b.speed_kmh * 0.01);
    }
    if (ring.current) {
      ring.current.position.set(x, 0.045, z);
      const rs = 0.7 + Math.min(1.6, b.speed_kmh * 0.025);
      ring.current.scale.setScalar(rs);
    }
    if (ringMat.current) {
      ringMat.current.opacity = 0.26 + Math.min(0.34, b.speed_kmh * 0.008) + Math.sin(state.clock.elapsedTime * 4) * 0.05;
    }
    if (glow.current) {
      glow.current.position.set(x, 0.4 + y, z);
      glow.current.intensity = 2 + Math.min(6, b.speed_kmh * 0.06);
    }
  });
  return (
    <group>
      <mesh ref={mesh} castShadow>
        <sphereGeometry args={[0.12, 20, 20]} />
        <meshStandardMaterial color="#F4F7FA" roughness={0.28} metalness={0.08} emissive="#DFFFF0" emissiveIntensity={0.12} />
      </mesh>
      <Trail
        target={mesh as unknown as MutableRefObject<THREE.Object3D>}
        width={1.4}
        length={6}
        decay={1.4}
        stride={0.16}
        color="#A8FFE8"
        attenuation={(w) => w * 0.28}
      />
      <sprite ref={aura} scale={[2, 2, 1]}>
        <spriteMaterial map={glowTex} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.28, 0.36, 32]} />
        <meshBasicMaterial ref={ringMat} color="#B9FFE1" transparent opacity={0.32} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <pointLight ref={glow} color="#AAFFCC" intensity={2} distance={8} decay={2} />
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

/* --------------------------------------------------------- adaptive quality */
function AdaptiveQuality() {
  const dpr = useThree((state) => state.viewport.dpr);
  const setDpr = useThree((state) => state.setDpr);
  const baseDpr = useMemo(
    () => Math.min(MAX_DPR, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1),
    []
  );
  const applyFactor = useCallback(
    (factor: number) => {
      const next = Math.max(0.75, baseDpr * factor);
      if (Math.abs(next - dpr) > 0.001) setDpr(next);
    },
    [baseDpr, dpr, setDpr]
  );
  return (
    <PerformanceMonitor
      factor={1}
      flipflops={4}
      onChange={(api) => applyFactor(api.factor)}
      onFallback={() => applyFactor(0.75)}
    />
  );
}

const PostFX = memo(function PostFX({ alphaMode }: { alphaMode: boolean }) {
  if (alphaMode) {
    return (
      <EffectComposer multisampling={4}>
        <Bloom intensity={0.85} luminanceThreshold={0.6} mipmapBlur radius={0.76} />
        <Vignette eskil={false} offset={0.18} darkness={0.72} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={4}>
      <Bloom intensity={0.92} luminanceThreshold={0.58} mipmapBlur radius={0.76} />
      <BrightnessContrast brightness={0.02} contrast={0.12} />
      <ChromaticAberration offset={CA_OFFSET} radialModulation={false} modulationOffset={0.15} />
      <Noise opacity={0.022} blendFunction={BlendFunction.OVERLAY} />
      <Vignette eskil={false} offset={0.16} darkness={0.78} />
    </EffectComposer>
  );
});

/* ------------------------------------------------------------------ scene */
function Scene({
  camMode, override, toggles, lockedId, keyIds, metrics,
  telestrator, highlightZone, alphaMode, recapPass, warRoomShift, palette = STANDARD_PALETTE,
  sandboxActive = false, onLock,
}: Props) {
  return (
    <>
      {!alphaMode && <color attach="background" args={["#02040A"]} />}
      {!alphaMode && <fog attach="fog" args={["#06101C", 150, 460]} />}
      <AdaptiveQuality />

      {/* lighting: one shadow-casting floodlight + atmospheric fills */}
      <hemisphereLight args={["#3A4D6E", "#06100C", 0.5]} />
      <ambientLight intensity={0.2} />
      <directionalLight
        position={[42, 85, 40]}
        intensity={1.55}
        color="#EAF2FF"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-60, 50, -40]} intensity={0.52} color="#7FA8FF" />
      <directionalLight position={[55, 40, -55]} intensity={0.38} color="#FFD9A8" />
      <pointLight position={[-54, 7, 0]} intensity={0.5} distance={58} decay={2} color="#FF1E56" />
      <pointLight position={[54, 7, 0]} intensity={0.5} distance={58} decay={2} color="#00F0FF" />

      <StadiumEnvironment3D alphaMode={alphaMode} />
      {!alphaMode && <Sparkles count={64} scale={[120, 22, 82]} position={[0, 9, 0]} size={1.4} speed={0.16} opacity={0.2} color="#A8E8FF" noise={0.4} />}
      {!alphaMode && <Ball3D />}
      <AvatarLayer lockedId={lockedId} keyIds={keyIds} alphaOnly={alphaMode} onLock={onLock} />

      {/* volumetric AR layers */}
      <XTGrid visible={toggles.xtGrid} possession={metrics?.possession ?? "NLA"} />
      <DefensiveLasers visible={toggles.lasers} metrics={metrics} palette={palette} />
      <PassVectors3D showGhost={toggles.ghost} />
      <SpatialControlSurface3D
        showControl={toggles.pitchControl}
        showNetwork={toggles.passingNetwork}
      />
      <CounterfactualDragLayer active={sandboxActive} />
      {toggles.passingNetwork && (
        <XTPassingNetwork edges={metrics?.passing_network_edges ?? []} />
      )}
      {warRoomShift && (
        <WarRoomProjection zones={warRoomShift.zones} vectors={warRoomShift.vectors} />
      )}
      <Telestrator3DOverlays telestrator={telestrator} highlightZone={highlightZone} />
      <RecapPassTubes arc={recapPass} />

      <BroadcastCameraRig mode={camMode} lockedId={lockedId} override={override} />

      <PostFX alphaMode={alphaMode} />
    </>
  );
}

const MemoScene = memo(Scene);

export default function HoloPitch3D(props: Props) {
  return (
    <div
      className="fixed inset-0 z-0"
      data-testid="holopitch-3d"
      role="img"
      aria-label="Live cinematic 3D football stadium broadcast with 22 tracked players and tactical overlays"
    >
      <Canvas
        shadows
        dpr={DPR_RANGE}
        gl={GL_CONFIG}
        camera={CAMERA_CONFIG}
      >
        <MemoScene {...props} />
      </Canvas>
    </div>
  );
}
