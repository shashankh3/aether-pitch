"use client";
// AETHER PITCH v2.0 — StadiumEnvironment3D
// Regulation 105m x 68m pitch with mowed emerald bands, white regulation line
// meshes, metallic goalposts + translucent nets, animated scrolling LED
// perimeter boards, floodlight towers, an instanced 3D crowd and night-sky fog.

import { useDisposable } from "./useDisposable";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { telemetry } from "@/lib/telemetry";

const PL = 105;
const PW = 68;

/* ------------------------------------------------------- mowed turf bands */
function makeTurfTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 1328;
  const ctx = c.getContext("2d")!;
  const bands = 26;
  const bw = c.width / bands;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#0B3A24" : "#082D1B";
    ctx.fillRect(i * bw, 0, bw + 1, c.height);
    const g = ctx.createLinearGradient(i * bw, 0, (i + 1) * bw, 0);
    g.addColorStop(0, "rgba(255,255,255,0.035)");
    g.addColorStop(0.45, "rgba(255,255,255,0.012)");
    g.addColorStop(1, "rgba(0,0,0,0.03)");
    ctx.fillStyle = g;
    ctx.fillRect(i * bw, 0, bw + 1, c.height);
  }
  let seed = 9137;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 14000; i++) {
    const x = rnd() * c.width;
    const y = rnd() * c.height;
    const light = rnd() > 0.55;
    ctx.fillStyle = light ? "rgba(180,255,210,0.035)" : "rgba(0,12,7,0.055)";
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  const vignette = ctx.createRadialGradient(c.width / 2, c.height / 2, c.width * 0.18, c.width / 2, c.height / 2, c.width * 0.62);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeRadialTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, outer);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Turf({ alphaMode }: { alphaMode: boolean }) {
  const texture = useMemo(() => makeTurfTexture(), []);
  const lightPool = useMemo(() => makeRadialTexture("rgba(215,255,235,0.5)", "rgba(90,180,140,0.12)"), []);
  if (alphaMode) {
    // broadcast alpha: hide the opaque grass plane entirely (regulation lines
    // stay visible as the AR anchor grid)
    return null;
  }
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[PL, PW]} />
        <meshStandardMaterial map={texture} roughness={0.9} metalness={0.02} color="#D7FFE8" />
      </mesh>
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PL * 1.05, PW * 1.1]} />
        <meshBasicMaterial
          map={lightPool}
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------ centre mark */
function makeCrestTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 512);
  ctx.strokeStyle = "rgba(220,255,240,0.62)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(256, 256, 178, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,240,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(256, 256, 148, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(235,255,248,0.74)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 132px 'Arial Narrow', Arial, sans-serif";
  ctx.fillText("AP", 256, 245);
  ctx.font = "700 25px 'Arial Narrow', Arial, sans-serif";
  ctx.fillText("A E T H E R   P I T C H", 256, 336);
  ctx.font = "600 14px Arial, sans-serif";
  ctx.fillStyle = "rgba(0,240,255,0.7)";
  ctx.fillText("CONTROL THE GAME", 256, 370);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function CentreMark() {
  const texture = useMemo(() => makeCrestTexture(), []);
  return (
    <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[16, 16]} />
      <meshBasicMaterial map={texture} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/* ------------------------------------------------------------ corner flags */
function CornerFlag({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.035, 1.6, 6]} />
        <meshStandardMaterial color="#C9D6DF" roughness={0.45} metalness={0.4} />
      </mesh>
      <mesh position={[x > 0 ? -0.26 : 0.26, 1.43, 0]} rotation={[0, 0, x > 0 ? -0.12 : 0.12]}>
        <planeGeometry args={[0.52, 0.34]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} emissive={color} emissiveIntensity={0.35} roughness={0.8} />
      </mesh>
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
        "AETHER 3D DIGITAL TWIN",
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

/* ---------------------------------------------------------- stadium bowl */
const ROWS = 8;
const ROW_RISE = 1.25;
const ROW_DEPTH = 1.9;
const FRONT_Z = 6;
const BASE_Y = 0.6;

const SIDES = [
  { pos: [0, 0, -48] as const, rot: 0, width: 140 },
  { pos: [0, 0, 48] as const, rot: Math.PI, width: 140 },
  { pos: [-63.5, 0, 0] as const, rot: Math.PI / 2, width: 94 },
  { pos: [63.5, 0, 0] as const, rot: -Math.PI / 2, width: 94 },
];

function rotateXZ(x: number, z: number, rot: number): [number, number] {
  return [x * Math.cos(rot) + z * Math.sin(rot), -x * Math.sin(rot) + z * Math.cos(rot)];
}

function Bowl() {
  const stepMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#0B1421", roughness: 0.9, metalness: 0.05 }),
    []
  );
  const wallMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#060B13", roughness: 0.95 }),
    []
  );
  const roofMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#070C15", roughness: 0.82, metalness: 0.25 }),
    []
  );
  return (
    <group>
      {SIDES.map((side, si) => (
        <group key={si} position={side.pos as unknown as [number, number, number]} rotation={[0, side.rot, 0]}>
          {Array.from({ length: ROWS }).map((_, r) => (
            <mesh
              key={r}
              position={[0, BASE_Y + r * ROW_RISE, FRONT_Z - r * ROW_DEPTH]}
              material={stepMat}
              receiveShadow
            >
              <boxGeometry args={[side.width + 2, ROW_RISE, ROW_DEPTH + 0.06]} />
            </mesh>
          ))}
          {/* rear facade */}
          <mesh position={[0, 12.5, FRONT_Z - ROWS * ROW_DEPTH - 2.2]} material={wallMat}>
            <boxGeometry args={[side.width + 6, 25, 4.4]} />
          </mesh>
          {/* fascia light */}
          <mesh position={[0, 13.8, FRONT_Z - ROWS * ROW_DEPTH + 0.1]}>
            <boxGeometry args={[side.width + 4, 0.1, 0.12]} />
            <meshBasicMaterial color="#00F0FF" transparent opacity={0.32} toneMapped={false} />
          </mesh>
          {/* cantilever roof — front edge sits over the last terrace row, never the pitch */}
          <mesh position={[0, 24.6, FRONT_Z - 11]} material={roofMat}>
            <boxGeometry args={[side.width + 18, 1.3, 22]} />
          </mesh>
          <mesh position={[0, 23.92, FRONT_Z - 0.1]}>
            <boxGeometry args={[side.width + 16, 0.16, 0.34]} />
            <meshBasicMaterial color="#B9F4FF" transparent opacity={0.65} toneMapped={false} />
          </mesh>
          {/* roof struts */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (side.width / 2 - 5), 18.4, FRONT_Z - 1]} material={roofMat}>
              <boxGeometry args={[0.7, 12, 0.7]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/* ---------------------------------------------------- floodlights + crowd */
function Floodlight({ pos }: { pos: [number, number, number] }) {
  const glow = useMemo(
    () => makeRadialTexture("rgba(255,252,238,0.95)", "rgba(255,236,180,0.28)"),
    []
  );
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
      <sprite position={[0, 29, 1.2]} scale={[16, 10, 1]}>
        <spriteMaterial map={glow} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
}

function LightBeam({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const { mid, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize()
    );
    return { mid: a.clone().add(b).multiplyScalar(0.5), quaternion: q, length: len };
  }, [from, to]);
  return (
    <mesh position={[mid.x, mid.y, mid.z]} quaternion={quaternion}>
      <cylinderGeometry args={[9.5, 0.7, length, 28, 1, true]} />
      <meshBasicMaterial
        color="#CFE8FF"
        transparent
        opacity={0.035}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

function Crowd() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const COUNT = 1600;
  const data = useMemo(() => {
    const arr: { pos: THREE.Vector3; color: THREE.Color }[] = [];
    let i = 0;
    for (const side of SIDES) {
      for (let r = 0; r < ROWS; r++) {
        for (let k = 0; k < 50; k++) {
          const h = (n: number) => {
            const x = Math.sin((i + 1) * 127.1 + n * 311.7) * 43758.5453;
            return x - Math.floor(x);
          };
          const lx = -side.width / 2 + ((k + 0.5) / 50) * side.width + (h(1) - 0.5) * 1.4;
          const lz = FRONT_Z - r * ROW_DEPTH + (h(2) - 0.5) * 0.7;
          const [rx, rz] = rotateXZ(lx, lz, side.rot);
          const x = side.pos[0] + rx;
          const z = side.pos[2] + rz;
          const y = BASE_Y + r * ROW_RISE + ROW_RISE / 2 + 0.35;
          const cr = h(5);
          const color =
            cr < 0.08 ? new THREE.Color("#FF1E56") :
            cr < 0.16 ? new THREE.Color("#00F0FF") :
            cr < 0.21 ? new THREE.Color("#FFC24D") :
            new THREE.Color().setHSL(0.58, 0.12, 0.16 + h(7) * 0.34);
          arr.push({ pos: new THREE.Vector3(x, y, z), color });
          i++;
        }
      }
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

function CrowdFlashes() {
  const refs = useRef<(THREE.SpriteMaterial | null)[]>([]);
  const flashes = useMemo(() => {
    const arr: { p: [number, number, number]; phase: number; speed: number }[] = [];
    for (let i = 0; i < 22; i++) {
      const side = SIDES[i % 4];
      const row = Math.floor((i * 3.7) % ROWS);
      const lx = -side.width / 2 + ((i * 7.3) % side.width);
      const lz = FRONT_Z - row * ROW_DEPTH;
      const [rx, rz] = rotateXZ(lx, lz, side.rot);
      arr.push({
        p: [side.pos[0] + rx, BASE_Y + row * ROW_RISE + 1.7, side.pos[2] + rz],
        phase: i * 1.37,
        speed: 0.55 + (i % 5) * 0.13,
      });
    }
    return arr;
  }, []);
  useFrame((state) => {
    flashes.forEach((f, i) => {
      const mat = refs.current[i];
      if (!mat) return;
      const pulse = Math.pow(Math.max(0, Math.sin(state.clock.elapsedTime * f.speed + f.phase)), 22);
      mat.opacity = pulse * 0.9;
      mat.visible = pulse > 0.01;
    });
  });
  return (
    <group>
      {flashes.map((f, i) => (
        <sprite key={i} position={f.p} scale={[0.9, 0.9, 1]}>
          <spriteMaterial
            ref={(m) => { refs.current[i] = m; }}
            color="#FFFFFF"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/* ---------------------------------------------------------- night sky */
function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          topColor: { value: new THREE.Color("#010208") },
          horizonColor: { value: new THREE.Color("#071528") },
          glowColor: { value: new THREE.Color("#0B3656") },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 topColor;
          uniform vec3 horizonColor;
          uniform vec3 glowColor;
          varying vec3 vWorld;
          void main() {
            vec3 dir = normalize(vWorld);
            float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
            float t = smoothstep(0.46, 0.94, h);
            vec3 col = mix(horizonColor, topColor, t);
            float horizon = pow(1.0 - clamp(dir.y, 0.0, 1.0), 8.0);
            col += glowColor * horizon * 0.55;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    []
  );
  return (
    <mesh material={material}>
      <sphereGeometry args={[330, 32, 18]} />
    </mesh>
  );
}

function Moon() {
  const glow = useMemo(
    () => makeRadialTexture("rgba(255,255,255,0.95)", "rgba(170,215,255,0.18)"),
    []
  );
  return (
    <group position={[150, 146, -205]}>
      <sprite scale={[48, 48, 1]}>
        <spriteMaterial map={glow} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <mesh>
        <sphereGeometry args={[5.2, 24, 24]} />
        <meshBasicMaterial color="#EAF4FF" toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------ big screens */
function drawJumbotron(
  ctx: CanvasRenderingContext2D,
  score: { NLA: number; MCS: number },
  clock: string,
  possession: "NLA" | "MCS"
) {
  const W = 1024;
  const H = 384;
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#07111E");
  bg.addColorStop(0.5, "#040A12");
  bg.addColorStop(1, "#0C1A2C");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#00F0FF";
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.moveTo(-200 + i * 160, H + 40);
    ctx.lineTo(80 + i * 160, -40);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = "#00F0FF";
  ctx.font = "700 22px 'Arial Narrow', Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("AETHER PITCH", 40, 44);
  ctx.fillStyle = "#FF1E56";
  ctx.beginPath();
  ctx.arc(850, 44, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#E2E8F0";
  ctx.font = "700 19px 'Arial Narrow', Arial, sans-serif";
  ctx.fillText("LIVE", 868, 44);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(148,163,184,0.9)";
  ctx.font = "600 17px 'Arial Narrow', Arial, sans-serif";
  ctx.fillText("2ND HALF  ·  " + clock, 984, 44);

  ctx.textAlign = "center";
  ctx.fillStyle = "#FF1E56";
  ctx.font = "700 34px 'Arial Narrow', Arial, sans-serif";
  ctx.fillText("NLA", 230, 170);
  ctx.fillStyle = "#00F0FF";
  ctx.fillText("MCS", 794, 170);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 118px 'Arial Narrow', Arial, sans-serif";
  ctx.fillText(String(score.NLA), 420, 188);
  ctx.fillStyle = "rgba(148,163,184,0.8)";
  ctx.font = "700 72px 'Arial Narrow', Arial, sans-serif";
  ctx.fillText(":", 512, 184);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 118px 'Arial Narrow', Arial, sans-serif";
  ctx.fillText(String(score.MCS), 604, 188);

  ctx.fillStyle = possession === "NLA" ? "rgba(255,30,86,0.18)" : "rgba(0,240,255,0.16)";
  ctx.fillRect(0, 290, W, 94);
  ctx.fillStyle = "rgba(226,232,240,0.9)";
  ctx.font = "600 17px 'Arial Narrow', Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("POSSESSION", 40, 334);
  ctx.fillStyle = possession === "NLA" ? "#FF1E56" : "#00F0FF";
  ctx.font = "800 27px 'Arial Narrow', Arial, sans-serif";
  ctx.fillText(possession, 180, 334);
  ctx.fillStyle = "rgba(148,163,184,0.85)";
  ctx.textAlign = "right";
  ctx.font = "600 16px 'Arial Narrow', Arial, sans-serif";
  ctx.fillText("PITCHFORGE 10 HZ  ·  AETHER VISION  ·  CONTROL THE GAME", 984, 334);
}

function Jumbotron({ z, flipped }: { z: number; flipped: boolean }) {
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 384;
    return c;
  }, []);
  const texture = useDisposable(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [canvas]);
  const ctx = useMemo(() => canvas.getContext("2d")!, [canvas]);
  const last = useRef(-10);
  useFrame((state) => {
    if (state.clock.elapsedTime - last.current < 0.4) return;
    last.current = state.clock.elapsedTime;
    drawJumbotron(ctx, telemetry.match.score, telemetry.match.clock, telemetry.match.possession);
    texture.needsUpdate = true;
  });
  return (
    <group position={[0, 18.6, z]} rotation={[0, flipped ? Math.PI : 0, 0]}>
      <mesh position={[0, 0, -0.26]}>
        <boxGeometry args={[27, 10.2, 0.5]} />
        <meshStandardMaterial color="#05090F" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[25.4, 9.3]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.08]}>
        <planeGeometry args={[25.8, 9.7]} />
        <meshBasicMaterial color="#00F0FF" transparent opacity={0.08} toneMapped={false} />
      </mesh>
      {[-9, 9].map((x) => (
        <mesh key={x} position={[x, 5.2, 0]}>
          <boxGeometry args={[0.25, 1.8, 0.25]} />
          <meshStandardMaterial color="#1A2638" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------ environment */
function StadiumEnvironment3D({ alphaMode = false }: { alphaMode?: boolean }) {
  const beams: { from: [number, number, number]; to: [number, number, number] }[] = [
    { from: [-62, 28.4, -44], to: [0, 0, 0] },
    { from: [62, 28.4, -44], to: [0, 0, 0] },
    { from: [-62, 28.4, 44], to: [0, 0, 0] },
    { from: [62, 28.4, 44], to: [0, 0, 0] },
  ];
  return (
    <group>
      {/* dark surround track + outer ground */}
      {!alphaMode && (
        <>
          <SkyDome />
          <Stars radius={280} depth={90} count={1500} factor={4} saturation={0} fade speed={0.2} />
          <Moon />
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
      <CentreMark />
      <Lines />
      {!alphaMode && (
        <>
          <Goal side={1} />
          <Goal side={-1} />

          <CornerFlag x={-PL / 2} z={-PW / 2} color="#FF1E56" />
          <CornerFlag x={-PL / 2} z={PW / 2} color="#FF1E56" />
          <CornerFlag x={PL / 2} z={-PW / 2} color="#00F0FF" />
          <CornerFlag x={PL / 2} z={PW / 2} color="#00F0FF" />

          {/* LED perimeter boards */}
          <AdBoard pos={[0, 0, -36.5]} rot={0} w={112} />
          <AdBoard pos={[0, 0, 36.5]} rot={Math.PI} w={112} />
          <AdBoard pos={[-56.5, 0, 0]} rot={Math.PI / 2} w={76} />
          <AdBoard pos={[56.5, 0, 0]} rot={-Math.PI / 2} w={76} />

          <Bowl />
          <Crowd />
          <CrowdFlashes />

          <Jumbotron z={-41.6} flipped={false} />
          <Jumbotron z={41.6} flipped />

          <Floodlight pos={[-62, 0, -44]} />
          <Floodlight pos={[62, 0, -44]} />
          <Floodlight pos={[-62, 0, 44]} />
          <Floodlight pos={[62, 0, 44]} />

          {beams.map((b, i) => <LightBeam key={i} from={b.from} to={b.to} />)}
        </>
      )}
    </group>
  );
}

export default memo(StadiumEnvironment3D);
