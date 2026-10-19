"use client";
// AETHER PITCH v2.0 — StadiumEnvironment3D
// Regulation 105m x 68m pitch with mowed emerald bands, white regulation line
// meshes, metallic goalposts + translucent nets, animated scrolling LED
// perimeter boards, floodlight towers, an instanced 3D crowd and night-sky fog.

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

const PL = 105;
const PW = 68;

/* ------------------------------------------------------- mowed turf bands */
function Turf({ alphaMode }: { alphaMode: boolean }) {
  const bands = useMemo(() => {
    const arr: { x: number; w: number; odd: boolean }[] = [];
    const n = 24;
    for (let i = 0; i < n; i++) {
      arr.push({ x: -PL / 2 + (i * PL) / n, w: PL / n, odd: i % 2 === 1 });
    }
    return arr;
  }, []);
  if (alphaMode) {
    // broadcast alpha: hide the opaque grass plane entirely (regulation lines
    // stay visible as the AR anchor grid)
    return null;
  }
  return (
    <group>
      {bands.map((b, i) => (
        <mesh key={i} position={[b.x + b.w / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[b.w + 0.02, PW]} />
          <meshStandardMaterial color={b.odd ? "#0C3D25" : "#082E1C"} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/* --------------------------------------------------------- regulation lines */
function Line({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  return (
    <mesh position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color="#E8F0EC" emissive="#8AA599" emissiveIntensity={0.12} roughness={0.6} />
    </mesh>
  );
}

function Lines() {
  const W = PW / 2;
  return (
    <group>
      {/* touchlines + halfway */}
      <Line x={0} z={-W} w={PL} d={0.22} />
      <Line x={0} z={W} w={PL} d={0.22} />
      <Line x={-PL / 2} z={0} w={0.22} d={PW} />
      <Line x={PL / 2} z={0} w={0.22} d={PW} />
      <Line x={0} z={0} w={0.22} d={PW} />
      {/* boxes both ends */}
      {[1, -1].map((s) => (
        <group key={s}>
          <Line x={s * (PL / 2 - 16.5)} z={0} w={0.22} d={40.3} />
          <Line x={s * (PL / 2 - 8.25)} z={-20.15} w={16.5} d={0.22} />
          <Line x={s * (PL / 2 - 8.25)} z={20.15} w={16.5} d={0.22} />
          <Line x={s * (PL / 2 - 5.5)} z={0} w={0.22} d={18.32} />
          <Line x={s * (PL / 2 - 2.75)} z={-9.16} w={5.5} d={0.22} />
          <Line x={s * (PL / 2 - 2.75)} z={9.16} w={5.5} d={0.22} />
          {/* penalty spot */}
          <mesh position={[s * (PL / 2 - 11), 0.013, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.16, 12]} />
            <meshStandardMaterial color="#E8F0EC" />
          </mesh>
        </group>
      ))}
      {/* centre circle + spot */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[9.05, 9.27, 72]} />
        <meshStandardMaterial color="#E8F0EC" emissive="#8AA599" emissiveIntensity={0.12} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.013, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.18, 12]} />
        <meshStandardMaterial color="#E8F0EC" />
      </mesh>
      {/* penalty arcs */}
      {[1, -1].map((s) => (
        <mesh
          key={s}
          position={[s * (PL / 2 - 11), 0.012, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[9.05, 9.27, 40, 1, s === 1 ? Math.PI - 0.93 : -0.93, 1.86]} />
          <meshStandardMaterial color="#E8F0EC" side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------ goals + nets */
function Goal({ side }: { side: 1 | -1 }) {
  const x = side * (PL / 2);
  const H = 2.44;
  const W = 7.32;
  const postMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.25, metalness: 0.85 }),
    []
  );
  const netMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: 0xdfe9ee, wireframe: true, transparent: true, opacity: 0.22 }),
    []
  );
  return (
    <group position={[x, 0, 0]}>
      {[1, -1].map((s) => (
        <mesh key={s} material={postMat} position={[side * 0.08, H / 2, (s * W) / 2]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, H, 10]} />
        </mesh>
      ))}
      <mesh material={postMat} position={[side * 0.08, H, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, W, 10]} />
      </mesh>
      {/* net: back + sides + roof */}
      <mesh material={netMat} position={[side * 1.1, H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[W, H, 16, 6]} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} material={netMat} position={[side * 0.6, H / 2, (s * W) / 2]}>
          <planeGeometry args={[1.2, H, 3, 6]} />
        </mesh>
      ))}
      <mesh material={netMat} position={[side * 0.6, H, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.2, W, 3, 16]} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------- animated LED ad boards */
function makeBoardTexture(labels: string[]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#04060a";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = "700 40px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
  ctx.textBaseline = "middle";
  const palette = ["#00F0FF", "#00FF85", "#FF1E56", "#FFC24D"];
  let x = 30;
  labels.forEach((label, i) => {
    ctx.fillStyle = palette[i % palette.length];
    ctx.fillText(label, x, 34);
    x += ctx.measureText(label).width + 90;
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

function AdBoard({ pos, rot, w, h = 1.1 }: { pos: [number, number, number]; rot: number; w: number; h?: number }) {
  const texture = useMemo(
    () =>
      makeBoardTexture([
        "AETHER PITCH",
        "AZURE AI FOUNDRY",
        "TACTICAL PULSE: CONTROL VS CHAOS",
        "PITCHFORGE",
        "LENOVO 3D DIGITAL TWIN",
        "PLAYERLOCK 360",
      ]),
    []
  );
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, delta) => {
    texture.offset.x += delta * 0.015;
    // subtle brightness shimmer on the emissive board face
    if (mat.current) mat.current.color.setScalar(0.9 + Math.sin(performance.now() / 800) * 0.1);
  });
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh position={[0, h / 2 + 0.5, 0]}>
        <boxGeometry args={[w, h, 0.15]} />
        <meshStandardMaterial color="#05070c" />
      </mesh>
      <mesh position={[0, h / 2 + 0.5, 0.09]}>
        <planeGeometry args={[w - 0.3, h - 0.15]} />
        <meshBasicMaterial ref={mat} map={texture} toneMapped={false} />
      </mesh>
      {/* support plinths */}
      {[ -w / 2 + 2, 0, w / 2 - 2 ].map((px, i) => (
        <mesh key={i} position={[px, 0.25, 0]}>
          <boxGeometry args={[0.5, 0.5, 0.3]} />
          <meshStandardMaterial color="#11161f" />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------------------------------------------- floodlights + crowd */
function Floodlight({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, 14, 0]}>
        <cylinderGeometry args={[0.35, 0.55, 28, 8]} />
        <meshStandardMaterial color="#1a2230" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 29, 0]}>
        <boxGeometry args={[7, 2.6, 0.7]} />
        <meshStandardMaterial color="#0d1219" />
      </mesh>
      <mesh position={[0, 29, 0.45]}>
        <planeGeometry args={[6.4, 2]} />
        <meshBasicMaterial color="#FFF7DE" toneMapped={false} />
      </mesh>
    </group>
  );
}

function Crowd() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const COUNT = 1600;
  const data = useMemo(() => {
    const arr: { pos: THREE.Vector3; color: THREE.Color }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const h = (n: number) => {
        const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
        return x - Math.floor(x);
      };
      const side = i % 4;
      let pos: THREE.Vector3;
      if (side === 0) pos = new THREE.Vector3(-64 + h(1) * 128, 3.5 + h(2) * 8, -41 - h(3) * 9);
      else if (side === 1) pos = new THREE.Vector3(-64 + h(1) * 128, 3.5 + h(2) * 8, 41 + h(3) * 9);
      else if (side === 2) pos = new THREE.Vector3(-58 - h(1) * 9, 3.5 + h(2) * 8, -36 + h(3) * 72);
      else pos = new THREE.Vector3(58 + h(1) * 9, 3.5 + h(2) * 8, -36 + h(3) * 72);
      const r = h(5);
      const color =
        r < 0.09 ? new THREE.Color("#FF1E56") :
        r < 0.18 ? new THREE.Color("#00F0FF") :
        r < 0.24 ? new THREE.Color("#FFC24D") :
        new THREE.Color().setHSL(0.58, 0.15, 0.18 + h(7) * 0.35);
      arr.push({ pos, color });
    }
    return arr;
  }, []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    data.forEach((d, i) => {
      m.makeTranslation(d.pos.x, d.pos.y, d.pos.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, d.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [data]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]}>
      <boxGeometry args={[0.42, 0.7, 0.42]} />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------ environment */
export default function StadiumEnvironment3D({ alphaMode = false }: { alphaMode?: boolean }) {
  return (
    <group>
      {/* dark surround track + outer ground */}
      {!alphaMode && (
        <>
          <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[132, 94]} />
            <meshStandardMaterial color="#0A0F16" roughness={1} />
          </mesh>
          <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[420, 420]} />
            <meshStandardMaterial color="#05070C" roughness={1} />
          </mesh>
        </>
      )}

      <Turf alphaMode={alphaMode} />
      <Lines />
      {!alphaMode && (
        <>
          <Goal side={1} />
          <Goal side={-1} />

          {/* LED perimeter boards */}
          <AdBoard pos={[0, 0, -36.5]} rot={0} w={112} />
          <AdBoard pos={[0, 0, 36.5]} rot={Math.PI} w={112} />
          <AdBoard pos={[-56.5, 0, 0]} rot={Math.PI / 2} w={76} />
          <AdBoard pos={[56.5, 0, 0]} rot={-Math.PI / 2} w={76} />

          {/* stands skirt */}
          {[0, Math.PI].map((r) => (
            <mesh key={r} position={[0, 4, -46]} rotation={[0, r, 0]}>
              <boxGeometry args={[140, 12, 14]} />
              <meshStandardMaterial color="#0D1420" roughness={1} />
            </mesh>
          ))}
          {[0, Math.PI].map((r) => (
            <mesh key={`s${r}`} position={[0, 4, 46]} rotation={[0, r, 0]}>
              <boxGeometry args={[140, 12, 14]} />
              <meshStandardMaterial color="#0D1420" roughness={1} />
            </mesh>
          ))}
          {[Math.PI / 2, -Math.PI / 2].map((r) => (
            <mesh key={`e${r}`} position={[r === Math.PI / 2 ? 58 : -58, 4, 0]} rotation={[0, r, 0]}>
              <boxGeometry args={[92, 12, 14]} />
              <meshStandardMaterial color="#0D1420" roughness={1} />
            </mesh>
          ))}

          <Crowd />
          <Floodlight pos={[-62, 0, -44]} />
          <Floodlight pos={[62, 0, -44]} />
          <Floodlight pos={[-62, 0, 44]} />
          <Floodlight pos={[62, 0, 44]} />
        </>
      )}
    </group>
  );
}
