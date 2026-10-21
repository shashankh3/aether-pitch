"use client";
// AETHER PITCH v3.0 — Telestrator3DOverlays
// Broadcast 3D telestration layer:
//   * volumetric stadium spotlight pillars + ground reticles + callouts
//   * 3D offside / defensive-line laser wall with attacker-distance marker
//   * glowing compactness polygon (convex hull of the defensive block)
//   * holographic ghost-ball counterfactual replay
//   * studio co-pilot highlight zone rect + custom tactical arrows
// All meshes are driven from the telemetry store inside useFrame — no setState.

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { telemetry } from "@/lib/telemetry";
import type { HighlightZone, TelestratorState } from "@/lib/types";

const MAX_SPOTLIGHTS = 3;

function attackProgress(team: string, x: number): number {
  return team === "NLA" ? x : 105 - x;
}

/* ------------------------------------------------------------ spotlights */
function SpotlightPillar({ index }: { index: number }) {
  const grp = useRef<THREE.Group>(null);
  const pillarMat = useRef<THREE.MeshBasicMaterial>(null);
  const reticleMat = useRef<THREE.MeshBasicMaterial>(null);
  const reticle = useRef<THREE.Mesh>(null);
  const label = useRef<HTMLSpanElement>(null);
  const labelAt = useRef(0);
  useFrame((state, delta) => {
    const g = grp.current;
    if (!g) return;
    const ids = telemetry.telestratorSpotlightIds;
    const id = ids[index];
    const s = id ? telemetry.players.get(id) : null;
    g.visible = !!s;
    if (!s) return;
    g.position.set(s.x - 52.5, 0, s.y - 34);
    const pulse = 0.16 + 0.08 * Math.sin(state.clock.elapsedTime * 4 + index);
    if (pillarMat.current) pillarMat.current.opacity = pulse;
    if (reticleMat.current) reticleMat.current.opacity = 0.5 + 0.3 * Math.sin(state.clock.elapsedTime * 5);
    if (reticle.current) reticle.current.rotation.z += delta * 1.4;
    const now = performance.now();
    if (label.current && now - labelAt.current >= 100) {
      labelAt.current = now;
      label.current.textContent = `${s.name} · ${s.speed_kmh.toFixed(1)} km/h`;
    }
  });
  return (
    <group ref={grp} visible={false}>
      <mesh position={[0, 11, 0]}>
        <cylinderGeometry args={[0.9, 1.8, 22, 32, 1, true]} />
        <meshBasicMaterial
          ref={pillarMat}
          color={index === 0 ? 0xffd700 : 0x00f0ff}
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={reticle} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.1, 40]} />
        <meshBasicMaterial
          ref={reticleMat}
          color={index === 0 ? 0xffd700 : 0x00f0ff}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <Html center distanceFactor={42} position={[0, 4.2, 0]} zIndexRange={[18, 0]}>
        <div className="pointer-events-none whitespace-nowrap border border-gold/60 bg-slate-950/85 px-2 py-0.5 font-tech text-[11px] font-bold tracking-wide text-gold">
          🔦 <span ref={label} />
        </div>
      </Html>
    </group>
  );
}

/* ----------------------------------------------------- offside laser wall */
function OffsideWall() {
  const grp = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const label = useRef<HTMLSpanElement>(null);
  const calcAt = useRef(0);
  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const now = performance.now();
    if (now - calcAt.current >= 100) {
      calcAt.current = now;
      const poss = telemetry.match.possession;
      const defending = poss === "NLA" ? "MCS" : "NLA";
      const attackers = Array.from(telemetry.players.values()).filter((p) => p.team === poss && p.role !== "GK");
      const defs = Array.from(telemetry.players.values())
        .filter((p) => p.team === defending && p.role === "DEF")
        .sort((a, b) => attackProgress(defending, a.x) - attackProgress(defending, b.x));
      const wallDef = defs[1] ?? defs[0]; // second-deepest defender
      g.visible = !!wallDef;
      if (wallDef) {
        const wallX = wallDef.x;
        g.position.set(wallX - 52.5, 2.25, 0);
        // distance from the wall to the deepest attacker (offside margin)
        let nearest = 999;
        for (const a of attackers) {
          nearest = Math.min(nearest, attackProgress(poss, a.x) - attackProgress(defending, wallX));
        }
        if (label.current) {
          label.current.textContent =
            `OFFSIDE WALL · ${wallDef.name} · ${nearest >= 0 ? "+" : ""}${nearest.toFixed(1)}m TO NEAREST ATTACKER`;
        }
      }
    }
    if (mat.current && g.visible) mat.current.opacity = 0.16 + 0.06 * Math.sin(now / 220);
  });
  return (
    <group ref={grp} visible={false}>
      <mesh>
        <planeGeometry args={[68, 4.5]} />
        <meshBasicMaterial
          ref={mat}
          color={0xff1e56}
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <Html center distanceFactor={55} position={[0, 3.4, 0]} zIndexRange={[18, 0]}>
        <div className="pointer-events-none whitespace-nowrap border border-crimson/60 bg-slate-950/85 px-2 py-0.5 font-tech text-[11px] font-bold tracking-wide text-crimson">
          <span ref={label} />
        </div>
      </Html>
    </group>
  );
}

/* --------------------------------------------------- compactness polygon */
function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: typeof pts[0], a: typeof pts[0], b: typeof pts[0]) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: typeof pts = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: typeof pts = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function CompactnessPolygon() {
  const mesh = useRef<THREE.Mesh>(null);
  const border = useRef<THREE.LineLoop>(null);
  const grp = useRef<THREE.Group>(null);
  const label = useRef<HTMLSpanElement>(null);
  const badge = useRef<THREE.Group>(null);
  const calcAt = useRef(0);
  const borderGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
    return g;
  }, []);

  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const now = performance.now();
    if (now - calcAt.current < 100) return;
    calcAt.current = now;
    const poss = telemetry.match.possession;
    const defending = poss === "NLA" ? "MCS" : "NLA";
    const block = Array.from(telemetry.players.values())
      .filter((p) => p.team === defending && (p.role === "DEF" || p.role === "MID"));
    g.visible = block.length >= 3;
    if (!g.visible) return;
    const hull = convexHull(block.map((p) => ({ x: p.x - 52.5, y: p.y - 34 })));
    if (hull.length < 3) { g.visible = false; return; }
    const shape = new THREE.Shape(hull.map((p) => new THREE.Vector2(p.x, p.y)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const old = mesh.current!.geometry;
    mesh.current!.geometry = geo;
    old.dispose();
    const attr = borderGeo.getAttribute("position") as THREE.BufferAttribute;
    hull.forEach((p, i) => attr.setXYZ(i % 12, p.x, 0.08, p.y));
    for (let i = hull.length; i < 12; i++) attr.setXYZ(i, hull[0].x, 0.08, hull[0].y);
    attr.needsUpdate = true;
    border.current!.visible = true;
    // shoelace area (m²)
    let area = 0;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length];
      area += a.x * b.y - b.x * a.y;
    }
    area = Math.abs(area / 2);
    const xs = hull.map((p) => p.x), zs = hull.map((p) => p.y);
    if (badge.current) {
      badge.current.visible = true;
      badge.current.position.set(
        xs.reduce((a, b) => a + b, 0) / hull.length,
        1.6,
        zs.reduce((a, b) => a + b, 0) / hull.length
      );
    }
    if (label.current) {
      label.current.textContent =
        `COMPACTNESS AREA: ${area.toFixed(0)} m² • STRETCH: ${(telemetry.metrics?.stretch_m ?? 0).toFixed(1)}m`;
    }
  });

  return (
    <group ref={grp} visible={false}>
      <mesh ref={mesh} position={[0, 0.06, 0]}>
        <meshBasicMaterial
          color={0x00f0ff}
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <lineLoop ref={border} geometry={borderGeo} visible={false}>
        <lineBasicMaterial color={0x00f0ff} transparent opacity={0.85} toneMapped={false} />
      </lineLoop>
      <group ref={badge} visible={false}>
        <Html center distanceFactor={55} zIndexRange={[18, 0]}>
          <div className="pointer-events-none whitespace-nowrap border border-tactical/60 bg-slate-950/85 px-2 py-0.5 font-tech text-[11px] font-bold tracking-wide text-tactical">
            <span ref={label} />
          </div>
        </Html>
      </group>
    </group>
  );
}

/* ---------------------------------------------- ghost-ball replay + zone */
function GhostReplayBall() {
  const mesh = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const trail = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    const line = new THREE.Line(
      g,
      new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.5, toneMapped: false })
    );
    line.visible = false;
    line.frustumCulled = false;
    return line;
  }, []);
  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const ghost = telemetry.ghost;
    const b = telemetry.ball;
    const fresh = ghost && performance.now() - ghost.at < 8000;
    if (!fresh) {
      m.visible = false;
      trail.visible = false;
      if (ringA.current) ringA.current.visible = false;
      if (ringB.current) ringB.current.visible = false;
      return;
    }
    const start = new THREE.Vector3((b.pass_start?.[0] ?? b.x) - 52.5, 0.2, (b.pass_start?.[1] ?? b.y) - 34);
    const end = new THREE.Vector3(ghost!.x - 52.5, 0.2, ghost!.y - 34);
    const mid = start.clone().add(end).multiplyScalar(0.5).setY(1.4);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const u = (state.clock.elapsedTime * 0.45) % 1;
    const p = curve.getPoint(u);
    m.visible = true;
    m.position.copy(p);
    if (light.current) light.current.position.copy(p);
    const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 4.2);
    if (ringA.current) {
      ringA.current.visible = true;
      ringA.current.position.set(end.x, 0.06, end.z);
      ringA.current.scale.setScalar(0.82 + pulse * 0.28);
      (ringA.current.material as THREE.MeshBasicMaterial).opacity = 0.45 + pulse * 0.35;
    }
    if (ringB.current) {
      ringB.current.visible = true;
      ringB.current.position.set(end.x, 0.05, end.z);
      ringB.current.scale.setScalar(1.2 + pulse * 0.55);
      (ringB.current.material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - pulse);
    }
    const attr = trail.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < 24; i++) {
      const pt = curve.getPoint(clamp01(u - i * 0.012));
      attr.setXYZ(i, pt.x, pt.y, pt.z);
    }
    attr.needsUpdate = true;
    trail.visible = true;
  });
  return (
    <group>
      <mesh ref={mesh} visible={false}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={0x00f0ff} emissive={0x00f0ff} emissiveIntensity={2.2} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      <pointLight ref={light} color={0x00f0ff} intensity={4} distance={9} decay={2} />
      <mesh ref={ringA} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[1.0, 1.28, 56]} />
        <meshBasicMaterial color={0x00f0ff} transparent opacity={0.7} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh ref={ringB} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[1.28, 1.36, 56]} />
        <meshBasicMaterial color={0x00f0ff} transparent opacity={0.25} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <primitive object={trail} />
    </group>
  );
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/* ------------------------------------------------ co-pilot highlight zone */
function HighlightZoneMesh({ zone }: { zone: HighlightZone | null }) {
  const grp = useRef<THREE.Group>(null);
  const key = zone ? `${zone.x_min},${zone.x_max},${zone.y_min},${zone.y_max}` : "";
  const geo = useMemo(() => {
    if (!zone) return null;
    const w = zone.x_max - zone.x_min;
    const d = zone.y_max - zone.y_min;
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!zone || !geo) return null;
  const cx = (zone.x_min + zone.x_max) / 2 - 52.5;
  const cz = (zone.y_min + zone.y_max) / 2 - 34;
  return (
    <group ref={grp} position={[cx, 0.05, cz]}>
      <mesh geometry={geo}>
        <meshBasicMaterial color={0xffc24d} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[geo]} />
        <lineBasicMaterial color={0xffc24d} transparent opacity={0.9} toneMapped={false} />
      </lineSegments>
      <Html center distanceFactor={55} position={[0, 1.2, 0]} zIndexRange={[18, 0]}>
        <div className="pointer-events-none whitespace-nowrap border border-gold/60 bg-slate-950/85 px-2 py-0.5 font-tech text-[11px] font-bold tracking-wide text-gold">
          ⚠ {zone.label}
        </div>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------- custom arrows */
function TacticalArrow({ from, to }: { from: [number, number]; to: [number, number] }) {
  const { pos, rot, len } = useMemo(() => {
    const ax = from[0] - 52.5, az = from[1] - 34;
    const bx = to[0] - 52.5, bz = to[1] - 34;
    const dx = bx - ax, dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    return {
      pos: [(ax + bx) / 2, 0.3, (az + bz) / 2] as [number, number, number],
      rot: [0, Math.atan2(dx, dz), 0] as [number, number, number],
      len: l,
    };
  }, [from, to]);
  return (
    <group position={pos} rotation={rot}>
      <mesh position={[0, 0, -len * 0.08]}>
        <boxGeometry args={[0.12, 0.05, len * 0.84]} />
        <meshBasicMaterial color={0xffd700} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, len * 0.42]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.22, 0.5, 4]} />
        <meshBasicMaterial color={0xffd700} transparent opacity={0.9} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------------- export */
export default function Telestrator3DOverlays({ telestrator, highlightZone }: {
  telestrator: TelestratorState;
  highlightZone: HighlightZone | null;
}) {
  return (
    <group>
      {telestrator.spotlightPlayerIds.slice(0, MAX_SPOTLIGHTS).map((_, i) => (
        <SpotlightPillar key={i} index={i} />
      ))}
      {telestrator.showOffsideLaserWall && <OffsideWall />}
      {telestrator.showCompactnessPolygon && <CompactnessPolygon />}
      {telestrator.animateGhostReplay && <GhostReplayBall />}
      <HighlightZoneMesh zone={highlightZone} />
      {telestrator.customTacticalArrows.map((a, i) => (
        <TacticalArrow key={i} from={a.from} to={a.to} />
      ))}
    </group>
  );
}
