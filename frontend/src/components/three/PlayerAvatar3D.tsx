"use client";
// AETHER PITCH v2.0 — PlayerAvatar3D
// Articulated 3D humanoid footballer with a procedural skeletal animation
// state machine, EA FC 27 HyperMotion foot-rings, vision cone, PlayStyle+
// plumbob and a floating glass telemetry pill.
//
// Perf model: geometries/materials are module-level singletons shared by all
// 22 avatars; every continuous value is read from the 10Hz telemetry store
// inside useFrame (velocity-extrapolated to 60fps) so React never re-renders
// at tick rate.

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { telemetry, tickAlpha } from "@/lib/telemetry";
import { lerpAngle, clamp } from "@/lib/utils";
import type { Team } from "@/lib/types";

/* ------------------------------------------------------------------ geometry */
const G = {
  torso: new THREE.CapsuleGeometry(0.2, 0.34, 4, 10),
  shoulder: new THREE.SphereGeometry(0.115, 10, 8),
  head: new THREE.SphereGeometry(0.125, 14, 12),
  hair: new THREE.SphereGeometry(0.132, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.1),
  neck: new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8),
  upperArm: new THREE.CapsuleGeometry(0.052, 0.22, 4, 8),
  forearm: new THREE.CapsuleGeometry(0.044, 0.2, 4, 8),
  thigh: new THREE.CapsuleGeometry(0.078, 0.26, 4, 8),
  shin: new THREE.CapsuleGeometry(0.056, 0.26, 4, 8),
  boot: new THREE.BoxGeometry(0.11, 0.07, 0.26),
  ringOuter: new THREE.RingGeometry(0.44, 0.52, 44),
  ringInner: new THREE.RingGeometry(0.28, 0.33, 40),
  cone: (() => {
    const g = new THREE.CircleGeometry(2.3, 18, Math.PI / 2 - 0.42, 0.84);
    g.rotateX(Math.PI / 2);
    return g;
  })(),
  plumbob: new THREE.OctahedronGeometry(0.15),
};

/* ------------------------------------------------------------------ materials */
const skinMat = new THREE.MeshStandardMaterial({ color: 0xb97f5e, roughness: 0.65 });
const hairMats = [0x18100c, 0x2e1d12, 0x0b0b0d, 0x3b2a17].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })
);
const bootMat = new THREE.MeshStandardMaterial({
  color: 0x10141a, roughness: 0.3, metalness: 0.7,
});
const KIT = {
  NLA: { primary: 0xe11d48, shorts: 0x7f0f26, sock: 0xc2185b },
  MCS: { primary: 0x00e5ff, shorts: 0x0a1a2f, sock: 0x0284c7 },
};
const kitCache = new Map<string, { kit: THREE.MeshStandardMaterial; shorts: THREE.MeshStandardMaterial; sock: THREE.MeshStandardMaterial; emissive: THREE.Color }>();
function kitMats(team: Team, isGK: boolean) {
  const key = `${team}-${isGK}`;
  let m = kitCache.get(key);
  if (!m) {
    const colors = isGK
      ? { primary: team === "NLA" ? 0xd9f99d : 0xfde047, shorts: 0x1f2937, sock: 0x334155 }
      : KIT[team];
    const kit = new THREE.MeshStandardMaterial({
      color: colors.primary, roughness: 0.72,
      emissive: colors.primary, emissiveIntensity: 0.05,
    });
    const shorts = new THREE.MeshStandardMaterial({ color: colors.shorts, roughness: 0.8 });
    const sock = new THREE.MeshStandardMaterial({ color: colors.sock, roughness: 0.8 });
    m = { kit, shorts, sock, emissive: new THREE.Color(colors.primary) };
    kitCache.set(key, m);
  }
  return m;
}

/* ------------------------------------------------------- shirt number decal */
const numberTexCache = new Map<number, THREE.CanvasTexture>();
function numberTexture(num: number): THREE.CanvasTexture {
  let t = numberTexCache.get(num);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = "700 84px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(num), 64, 70);
    t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    numberTexCache.set(num, t);
  }
  return t;
}

/* ---------------------------------------------------------------- component */
interface Props {
  id: string;
  locked: boolean;
  showPill: boolean;
  onLock: (id: string | null) => void;
}

export default function PlayerAvatar3D({ id, locked, showPill, onLock }: Props) {
  const root = useRef<THREE.Group>(null);
  const torsoPivot = useRef<THREE.Group>(null);
  const headPivot = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const ringOuter = useRef<THREE.Mesh>(null);
  const ringInner = useRef<THREE.Mesh>(null);
  const ringMatA = useRef<THREE.MeshBasicMaterial>(null);
  const ringMatB = useRef<THREE.MeshBasicMaterial>(null);
  const cone = useRef<THREE.Mesh>(null);
  const plumbob = useRef<THREE.Mesh>(null);
  const plumbobMat = useRef<THREE.MeshStandardMaterial>(null);
  const pillSpeed = useRef<HTMLSpanElement>(null);
  const pillPdr = useRef<HTMLSpanElement>(null);

  const meta = telemetry.players.get(id);
  const team = (meta?.team ?? "NLA") as Team;
  const isGK = meta?.role === "GK";
  const mats = useMemo(() => kitMats(team, isGK), [team, isGK]);
  const numTex = useMemo(() => numberTexture(meta?.shirt_number ?? 0), [meta?.shirt_number]);
  const hairMat = useMemo(() => hairMats[(meta?.shirt_number ?? 0) % hairMats.length], [meta?.shirt_number]);
  const teamHex = team === "NLA" ? 0xff1e56 : 0x00f0ff;

  useFrame((state, delta) => {
    const s = telemetry.players.get(id);
    if (!s || !root.current) return;
    const now = performance.now();
    const t = state.clock.elapsedTime;

    // ---- 60fps velocity extrapolation between 10Hz ticks ----
    const a = tickAlpha(s, now);
    const k = clamp(a, 0, 1);
    let wx = s.px + (s.x - s.px) * k - 52.5;
    let wz = s.py + (s.y - s.py) * k - 34;
    if (a > 1) {
      const dn = Math.hypot(s.vx, s.vy) || 1;
      const sp = (s.speed_kmh / 3.6) * (a - 1) * 0.1; // seconds past tick
      wx += (s.vx / dn) * sp;
      wz += (s.vy / dn) * sp;
    }
    root.current.position.set(clamp(wx, -53.5, 53.5), 0, clamp(wz, -35, 35));
    root.current.rotation.y = Math.PI / 2 - lerpAngle(s.ph, s.h, k);

    // ---- procedural gait state machine ----
    const freq = Math.max(2.5, s.speed_kmh * 0.65);
    const amp = Math.min(0.85, s.speed_kmh * 0.032);
    const swing = Math.sin(t * freq) * amp;
    if (legL.current && legR.current && kneeL.current && kneeR.current && armL.current && armR.current && torsoPivot.current) {
      legL.current.rotation.x = swing;
      legR.current.rotation.x = -swing;
      kneeL.current.rotation.x = Math.max(0, -swing) * 1.1;
      kneeR.current.rotation.x = Math.max(0, swing) * 1.1;
      armL.current.rotation.x = -swing * 0.8;
      armR.current.rotation.x = swing * 0.8;
      // KICK: sharp forward strike on the right leg over 350ms
      const kt = (now - s.kickT0) / 350;
      if (kt >= 0 && kt < 1) {
        const strike = Math.sin(kt * Math.PI);
        legR.current.rotation.x += strike * 1.1;
        kneeR.current.rotation.x = Math.max(0, Math.cos(kt * Math.PI)) * 0.9;
        torsoPivot.current.rotation.x = Math.min(0.38, s.speed_kmh * 0.011) - strike * 0.12;
      } else {
        torsoPivot.current.rotation.x = Math.min(0.38, s.speed_kmh * 0.011);
      }
      torsoPivot.current.position.y = 1.02 + Math.sin(t * freq * 2) * amp * 0.02;
      // arms hold slightly away from the body
      armL.current.rotation.z = 0.14;
      armR.current.rotation.z = -0.14;
    }

    // ---- head tracks the ball (clamped neck) ----
    if (headPivot.current) {
      const b = telemetry.ball;
      const bwx = b.x - 52.5 - root.current.position.x;
      const bwz = b.y - 34 - root.current.position.z;
      const worldAng = Math.atan2(bwx, bwz);
      let local = worldAng - root.current.rotation.y;
      local = Math.atan2(Math.sin(local), Math.cos(local));
      headPivot.current.rotation.y = lerpAngle(headPivot.current.rotation.y, clamp(local, -0.7, 0.7), 0.12);
      const bdist = Math.hypot(bwx, bwz);
      headPivot.current.rotation.x = clamp(-Math.atan2(b.z - 1.6, Math.max(2, bdist)) * 0.5, -0.35, 0.3);
    }

    // ---- HyperMotion dual foot-ring ----
    const sprinting = s.speed_kmh >= 30;
    const isCarrier = telemetry.match.carrier === id;
    const active = locked || isCarrier;
    if (ringOuter.current && ringInner.current && ringMatA.current && ringMatB.current) {
      const vis = active || sprinting;
      ringOuter.current.visible = vis;
      ringInner.current.visible = vis;
      ringOuter.current.rotation.z += delta * 2.2;
      ringInner.current.rotation.z -= delta * 3.1;
      const pulse = 0.55 + 0.3 * Math.sin(t * 5);
      ringMatA.current.opacity = vis ? (active ? pulse : 0.35) : 0;
      ringMatB.current.opacity = vis ? (active ? pulse * 0.9 : 0.3) : 0;
      ringMatA.current.color.setHex(active ? 0xffc24d : sprinting ? 0xff1e56 : teamHex);
      ringMatB.current.color.setHex(active ? 0x00f0ff : sprinting ? 0xff1e56 : teamHex);
    }

    // ---- vision cone ----
    if (cone.current) {
      const mat = cone.current.material as THREE.MeshBasicMaterial;
      cone.current.visible = s.speed_kmh > 1.5;
      mat.opacity = 0.04 + Math.min(0.1, s.speed_kmh * 0.012);
    }

    // ---- PlayStyle+ plumbob ----
    if (plumbob.current && plumbobMat.current) {
      const badge = s.playstyle_badge;
      const vis = locked || isCarrier || !!badge;
      plumbob.current.visible = vis;
      if (vis) {
        plumbob.current.rotation.y += delta * 2.6;
        plumbob.current.position.y = 2.45 + Math.sin(t * 2.2) * 0.07;
        plumbobMat.current.color.setHex(
          locked ? 0xffc24d
          : isCarrier ? 0x00f0ff
          : badge === "INTERCEPT+" ? 0xff1e56
          : badge === "INCISIVE_PASS+" ? 0x00f0ff
          : 0xffc24d
        );
        plumbobMat.current.emissiveIntensity = 1.6 + Math.sin(t * 6) * 0.5;
      }
    }

    // ---- live pill values ----
    if (pillSpeed.current) pillSpeed.current.textContent = `${s.speed_kmh.toFixed(1)} km/h`;
    if (pillPdr.current) {
      const pdr = telemetry.pdrByPlayer.get(id);
      pillPdr.current.textContent = pdr != null ? `PDR ${pdr.toFixed(0)}%` : "—";
    }
  });

  const num = meta?.shirt_number ?? 0;
  const name = meta?.name ?? id;
  const numMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: numTex, transparent: true, side: THREE.DoubleSide }),
    [numTex]
  );

  return (
    <group
      ref={root}
      onPointerDown={(e) => {
        e.stopPropagation();
        onLock(id);
      }}
    >
      {/* torso pivot (lean + bob) */}
      <group ref={torsoPivot} position={[0, 1.02, 0]}>
        <mesh geometry={G.torso} material={mats.kit} castShadow />
        <mesh geometry={G.shoulder} material={mats.kit} position={[0, 0.26, 0]} castShadow />
        {/* shirt number decals: back + chest */}
        <mesh material={numMat} position={[0, 0.08, -0.215]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.26, 0.26]} />
        </mesh>
        <mesh material={numMat} position={[0, 0.1, 0.215]}>
          <planeGeometry args={[0.18, 0.18]} />
        </mesh>
        {/* head + hair + neck */}
        <group ref={headPivot} position={[0, 0.58, 0]}>
          <mesh geometry={G.neck} material={skinMat} position={[0, -0.08, 0]} />
          <mesh geometry={G.head} material={skinMat} castShadow />
          <mesh geometry={G.hair} material={hairMat} position={[0, 0.015, -0.012]} />
        </group>
        {/* arms: shoulder pivots swing in opposition */}
        <group ref={armL} position={[-0.27, 0.18, 0]}>
          <mesh geometry={G.upperArm} material={mats.kit} position={[0, -0.15, 0]} castShadow />
          <group position={[0, -0.3, 0]}>
            <mesh geometry={G.forearm} material={skinMat} position={[0, -0.13, 0]} castShadow />
          </group>
        </group>
        <group ref={armR} position={[0.27, 0.18, 0]}>
          <mesh geometry={G.upperArm} material={mats.kit} position={[0, -0.15, 0]} castShadow />
          <group position={[0, -0.3, 0]}>
            <mesh geometry={G.forearm} material={skinMat} position={[0, -0.13, 0]} castShadow />
          </group>
        </group>
      </group>

      {/* legs: hip pivots + knee pivots + socks + cleats */}
      <group ref={legL} position={[-0.11, 0.95, 0]}>
        <mesh geometry={G.thigh} material={mats.shorts} position={[0, -0.19, 0]} castShadow />
        <group ref={kneeL} position={[0, -0.42, 0]}>
          <mesh geometry={G.shin} material={mats.sock} position={[0, -0.17, 0]} castShadow />
          <mesh geometry={G.boot} material={bootMat} position={[0, -0.33, 0.04]} castShadow />
        </group>
      </group>
      <group ref={legR} position={[0.11, 0.95, 0]}>
        <mesh geometry={G.thigh} material={mats.shorts} position={[0, -0.19, 0]} castShadow />
        <group ref={kneeR} position={[0, -0.42, 0]}>
          <mesh geometry={G.shin} material={mats.sock} position={[0, -0.17, 0]} castShadow />
          <mesh geometry={G.boot} material={bootMat} position={[0, -0.33, 0.04]} castShadow />
        </group>
      </group>

      {/* HyperMotion dual neon foot-ring */}
      <mesh ref={ringOuter} geometry={G.ringOuter} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial ref={ringMatA} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ringInner} geometry={G.ringInner} position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial ref={ringMatB} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* directional vision cone on the grass */}
      <mesh ref={cone} geometry={G.cone} position={[0, 0.03, 0]}>
        <meshBasicMaterial color={teamHex} transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* PlayStyle+ diamond plumbob */}
      <mesh ref={plumbob} geometry={G.plumbob} position={[0, 2.45, 0]} visible={false}>
        <meshStandardMaterial ref={plumbobMat} color={0xffc24d} emissive={0xffc24d} emissiveIntensity={1.6} transparent opacity={0.92} />
      </mesh>

      {/* floating glass telemetry pill (key players only) */}
      {showPill && (
        <Html center distanceFactor={28} position={[0, 2.15, 0]} zIndexRange={[20, 0]}>
          <div className="clip-ea pointer-events-none flex items-center gap-2 border border-white/25 bg-slate-950/80 px-2.5 py-1 backdrop-blur-md"
            style={{ boxShadow: "0 4px 18px rgba(0,0,0,0.5)" }}>
            <span className="font-display text-[15px] leading-none text-white">
              #{num} {name}
            </span>
            <span ref={pillSpeed} className="font-tech text-[12px] font-bold leading-none text-tactical">0.0 km/h</span>
            <span ref={pillPdr} className="font-tech text-[11px] leading-none text-gold">—</span>
          </div>
        </Html>
      )}
    </group>
  );
}
