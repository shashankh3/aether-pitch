"use client";
// AETHER PITCH v2.0 — BroadcastCameraRig
// Four damped camera modes for the 3D WebGL broadcast:
//   1. TELE_BROADCAST          classic broadcast TV camera
//   2. PLAYER_LOCK_3RD_PERSON  pro cam behind the locked avatar
//   3. TACTICAL_DRONE_ORBIT    3D digital twin — free 360 orbit
//   4. AUTO_DIRECTOR           "The 12th Man" AI cam: tele during buildup,
//                              dramatic low-angle swoop on high chaos /
//                              Stage (d) overlay triggers
// The AI camera_directive from Stage (c)/(d) temporarily overrides the
// judge's selection (director override, 6.5 s hold).

import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { telemetry, tickAlpha } from "@/lib/telemetry";
import { clamp, lerpAngle } from "@/lib/utils";
import type { CameraDirective, CameraMode } from "@/lib/types";

interface Props {
  mode: CameraMode;
  lockedId: string | null;
  override: { directive: CameraDirective; at: number } | null;
}

const OVERRIDE_MS = 6500;

function ballWorld(out: THREE.Vector3, now: number): THREE.Vector3 {
  const b = telemetry.ball;
  const a = tickAlpha(b, now);
  const k = clamp(a, 0, 1);
  out.set(
    b.px + (b.x - b.px) * k - 52.5,
    b.pz + (b.z - b.pz) * k,
    b.py + (b.y - b.py) * k - 34
  );
  return out;
}

export default function BroadcastCameraRig({ mode, lockedId, override }: Props) {
  const { camera } = useThree();
  const pos = useRef(new THREE.Vector3(0, 72, 118));
  const look = useRef(new THREE.Vector3(0, 0, 0));
  const tmpBall = useRef(new THREE.Vector3());
  const tmpTarget = useRef(new THREE.Vector3());
  const tmpLook = useRef(new THREE.Vector3());
  const lastScore = useRef("0-0");
  const shake = useRef(0);
  const fov = useRef(42);

  // OrbitControls must follow the *effective* mode, not the manual selection.
  const overrideMode = override?.directive.recommended_mode;
  const effectiveMode: CameraMode | "TACTICAL_DRONE" =
    overrideMode === "ACTION_ZOOM" ? "AUTO_DIRECTOR" : overrideMode ?? mode;
  const droneActive =
    effectiveMode === "TACTICAL_DRONE" || effectiveMode === "TACTICAL_DRONE_ORBIT";

  useFrame((state, delta) => {
    const now = performance.now();
    ballWorld(tmpBall.current, now);

    const scoreKey = `${telemetry.match.score.NLA}-${telemetry.match.score.MCS}`;
    if (scoreKey !== lastScore.current) {
      lastScore.current = scoreKey;
      shake.current = 0.85;
    }

    // ---- AI director override (6.5s hold; page clears the prop) ----
    let effective: CameraMode | "TACTICAL_DRONE" = mode;
    let focusId: string | null = null;
    if (override && now - override.at < OVERRIDE_MS) {
      const d = override.directive;
      if (d.recommended_mode === "ACTION_ZOOM") effective = "AUTO_DIRECTOR";
      else effective = d.recommended_mode;
      focusId = d.focus_target_id;
    }

    const cam = camera as THREE.PerspectiveCamera;
    const targetFov = effective === "PLAYER_LOCK_3RD_PERSON" ? 54 : effective === "AUTO_DIRECTOR" ? 47 : 42;
    fov.current += (targetFov - fov.current) * Math.min(1, delta * 2.6);
    if (Math.abs(cam.fov - fov.current) > 0.01) {
      cam.fov = fov.current;
      cam.updateProjectionMatrix();
    }

    if (effective === "TACTICAL_DRONE" || effective === "TACTICAL_DRONE_ORBIT") {
      pos.current.copy(camera.position);
      return; // OrbitControls owns the camera in this mode
    }

    const lerpK = 1 - Math.pow(0.0015, delta); // frame-rate independent damping
    const b = telemetry.ball;
    const leadX = clamp(b.vx * 0.24, -7, 7);
    const leadZ = clamp(b.vy * 0.2, -5, 5);
    const push = clamp((b.speed_kmh - 18) / 48, 0, 1);

    if (effective === "PLAYER_LOCK_3RD_PERSON") {
      const pid = focusId || lockedId;
      const s = pid ? telemetry.players.get(pid) : null;
      if (s) {
        const a = tickAlpha(s, now);
        const k = clamp(a, 0, 1);
        const px = s.px + (s.x - s.px) * k - 52.5;
        const pz = s.py + (s.y - s.py) * k - 34;
        const yaw = Math.PI / 2 - lerpAngle(s.ph, s.h, k);
        // behind the player: offset -8 along facing dir, 5.5 up
        const dirX = Math.sin(yaw);
        const dirZ = Math.cos(yaw);
        const bob = Math.sin(state.clock.elapsedTime * (2.2 + s.speed_kmh * 0.04)) * 0.08;
        const camX = clamp(px - dirX * 8.4, -49, 49);
        const camZ = clamp(pz - dirZ * 8.4, -31, 31);
        tmpTarget.current.set(camX, 5.4 + bob, camZ);
        tmpLook.current.set(px + dirX * 19, 1.1, pz + dirZ * 19);
        pos.current.lerp(tmpTarget.current, lerpK);
        look.current.lerp(tmpLook.current, Math.min(1, lerpK * 1.4));
        camera.position.copy(pos.current);
        camera.lookAt(look.current);
        return;
      }
      // no locked player yet: fall through to tele behavior
    }

    if (effective === "AUTO_DIRECTOR") {
      const chaos = telemetry.metrics?.chaos_index ?? 0;
      const swoop = chaos > 0.72 || (override && now - override.at < OVERRIDE_MS);
      if (swoop) {
        // dramatic low-angle close-up orbiting the ball
        const t = state.clock.elapsedTime * 0.22;
        const orbitR = 15 + chaos * 5;
        tmpTarget.current.set(
          clamp(tmpBall.current.x + Math.sin(t) * orbitR, -48, 48),
          11 + Math.sin(t * 1.7) * 2.4 + chaos * 3,
          clamp(tmpBall.current.z + Math.cos(t) * orbitR + 5, -31, 31)
        );
        tmpLook.current.set(
          tmpBall.current.x + leadX * 0.4,
          0.5,
          tmpBall.current.z + leadZ * 0.4
        );
        pos.current.lerp(tmpTarget.current, lerpK * 0.7);
        look.current.lerp(tmpLook.current, Math.min(1, lerpK * 1.6));
        camera.position.copy(pos.current);
        camera.lookAt(look.current);
        return;
      }
      // else: classic tele
    }

    // ---- TELE_BROADCAST (default / fallback) ----
    const drift = Math.sin(state.clock.elapsedTime * 0.17) * 0.8;
    tmpTarget.current.set(
      tmpBall.current.x * 0.62 + leadX * 0.12,
      41 - push * 5.5 + drift,
      61 - push * 7.5
    );
    tmpLook.current.set(
      tmpBall.current.x * 0.8 + leadX,
      0.7,
      tmpBall.current.z * 0.34 + leadZ * 0.25
    );
    pos.current.lerp(tmpTarget.current, lerpK);
    look.current.lerp(tmpLook.current, lerpK);
    camera.position.copy(pos.current);
    camera.lookAt(look.current);

    if (shake.current > 0.002) {
      const s = shake.current * shake.current;
      camera.position.x += Math.sin(now * 0.047) * 0.34 * s;
      camera.position.y += Math.cos(now * 0.061) * 0.22 * s;
      shake.current = Math.max(0, shake.current - delta * 1.15);
    }
  });

  return (
    <OrbitControls
      makeDefault
      enabled={droneActive}
      target={[0, 0, 0]}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={18}
      maxDistance={190}
      enableDamping
      dampingFactor={0.08}
    />
  );
}
