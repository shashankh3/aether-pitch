"use client";
// AETHER PITCH v3.0 — PlayerAvatar3D
// Broadcast 14-part biomechanical humanoid rig with
// velocity-locked inverse-kinematics-style procedural animation.
//
// GPU model: the geometry/material pool below is instantiated ONCE at module
// scope — all 22 avatars share the same WebGL vertex buffers and programs, so
// React re-renders never re-allocate or recompile anything on the GPU.
//
// Animation contract (mutated directly in useFrame, never via setState):
//   * position/yaw damped toward the 10Hz tick target (THREE.MathUtils.damp λ=12)
//   * stridePhase accumulated from real ground speed -> zero foot sliding
//   * IDLE  (<1.5 km/h): limbs decay to 0, breathing, ball-tracking head
//   * JOG/SPRINT: stride swing + asymmetric knee flexion (knees only bend
//     backward) + counter-swinging 2-segment arms + sprint torso lean + bob
//   * KICK: ballistic right-leg strike (+ left-arm counter-balance)
//   * GK: widened ready stance, crouched knees, parrying forearms
//   * dual foot-rings, vision cone, signature-trait plumbob,
//     <Text> jersey numbers back+chest, smart-culled <Html> telemetry pill

import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html, Text } from "@react-three/drei";
import { telemetry } from "@/lib/telemetry";
import { clamp, lerpAngle } from "@/lib/utils";
import type { Team } from "@/lib/types";

/* ------------------------------------------- shared singleton geometry pool */
export const TORSO_GEO = new THREE.CylinderGeometry(0.25, 0.20, 0.60, 12);
export const SHOULDER_GEO = new THREE.CapsuleGeometry(0.11, 0.34, 8, 12);
export const SHORTS_GEO = new THREE.CylinderGeometry(0.21, 0.23, 0.28, 12);
export const HEAD_GEO = new THREE.SphereGeometry(0.165, 16, 16);
export const HAIR_GEO = new THREE.SphereGeometry(0.172, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.58);
export const UPPER_ARM_GEO = new THREE.CapsuleGeometry(0.058, 0.24, 6, 10);
export const FOREARM_GEO = new THREE.CapsuleGeometry(0.048, 0.22, 6, 10);
export const THIGH_GEO = new THREE.CapsuleGeometry(0.082, 0.30, 8, 12);
export const CALF_GEO = new THREE.CapsuleGeometry(0.064, 0.30, 8, 12);
export const BOOT_GEO = new THREE.BoxGeometry(0.11, 0.08, 0.25);
export const FOOT_RING_INNER_GEO = new THREE.RingGeometry(0.52, 0.62, 32);
export const FOOT_RING_OUTER_GEO = new THREE.RingGeometry(0.68, 0.74, 32);
export const PLUMBOB_GEO = new THREE.OctahedronGeometry(0.18, 0);
export const CONE_GEO = (() => {
  const g = new THREE.CircleGeometry(2.3, 18, Math.PI / 2 - 0.42, 0.84);
  g.rotateX(Math.PI / 2);
  return g;
})();

/* ------------------------------------------------------ shared material pool */
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
const kitCache = new Map<string, {
  kit: THREE.MeshStandardMaterial; shorts: THREE.MeshStandardMaterial; sock: THREE.MeshStandardMaterial;
}>();
function kitMats(team: Team, isGK: boolean) {
  const key = `${team}-${isGK}`;
  let m = kitCache.get(key);
  if (!m) {
    const colors = isGK
      ? { primary: team === "NLA" ? 0xd9f99d : 0xfde047, shorts: 0x1f2937, sock: 0x334155 }
      : KIT[team];
    m = {
      kit: new THREE.MeshStandardMaterial({
        color: colors.primary, roughness: 0.72,
        emissive: colors.primary, emissiveIntensity: 0.05,
      }),
      shorts: new THREE.MeshStandardMaterial({ color: colors.shorts, roughness: 0.8 }),
      sock: new THREE.MeshStandardMaterial({ color: colors.sock, roughness: 0.8 }),
    };
    kitCache.set(key, m);
  }
  return m;
}

/* ---------------------------------------------------------------- component */
interface Props {
  id: string;
  locked: boolean;
  showPill: boolean;
  alphaOnly: boolean;
  onLock: (id: string | null) => void;
}

function PlayerAvatar3D({ id, locked, showPill, alphaOnly, onLock }: Props) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const torsoGroup = useRef<THREE.Group>(null);
  const headGroup = useRef<THREE.Group>(null);
  const leftShoulder = useRef<THREE.Group>(null);
  const rightShoulder = useRef<THREE.Group>(null);
  const leftElbow = useRef<THREE.Group>(null);
  const rightElbow = useRef<THREE.Group>(null);
  const leftHip = useRef<THREE.Group>(null);
  const rightHip = useRef<THREE.Group>(null);
  const leftKnee = useRef<THREE.Group>(null);
  const rightKnee = useRef<THREE.Group>(null);
  const ringOuter = useRef<THREE.Mesh>(null);
  const ringInner = useRef<THREE.Mesh>(null);
  const ringMatA = useRef<THREE.MeshBasicMaterial>(null);
  const ringMatB = useRef<THREE.MeshBasicMaterial>(null);
  const cone = useRef<THREE.Mesh>(null);
  const plumbob = useRef<THREE.Mesh>(null);
  const plumbobMat = useRef<THREE.MeshStandardMaterial>(null);
  const pillSpeed = useRef<HTMLSpanElement>(null);
  const pillPdr = useRef<HTMLSpanElement>(null);
  const pillAt = useRef(0);
  const stridePhase = useRef(0);
  const kickT0 = useRef(-9999);
  const lastPose = useRef("IDLE");
  const initRef = useRef(false);

  const meta = telemetry.players.get(id);
  const team = (meta?.team ?? "NLA") as Team;
  const isGK = meta?.role === "GK";
  const mats = useMemo(() => kitMats(team, isGK), [team, isGK]);
  const hairMat = useMemo(() => hairMats[(meta?.shirt_number ?? 0) % hairMats.length], [meta?.shirt_number]);
  const teamHex = team === "NLA" ? 0xff1e56 : 0x00f0ff;
  const num = meta?.shirt_number ?? 0;
  const name = meta?.name ?? id;

  useFrame((state, delta) => {
    const s = telemetry.players.get(id);
    if (!s || !root.current) return;
    const now = performance.now();
    const t = state.clock.elapsedTime;

    // ---- pose transition tracking (for the 350ms ballistic kick window) ----
    if (s.pose_state === "KICK" && lastPose.current !== "KICK") kickT0.current = now;
    lastPose.current = s.pose_state;

    // ---- smooth 60fps position + heading (THREE.MathUtils.damp, λ=12) ----
    const targetX = s.x - 52.5;
    const targetZ = s.y - 34;
    if (!initRef.current) {
      root.current.position.set(targetX, 0, targetZ);
      root.current.rotation.y = Math.PI / 2 - s.h;
      initRef.current = true;
    }
    const px = THREE.MathUtils.damp(root.current.position.x, targetX, 12, delta);
    const pz = THREE.MathUtils.damp(root.current.position.z, targetZ, 12, delta);
    root.current.position.x = clamp(px, -53.5, 53.5);
    root.current.position.z = clamp(pz, -35, 35);
    const targetYaw = Math.PI / 2 - s.h;
    root.current.rotation.y = lerpAngle(
      root.current.rotation.y, targetYaw, 1 - Math.exp(-12 * delta)
    );

    // ---- velocity-locked stride phase (zero foot sliding) ----
    stridePhase.current += (s.speed_kmh / 3.6) * delta * 3.9;
    const phase = stridePhase.current;
    const amp = Math.min(0.92, s.speed_kmh * 0.032);
    const idle = s.speed_kmh < 1.5;

    const L = { hip: leftHip.current, knee: leftKnee.current, sh: leftShoulder.current, el: leftElbow.current };
    const R = { hip: rightHip.current, knee: rightKnee.current, sh: rightShoulder.current, el: rightElbow.current };
    if (!L.hip || !R.hip || !L.knee || !R.knee || !L.sh || !R.sh || !L.el || !R.el || !torsoGroup.current) return;

    if (s.pose_state === "KICK") {
      // ---- ballistic strike window (right leg swings through the ball) ----
      const kt = clamp((now - kickT0.current) / 350, 0, 1);
      const strike = Math.sin(kt * Math.PI);
      R.hip.rotation.x = THREE.MathUtils.damp(R.hip.rotation.x, -1.05 * strike - 0.1, 22, delta);
      R.knee.rotation.x = THREE.MathUtils.damp(R.knee.rotation.x, 0.1, 22, delta);
      L.hip.rotation.x = THREE.MathUtils.damp(L.hip.rotation.x, 0.25, 14, delta);
      L.knee.rotation.x = THREE.MathUtils.damp(L.knee.rotation.x, 0.35, 14, delta);
      L.sh.rotation.x = THREE.MathUtils.damp(L.sh.rotation.x, 0.85, 18, delta); // counter-balance
      R.sh.rotation.x = THREE.MathUtils.damp(R.sh.rotation.x, -0.5, 18, delta);
      torsoGroup.current.rotation.x = Math.min(0.36, s.speed_kmh * 0.011) - strike * 0.12;
    } else if (idle) {
      // ---- IDLE: limbs decay to neutral + breathing + ball-tracking head ----
      const decay = 1 - Math.exp(-8 * delta);
      L.hip.rotation.x *= 1 - decay; R.hip.rotation.x *= 1 - decay;
      L.knee.rotation.x = THREE.MathUtils.damp(L.knee.rotation.x, 0.08, 8, delta);
      R.knee.rotation.x = THREE.MathUtils.damp(R.knee.rotation.x, 0.08, 8, delta);
      L.sh.rotation.x *= 1 - decay; R.sh.rotation.x *= 1 - decay;
      L.el.rotation.x = THREE.MathUtils.damp(L.el.rotation.x, -0.45, 8, delta);
      R.el.rotation.x = THREE.MathUtils.damp(R.el.rotation.x, -0.45, 8, delta);
      torsoGroup.current.rotation.x = THREE.MathUtils.damp(torsoGroup.current.rotation.x, 0.04, 6, delta);
      torsoGroup.current.position.y = 0.92 + Math.sin(t * 2.5) * 0.015; // breathing
      if (isGK) {
        // goalkeeper ready stance: wide base, crouched, parrying forearms
        L.hip.rotation.z = THREE.MathUtils.damp(L.hip.rotation.z, -0.18, 8, delta);
        R.hip.rotation.z = THREE.MathUtils.damp(R.hip.rotation.z, 0.18, 8, delta);
        L.knee.rotation.x = THREE.MathUtils.damp(L.knee.rotation.x, 0.35, 8, delta);
        R.knee.rotation.x = THREE.MathUtils.damp(R.knee.rotation.x, 0.35, 8, delta);
        L.sh.rotation.z = THREE.MathUtils.damp(L.sh.rotation.z, 0.55, 8, delta);
        R.sh.rotation.z = THREE.MathUtils.damp(R.sh.rotation.z, -0.55, 8, delta);
        L.sh.rotation.x = THREE.MathUtils.damp(L.sh.rotation.x, -0.5, 8, delta);
        R.sh.rotation.x = THREE.MathUtils.damp(R.sh.rotation.x, -0.5, 8, delta);
        L.el.rotation.x = THREE.MathUtils.damp(L.el.rotation.x, -1.55, 8, delta);
        R.el.rotation.x = THREE.MathUtils.damp(R.el.rotation.x, -1.55, 8, delta);
      } else {
        L.hip.rotation.z = THREE.MathUtils.damp(L.hip.rotation.z, 0, 8, delta);
        R.hip.rotation.z = THREE.MathUtils.damp(R.hip.rotation.z, 0, 8, delta);
        L.sh.rotation.z = THREE.MathUtils.damp(L.sh.rotation.z, 0.1, 8, delta);
        R.sh.rotation.z = THREE.MathUtils.damp(R.sh.rotation.z, -0.1, 8, delta);
      }
    } else {
      // ---- JOG / SPRINT gait ----
      L.hip.rotation.x = Math.sin(phase) * amp;
      R.hip.rotation.x = Math.sin(phase + Math.PI) * amp;
      // human knees only bend backward (asymmetric flexion w/ 0.4 rad offset)
      L.knee.rotation.x = Math.max(0.08, -Math.sin(phase - 0.4) * amp * 1.35);
      R.knee.rotation.x = Math.max(0.08, -Math.sin(phase + Math.PI - 0.4) * amp * 1.35);
      // counter-swinging 2-segment arms
      L.sh.rotation.x = -Math.sin(phase) * amp * 0.85;
      R.sh.rotation.x = -Math.sin(phase + Math.PI) * amp * 0.85;
      L.el.rotation.x = -0.45 - (s.speed_kmh > 26 ? 0.45 : 0.15);
      R.el.rotation.x = -0.45 - (s.speed_kmh > 26 ? 0.45 : 0.15);
      L.sh.rotation.z = THREE.MathUtils.damp(L.sh.rotation.z, 0.12, 10, delta);
      R.sh.rotation.z = THREE.MathUtils.damp(R.sh.rotation.z, -0.12, 10, delta);
      L.hip.rotation.z = THREE.MathUtils.damp(L.hip.rotation.z, 0, 10, delta);
      R.hip.rotation.z = THREE.MathUtils.damp(R.hip.rotation.z, 0, 10, delta);
      // forward sprint torso lean + vertical bob
      torsoGroup.current.rotation.x = Math.min(0.36, s.speed_kmh * 0.011);
      torsoGroup.current.position.y = 0.92;
      root.current.position.y = Math.abs(Math.cos(phase)) * Math.min(0.09, s.speed_kmh * 0.0028);
    }

    // ---- head tracks the ball (clamped neck) ----
    if (headGroup.current) {
      const b = telemetry.ball;
      const bwx = b.x - 52.5 - root.current.position.x;
      const bwz = b.y - 34 - root.current.position.z;
      const worldAng = Math.atan2(bwx, bwz);
      let local = worldAng - root.current.rotation.y;
      local = Math.atan2(Math.sin(local), Math.cos(local));
      headGroup.current.rotation.y = lerpAngle(headGroup.current.rotation.y, clamp(local, -0.85, 0.85), 0.12);
      const bdist = Math.max(2, Math.hypot(bwx, bwz));
      headGroup.current.rotation.x = clamp(-Math.atan2(b.z - 1.68, bdist) * 0.5, -0.35, 0.3);
    }

    // ---- dual foot-ring ----
    const sprinting = s.speed_kmh >= 30;
    const isCarrier = telemetry.match.carrier === id;
    const active = locked || isCarrier;
    if (ringOuter.current && ringInner.current && ringMatA.current && ringMatB.current) {
      const vis = active || sprinting;
      ringOuter.current.visible = vis;
      ringInner.current.visible = vis;
      if (vis) {
        ringOuter.current.rotation.z += delta * 2.2;
        ringInner.current.rotation.z -= delta * 3.1;
        const pulse = 0.55 + 0.3 * Math.sin(t * 5);
        ringMatA.current.opacity = active ? pulse : 0.35;
        ringMatB.current.opacity = active ? pulse * 0.9 : 0.3;
        ringMatA.current.color.setHex(active ? 0xffc24d : sprinting ? 0xff1e56 : teamHex);
        ringMatB.current.color.setHex(active ? 0x00f0ff : sprinting ? 0xff1e56 : teamHex);
      }
    }

    // ---- vision cone ----
    if (cone.current) {
      const mat = cone.current.material as THREE.MeshBasicMaterial;
      cone.current.visible = s.speed_kmh > 1.5;
      mat.opacity = 0.04 + Math.min(0.1, s.speed_kmh * 0.012);
    }

    // ---- signature-trait plumbob ----
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
          : badge === "INTERCEPT" ? 0xff1e56
          : badge === "INCISIVE_PASS" ? 0x00f0ff
          : 0xffc24d
        );
        plumbobMat.current.emissiveIntensity = 1.6 + Math.sin(t * 6) * 0.5;
      }
    }

    if (now - pillAt.current >= 100) {
      pillAt.current = now;
      if (pillSpeed.current) pillSpeed.current.textContent = `${s.speed_kmh.toFixed(1)} km/h`;
      if (pillPdr.current) {
        const pdr = telemetry.pdrByPlayer.get(id);
        pillPdr.current.textContent = pdr != null ? `PDR ${pdr.toFixed(0)}%` : "—";
      }
    }
  });

  return (
    <group
      ref={root}
      onPointerDown={(e) => {
        e.stopPropagation();
        onLock(id);
      }}
    >
      {/* ======== biomechanical body (hidden in broadcast alpha mode) ======== */}
      <group ref={body} visible={!alphaOnly}>
        {/* pelvis / shorts */}
        <mesh geometry={SHORTS_GEO} material={mats.shorts} position={[0, 0.98, 0]} castShadow />

        {/* torso group: lean + breathing */}
        <group ref={torsoGroup} position={[0, 0.92, 0]}>
          <mesh geometry={TORSO_GEO} material={mats.kit} position={[0, 0.30, 0]} castShadow />
          <mesh geometry={SHOULDER_GEO} material={mats.kit} position={[0, 0.54, 0]} rotation={[0, 0, Math.PI / 2]} castShadow />

          {/* jersey numbers: back + chest (drei troika SDF text) */}
          <Text
            fontSize={0.15}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            position={[0, 0.34, -0.235]}
            rotation={[0, Math.PI, 0]}
            outlineWidth={0.006}
            outlineColor="#0b1220"
          >
            {String(num)}
          </Text>
          <Text
            fontSize={0.1}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            position={[0, 0.42, 0.235]}
            outlineWidth={0.005}
            outlineColor="#0b1220"
          >
            {String(num)}
          </Text>

          {/* head + hair + tracked neck */}
          <group ref={headGroup} position={[0, 0.72, 0]}>
            <mesh geometry={HEAD_GEO} material={skinMat} castShadow />
            <mesh geometry={HAIR_GEO} material={hairMat} position={[0, 0.01, -0.015]} />
          </group>

          {/* counter-swinging 2-segment arms */}
          <group ref={leftShoulder} position={[-0.31, 0.44, 0]}>
            <mesh geometry={UPPER_ARM_GEO} material={mats.kit} position={[0, -0.17, 0]} castShadow />
            <group ref={leftElbow} position={[0, -0.34, 0]}>
              <mesh geometry={FOREARM_GEO} material={skinMat} position={[0, -0.14, 0]} />
            </group>
          </group>
          <group ref={rightShoulder} position={[0.31, 0.44, 0]}>
            <mesh geometry={UPPER_ARM_GEO} material={mats.kit} position={[0, -0.17, 0]} castShadow />
            <group ref={rightElbow} position={[0, -0.34, 0]}>
              <mesh geometry={FOREARM_GEO} material={skinMat} position={[0, -0.14, 0]} />
            </group>
          </group>
        </group>

        {/* legs: hip pivots -> knee pivots -> socks + metallic cleats */}
        <group ref={leftHip} position={[-0.12, 0.92, 0]}>
          <mesh geometry={THIGH_GEO} material={mats.shorts} position={[0, -0.23, 0]} castShadow />
          <group ref={leftKnee} position={[0, -0.46, 0]}>
            <mesh geometry={CALF_GEO} material={mats.sock} position={[0, -0.21, 0]} castShadow />
            <mesh geometry={BOOT_GEO} material={bootMat} position={[0, -0.42, 0.05]} />
          </group>
        </group>
        <group ref={rightHip} position={[0.12, 0.92, 0]}>
          <mesh geometry={THIGH_GEO} material={mats.shorts} position={[0, -0.23, 0]} castShadow />
          <group ref={rightKnee} position={[0, -0.46, 0]}>
            <mesh geometry={CALF_GEO} material={mats.sock} position={[0, -0.21, 0]} castShadow />
            <mesh geometry={BOOT_GEO} material={bootMat} position={[0, -0.42, 0.05]} />
          </group>
        </group>
      </group>

      {/* ======== AR layer (always visible, even in alpha) ======== */}
      <mesh ref={ringOuter} geometry={FOOT_RING_OUTER_GEO} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial ref={ringMatA} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ringInner} geometry={FOOT_RING_INNER_GEO} position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial ref={ringMatB} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={cone} geometry={CONE_GEO} position={[0, 0.03, 0]}>
        <meshBasicMaterial color={teamHex} transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={plumbob} geometry={PLUMBOB_GEO} position={[0, 2.45, 0]} visible={false}>
        <meshStandardMaterial ref={plumbobMat} color={0xffc24d} emissive={0xffc24d} emissiveIntensity={1.6} transparent opacity={0.92} />
      </mesh>

      {/* smart-culled floating telemetry pill (max ~4 live at once) */}
      {showPill && (
        <Html center distanceFactor={26} position={[0, 2.15, 0]} zIndexRange={[20, 0]}>
          <div className="clip-ea pointer-events-none flex items-center gap-2 border border-white/25 bg-slate-950/80 px-2.5 py-1"
            style={{ boxShadow: "0 4px 18px rgba(0,0,0,0.5)" }}>
            <span className="font-display text-[15px] leading-none text-white">#{num} {name}</span>
            <span ref={pillSpeed} className="font-tech text-[12px] font-bold leading-none text-tactical">0.0 km/h</span>
            <span ref={pillPdr} className="font-tech text-[11px] leading-none text-gold">—</span>
          </div>
        </Html>
      )}
    </group>
  );
}

export default memo(PlayerAvatar3D);
