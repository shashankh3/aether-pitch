"use client";
// AETHER PITCH v2.0 — PassVectors3D
//   * 3D parabolic ballistic pass tube (QuadraticBezierCurve3, peak 6.5m when
//     lofted / 1.2m ground passes) glowing neon green -> gold
//   * Lenovo counterfactual "Ghost Pass" — dashed cyan 3D curve to the optimal
//     teammate with a floating "+xT" badge

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { telemetry } from "@/lib/telemetry";

function world(p: [number, number]): THREE.Vector3 {
  return new THREE.Vector3(p[0] - 52.5, 0, p[1] - 34);
}

export default function PassVectors3D({ showGhost }: { showGhost: boolean }) {
  const tubeMesh = useRef<THREE.Mesh>(null);
  const tubeMat = useRef<THREE.MeshStandardMaterial>(null);
  const tubeKey = useRef<string>("");

  // ghost dashed line built imperatively (THREE.Line plays nicest with TS)
  const ghost = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(49 * 3), 3));
    const mat = new THREE.LineDashedMaterial({
      color: 0x00f0ff, dashSize: 0.55, gapSize: 0.4,
      transparent: true, opacity: 0.8, toneMapped: false,
    });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    return line;
  }, []);

  useFrame(() => {
    const b = telemetry.ball;

    // ---- ballistic pass tube: rebuild on new pass, fade after arrival ----
    if (b.pass_start && b.pass_end && tubeMesh.current && tubeMat.current) {
      const key = `${b.pass_start[0].toFixed(1)},${b.pass_start[1].toFixed(1)}->${b.pass_end[0].toFixed(1)},${b.pass_end[1].toFixed(1)}`;
      if (key !== tubeKey.current) {
        tubeKey.current = key;
        const a = world(b.pass_start);
        const c = world(b.pass_end);
        const peak = b.is_lofted ? 6.5 : 1.2;
        const mid = a.clone().add(c).multiplyScalar(0.5);
        mid.y += peak;
        const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, c), 40, 0.075, 8, false);
        const old = tubeMesh.current.geometry;
        tubeMesh.current.geometry = geo;
        old.dispose();
        tubeMesh.current.visible = true;
        tubeMat.current.opacity = 0.95;
      }
      tubeMat.current.opacity = Math.max(0, tubeMat.current.opacity - 0.004);
      if (tubeMat.current.opacity <= 0) tubeMesh.current.visible = false;
    } else if (tubeMesh.current && tubeMat.current) {
      tubeMat.current.opacity = Math.max(0, tubeMat.current.opacity - 0.012);
      if (tubeMat.current.opacity <= 0) tubeMesh.current.visible = false;
    }

    // ---- ghost pass dashed counterfactual ----
    const g = telemetry.ghost;
    const fresh = g && performance.now() - g.at < 4200;
    if (fresh && showGhost) {
      const key = `${g!.x.toFixed(1)},${g!.y.toFixed(1)}`;
      const attr = ghost.geometry.getAttribute("position") as THREE.BufferAttribute;
      if (key !== ghost.userData.key) {
        ghost.userData.key = key;
        const start = world(b.pass_start ?? [b.x, b.y]);
        const end = world([g!.x, g!.y]);
        const mid = start.clone().add(end).multiplyScalar(0.5);
        mid.y += 1.0;
        const pts = new THREE.QuadraticBezierCurve3(start, mid, end).getPoints(48);
        pts.forEach((p, i) => attr.setXYZ(i, p.x, p.y, p.z));
        attr.needsUpdate = true;
        ghost.computeLineDistances();
      }
      ghost.visible = true;
      (ghost.material as THREE.LineDashedMaterial).opacity = 0.5 + 0.3 * Math.sin(performance.now() / 180);
    } else {
      ghost.visible = false;
    }
  });

  return (
    <group>
      {/* ballistic pass tube — geometry assigned imperatively per pass */}
      <mesh ref={tubeMesh} visible={false}>
        <meshStandardMaterial
          ref={tubeMat}
          color="#00FF85"
          emissive="#AAFF40"
          emissiveIntensity={1.5}
          transparent
          opacity={0.9}
          toneMapped={false}
        />
      </mesh>

      {/* ghost pass dashed counterfactual */}
      <primitive object={ghost} />

      <GhostBadge />
    </group>
  );
}

function GhostBadge() {
  const holder = useRef<THREE.Group>(null);
  const label = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const g = telemetry.ghost;
    if (!holder.current) return;
    if (g && performance.now() - g.at < 4200) {
      holder.current.visible = true;
      holder.current.position.set(g.x - 52.5, 1.4, g.y - 34);
      if (label.current) label.current.textContent = `OPTIMAL GHOST PASS: +${g.delta_xt.toFixed(2)} xT`;
    } else {
      holder.current.visible = false;
    }
  });
  return (
    <group ref={holder} visible={false}>
      <Html center distanceFactor={40} zIndexRange={[15, 0]}>
        <div className="pointer-events-none whitespace-nowrap border border-tactical/60 bg-slate-950/85 px-2 py-0.5 font-tech text-[11px] font-bold tracking-wide text-tactical backdrop-blur-md">
          <span ref={label}>OPTIMAL GHOST PASS</span>
        </div>
      </Html>
    </group>
  );
}
