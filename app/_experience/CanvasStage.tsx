"use client";

import { Component, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  buildFormations,
  buildSphereLinks,
  type FormationName,
} from "./formations";
import type { JourneyState } from "./journey";

/** Where each formation sits on the global progress axis. */
const FORMATION_KEYS: { name: FormationName; at: number }[] = [
  { name: "identity", at: 0.0 },
  { name: "identity", at: 0.1 },
  { name: "chaos", at: 0.17 },
  { name: "converge", at: 0.28 },
  { name: "helix", at: 0.37 },
  { name: "wave", at: 0.52 },
  { name: "clusters", at: 0.68 },
  { name: "sphere", at: 0.8 },
  { name: "galaxy", at: 0.93 },
  { name: "galaxy", at: 1.0 },
];

const FORMATION_COLORS: Record<FormationName, [string, string]> = {
  identity: ["#45c4ff", "#1e3a8a"],
  chaos: ["#ff7a59", "#3b4a6b"],
  converge: ["#45c4ff", "#6366f1"],
  helix: ["#38bdf8", "#8b5cf6"],
  wave: ["#22d3ee", "#3b82f6"],
  clusters: ["#34d399", "#22d3ee"],
  sphere: ["#60a5fa", "#a78bfa"],
  galaxy: ["#93c5fd", "#64748b"],
};

/** Camera distance/height per progress keyframe — the "shots" of the film. */
const CAMERA_KEYS: { at: number; z: number; y: number }[] = [
  { at: 0.0, z: 10.5, y: 0 },
  { at: 0.17, z: 13.5, y: 0.6 },
  { at: 0.28, z: 10.5, y: 0.4 },
  { at: 0.37, z: 11.0, y: 0.9 },
  { at: 0.52, z: 12.0, y: 2.4 },
  { at: 0.68, z: 10.5, y: 0.4 },
  { at: 0.8, z: 13.5, y: 0.2 },
  { at: 1.0, z: 15.5, y: 2.6 },
];

const smooth = (t: number) => t * t * (3 - 2 * t);

function bracket<T extends { at: number }>(keys: T[], p: number) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1].at) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = Math.max(b.at - a.at, 1e-5);
  const t = smooth(Math.min(Math.max((p - a.at) / span, 0), 1));
  return { a, b, t, i };
}

const VERT = /* glsl */ `
attribute vec3 aFrom;
attribute vec3 aTo;
attribute float aSeed;
uniform float uMix;
uniform float uTime;
uniform float uSize;
uniform float uBurst;
uniform vec3 uPointer;
varying float vSeed;
varying float vFade;

float ease(float t) { return t * t * (3.0 - 2.0 * t); }

void main() {
  // staggered morph: each particle departs on its own beat
  float stag = clamp(uMix * 1.3 - aSeed * 0.3, 0.0, 1.0);
  vec3 pos = mix(aFrom, aTo, ease(stag));

  // organic idle drift
  float t = uTime * 0.4 + aSeed * 19.0;
  pos += 0.09 * vec3(
    sin(t + pos.y * 1.2),
    cos(t * 1.31 + pos.x),
    sin(t * 0.83 + pos.z * 1.4)
  );

  // pointer repulsion — the cursor bends the field
  vec3 toP = pos - uPointer;
  float pd = length(toP.xy);
  pos.xy += normalize(toP.xy + 1e-4) * smoothstep(2.4, 0.0, pd) * 0.9;

  // press-start shockwave
  pos += normalize(pos + 1e-4) * uBurst * (0.4 + aSeed * 2.2);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uSize * (0.55 + aSeed * 1.1) * (36.0 / max(-mv.z, 0.1));
  gl_Position = projectionMatrix * mv;

  vSeed = aSeed;
  vFade = smoothstep(34.0, 7.0, -mv.z);
}
`;

const FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
varying float vSeed;
varying float vFade;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float core = smoothstep(0.5, 0.04, d);
  float hot = smoothstep(0.16, 0.0, d) * 0.8;
  vec3 col = mix(uColorA, uColorB, vSeed) + hot;
  gl_FragColor = vec4(col, (core + hot) * uOpacity * vFade);
}
`;

function ParticleField({
  journey,
  count,
}: {
  journey: JourneyState;
  count: number;
}) {
  const points = useRef<THREE.Points>(null!);
  const lines = useRef<THREE.LineSegments>(null!);
  const group = useRef<THREE.Group>(null!);
  const bracketIdx = useRef(-1);
  // Local ramp so a late-loading canvas fades in instead of popping.
  const localReveal = useRef(0);
  const { camera, size } = useThree();

  const formations = useMemo(() => buildFormations(count), [count]);
  const linkPositions = useMemo(() => buildSphereLinks(), []);

  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) seeds[i] = (i * 2654435761) % 1000 / 1000;
    const first = formations.identity;
    geo.setAttribute("position", new THREE.BufferAttribute(first.slice(), 3));
    geo.setAttribute("aFrom", new THREE.BufferAttribute(first.slice(), 3));
    geo.setAttribute("aTo", new THREE.BufferAttribute(first.slice(), 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uMix: { value: 0 },
        uTime: { value: 0 },
        uSize: { value: 1.6 },
        uBurst: { value: 0 },
        uOpacity: { value: 0 },
        uPointer: { value: new THREE.Vector3(0, 0, 99) },
        uColorA: { value: new THREE.Color("#45c4ff") },
        uColorB: { value: new THREE.Color("#1e3a8a") },
      },
    });
    return { geometry: geo, material: mat };
  }, [count, formations]);

  const lineMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: new THREE.Color("#7dd3fc"),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  const colA = useMemo(() => new THREE.Color(), []);
  const colB = useMemo(() => new THREE.Color(), []);
  const tmpA = useMemo(() => new THREE.Color(), []);
  const tmpB = useMemo(() => new THREE.Color(), []);
  const pointerWorld = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const p = journey.progress;
    const t = state.clock.elapsedTime;
    const u = material.uniforms;
    localReveal.current = Math.min(1, localReveal.current + delta * 0.7);

    // ——— formation morph ———
    const fb = bracket(FORMATION_KEYS, p);
    if (fb.i !== bracketIdx.current) {
      bracketIdx.current = fb.i;
      (geometry.getAttribute("aFrom") as THREE.BufferAttribute).copyArray(
        formations[fb.a.name]
      );
      (geometry.getAttribute("aTo") as THREE.BufferAttribute).copyArray(
        formations[fb.b.name]
      );
      geometry.getAttribute("aFrom").needsUpdate = true;
      geometry.getAttribute("aTo").needsUpdate = true;
    }
    u.uMix.value = fb.t;
    u.uTime.value = t;
    u.uBurst.value = journey.burst;

    // The field recedes while dense DOM content is on stage, so copy stays
    // readable and the particles become atmosphere instead of subject.
    const contentDim =
      1 -
      0.68 *
        Math.min(
          THREE.MathUtils.smoothstep(p, 0.27, 0.31),
          1 - THREE.MathUtils.smoothstep(p, 0.72, 0.76)
        );
    const lateDim = 1 - 0.45 * THREE.MathUtils.smoothstep(p, 0.77, 0.82);
    u.uOpacity.value =
      journey.reveal * localReveal.current * contentDim * lateDim;

    // ——— colour grade ———
    const [a0, b0] = FORMATION_COLORS[fb.a.name];
    const [a1, b1] = FORMATION_COLORS[fb.b.name];
    colA.set(a0).lerp(tmpA.set(a1), fb.t);
    colB.set(b0).lerp(tmpB.set(b1), fb.t);
    (u.uColorA.value as THREE.Color).copy(colA);
    (u.uColorB.value as THREE.Color).copy(colB);

    // point size adapts to viewport so mobile doesn't look sparse
    u.uSize.value =
      (1.6 * Math.min(size.width / 1280, 1.4) + 0.5) *
      (0.75 + 0.25 * contentDim);

    // ——— pointer → world (z=0 plane) ———
    pointerWorld
      .set(journey.pointerX, journey.pointerY, 0.5)
      .unproject(camera);
    pointerWorld.sub(camera.position).normalize();
    const dist = -camera.position.z / pointerWorld.z;
    pointerWorld.multiplyScalar(dist).add(camera.position);
    (u.uPointer.value as THREE.Vector3).lerp(pointerWorld, 0.12);

    // ——— camera rig ———
    const cb = bracket(CAMERA_KEYS, p);
    const cz = cb.a.z + (cb.b.z - cb.a.z) * cb.t;
    const cy = cb.a.y + (cb.b.y - cb.a.y) * cb.t;
    camera.position.z += (cz - camera.position.z) * 0.06;
    camera.position.y +=
      (cy + journey.pointerY * 0.55 - camera.position.y) * 0.05;
    camera.position.x += (journey.pointerX * 0.75 - camera.position.x) * 0.05;
    camera.lookAt(0, 0, 0);

    // slow world rotation — the "camera moving through environments" feel
    group.current.rotation.y = t * 0.035 + p * Math.PI * 1.15;
    group.current.rotation.x = Math.sin(p * Math.PI) * 0.12;

    // ——— network links (ecosystem beat only) ———
    const linkIn = THREE.MathUtils.smoothstep(p, 0.76, 0.82);
    const linkOut = 1 - THREE.MathUtils.smoothstep(p, 0.9, 0.96);
    lineMaterial.opacity = Math.min(linkIn, linkOut) * 0.32;
    lines.current.visible = lineMaterial.opacity > 0.004;
  });

  return (
    <group ref={group}>
      <points ref={points} geometry={geometry} material={material} />
      <lineSegments ref={lines} material={lineMaterial}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[linkPositions, 3]}
          />
        </bufferGeometry>
      </lineSegments>
    </group>
  );
}

class CanvasErrorBoundary extends Component<
  { onFail: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function CanvasStage({
  journey,
  count,
  onFail,
}: {
  journey: JourneyState;
  count: number;
  onFail: () => void;
}) {
  return (
    <CanvasErrorBoundary onFail={onFail}>
      <div className="fixed inset-0" aria-hidden="true">
        <Canvas
          dpr={[1, 1.75]}
          camera={{ fov: 50, near: 0.1, far: 80, position: [0, 0, 10.5] }}
          gl={{
            antialias: false,
            alpha: true,
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        >
          <ParticleField journey={journey} count={count} />
        </Canvas>
      </div>
    </CanvasErrorBoundary>
  );
}
