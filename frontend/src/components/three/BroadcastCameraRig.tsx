"use client";
// AETHER PITCH v2.0 — BroadcastCameraRig
// Four damped camera modes for the 3D WebGL broadcast:
//   1. TELE_BROADCAST          classic Premier League TV camera
//   2. PLAYER_LOCK_3RD_PERSON  EA FC Pro Cam behind the locked avatar
//   3. TACTICAL_DRONE_ORBIT    Lenovo 3D Digital Twin — free 360 orbit
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
  const pos = useRef(new THREE.Vector3(0, 38, 55));
  const look = useRef(new THREE.Vector3(0, 0, 0));
  const tmpBall = useRef(new THREE.Vector3());
  const tmpTarget = useRef(new THREE.Vector3());
  const tmpLook = useRef(new THREE.Vector3());

  // OrbitControls must follow the *effective* mode, not the manual selection.
  const overrideMode = override?.directive.recommended_mode;
  const effectiveMode: CameraMode | "TACTICAL_DRONE" =
    overrideMode === "ACTION_ZOOM" ? "AUTO_DIRECTOR" : overrideMode ?? mode;
  const droneActive =
    effectiveMode === "TACTICAL_DRONE" || effectiveMode === "TACTICAL_DRONE_ORBIT";

  useFrame((state, delta) => {
    const now = performance.now();
    ballWorld(tmpBall.current, now);

    // ---- AI director override (6.5s hold; page clears the prop) ----
    let effective: CameraMode | "TACTICAL_DRONE" = mode;
    let focusId: string | null = null;
    if (override && now - override.at < OVERRIDE_MS) {
      const d = override.directive;
      if (d.recommended_mode === "ACTION_ZOOM") effective = "AUTO_DIRECTOR";
      else effective = d.recommended_mode;
      focusId = d.focus_target_id;
    }

    if (effective === "TACTICAL_DRONE" || effective === "TACTICAL_DRONE_ORBIT") {
      return; // OrbitControls owns the camera in this mode
    }

    const lerpK = 1 - Math.pow(0.0015, delta); // frame-rate independent damping

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
        tmpTarget.current.set(px - dirX * 8, 5.5, pz - dirZ * 8);
        tmpLook.current.set(px + dirX * 18, 1.2, pz + dirZ * 18);
        pos.current.lerp(tmpTarget.current, lerpK);
        look.current.lerp(tmpLook.current, lerpK * 1.4 > 1 ? 1 : lerpK * 1.4);
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
        const t = state.clock.elapsedTime * 0.25;
        const orbitR = 16;
        tmpTarget.current.set(
          tmpBall.current.x + Math.sin(t) * orbitR,
          14,
          tmpBall.current.z + Math.cos(t) * orbitR + 6
        );
        tmpLook.current.set(tmpBall.current.x, 0.5, tmpBall.current.z);
        pos.current.lerp(tmpTarget.current, lerpK * 0.7);
        look.current.lerp(tmpLook.current, lerpK * 1.6 > 1 ? 1 : lerpK * 1.6);
        camera.position.copy(pos.current);
        camera.lookAt(look.current);
        return;
      }
      // else: classic tele
    }

    // ---- TELE_BROADCAST (default / fallback) ----
    tmpTarget.current.set(tmpBall.current.x * 0.6, 42, 62);
    tmpLook.current.set(tmpBall.current.x * 0.75, 0, tmpBall.current.z * 0.3);
    pos.current.lerp(tmpTarget.current, lerpK);
    look.current.lerp(tmpLook.current, lerpK);
    camera.position.copy(pos.current);
    camera.lookAt(look.current);
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
