/**
 * Particle formation targets — one Float32Array (N × 3) per story beat.
 * The GPU morphs between consecutive formations; these only run once at mount.
 * Seeded RNG keeps every visit deterministic.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FORMATION_ORDER = [
  "identity",
  "chaos",
  "converge",
  "helix",
  "wave",
  "clusters",
  "sphere",
  "galaxy",
] as const;

export type FormationName = (typeof FORMATION_ORDER)[number];

/** Scene 1 — the Stratxcel mark: an X of two crossing bars inside a halo ring. */
function identity(n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = rand();
    let x: number, y: number, z: number;
    if (r < 0.62) {
      // two crossing bars of the X
      const t = rand() * 2 - 1;
      const bar = rand() < 0.5 ? 1 : -1;
      x = t * 2.2 + (rand() - 0.5) * 0.22;
      y = t * 2.2 * bar + (rand() - 0.5) * 0.22;
      z = (rand() - 0.5) * 0.5;
    } else if (r < 0.9) {
      // halo ring
      const a = rand() * Math.PI * 2;
      const rad = 3.4 + (rand() - 0.5) * 0.18;
      x = Math.cos(a) * rad;
      y = Math.sin(a) * rad;
      z = (rand() - 0.5) * 0.3;
    } else {
      // faint dust
      const a = rand() * Math.PI * 2;
      const rad = 4.5 + rand() * 5;
      x = Math.cos(a) * rad;
      y = Math.sin(a) * rad * 0.7;
      z = (rand() - 0.5) * 4;
    }
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return out;
}

/** Scene 2 — chaos storm: a wide, ragged cloud with hot pockets. */
function chaos(n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const clustered = rand() < 0.35;
    if (clustered) {
      const cx = (rand() - 0.5) * 14;
      const cy = (rand() - 0.5) * 9;
      const cz = (rand() - 0.5) * 8;
      out[i * 3] = cx + (rand() - 0.5) * 1.6;
      out[i * 3 + 1] = cy + (rand() - 0.5) * 1.6;
      out[i * 3 + 2] = cz + (rand() - 0.5) * 1.6;
    } else {
      out[i * 3] = (rand() - 0.5) * 20;
      out[i * 3 + 1] = (rand() - 0.5) * 12;
      out[i * 3 + 2] = (rand() - 0.5) * 12;
    }
  }
  return out;
}

/** Chaos collapsing into order: a tight torus — one connected loop. */
function converge(n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n * 3);
  const R = 3.1;
  const r0 = 0.55;
  for (let i = 0; i < n; i++) {
    const u = rand() * Math.PI * 2;
    const v = rand() * Math.PI * 2;
    const r = r0 * Math.sqrt(rand());
    const x = (R + r * Math.cos(v)) * Math.cos(u);
    const y = r * Math.sin(v) * 1.1;
    const z = (R + r * Math.cos(v)) * Math.sin(u);
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z * 0.6;
  }
  return out;
}

/** Capabilities — a double helix stream flowing upward: services as living systems. */
function helix(n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const strand = rand() < 0.5 ? 0 : Math.PI;
    const t = rand();
    const a = t * Math.PI * 6 + strand;
    const rad = 1.9 + (rand() - 0.5) * 0.5;
    out[i * 3] = Math.cos(a) * rad + (rand() - 0.5) * 0.2;
    out[i * 3 + 1] = (t - 0.5) * 11;
    out[i * 3 + 2] = Math.sin(a) * rad + (rand() - 0.5) * 0.2;
  }
  return out;
}

/** Agent scene — a data plane: flat grid with a standing wave. */
function wave(n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n * 3);
  const side = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const gx = (i % side) / side - 0.5;
    const gz = Math.floor(i / side) / side - 0.5;
    const x = gx * 16;
    const z = gz * 12;
    const y =
      Math.sin(gx * Math.PI * 4) * Math.cos(gz * Math.PI * 3) * 0.9 - 4.2;
    out[i * 3] = x + (rand() - 0.5) * 0.12;
    out[i * 3 + 1] = y + (rand() - 0.5) * 0.12;
    out[i * 3 + 2] = z + (rand() - 0.5) * 0.12;
  }
  return out;
}

/** Case studies — three orbiting result-clusters. */
function clusters(n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n * 3);
  const centers = [
    [-4.6, 1.4, 0],
    [0, -1.8, -1],
    [4.6, 1.2, 0.5],
  ];
  for (let i = 0; i < n; i++) {
    const c = centers[i % 3];
    // gaussian-ish blob
    const r = Math.pow(rand(), 0.6) * 1.7;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    out[i * 3] = c[0] + r * Math.sin(phi) * Math.cos(theta);
    out[i * 3 + 1] = c[1] + r * Math.sin(phi) * Math.sin(theta) * 0.8;
    out[i * 3 + 2] = c[2] + r * Math.cos(phi) * 0.8;
  }
  return out;
}

/** Ecosystem — a network sphere: every module part of one surface. */
function sphere(n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n * 3);
  const R = 3.6;
  for (let i = 0; i < n; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const jitter = 1 + (rand() - 0.5) * 0.04;
    out[i * 3] = R * jitter * Math.sin(phi) * Math.cos(theta);
    out[i * 3 + 1] = R * jitter * Math.sin(phi) * Math.sin(theta);
    out[i * 3 + 2] = R * jitter * Math.cos(phi);
  }
  return out;
}

/** Finale — a calm galaxy disc to sit behind the explore menu. */
function galaxy(n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n * 3);
  const arms = 3;
  for (let i = 0; i < n; i++) {
    const arm = i % arms;
    const t = Math.pow(rand(), 0.5);
    const angle = t * 4.2 + (arm / arms) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const rad = t * 8.5 + 0.4;
    out[i * 3] = Math.cos(angle) * rad;
    out[i * 3 + 1] = (rand() - 0.5) * (1.4 - t) - 2.4;
    out[i * 3 + 2] = Math.sin(angle) * rad * 0.72;
  }
  return out;
}

const GENERATORS: Record<
  FormationName,
  (n: number, rand: () => number) => Float32Array
> = {
  identity,
  chaos,
  converge,
  helix,
  wave,
  clusters,
  sphere,
  galaxy,
};

export function buildFormations(n: number): Record<FormationName, Float32Array> {
  const out = {} as Record<FormationName, Float32Array>;
  for (const name of FORMATION_ORDER) {
    out[name] = GENERATORS[name](n, mulberry32(name.length * 7919 + 42));
  }
  return out;
}

/**
 * Connection lines for the network-sphere beat: nearest-neighbour segments
 * over a small subset of sphere nodes. Returns positions for LineSegments.
 */
export function buildSphereLinks(nodeCount = 90, linksPerNode = 2): Float32Array {
  const rand = mulberry32(1337);
  const R = 3.6;
  const nodes: [number, number, number][] = [];
  for (let i = 0; i < nodeCount; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    nodes.push([
      R * Math.sin(phi) * Math.cos(theta),
      R * Math.sin(phi) * Math.sin(theta),
      R * Math.cos(phi),
    ]);
  }
  const segs: number[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const dists = nodes
      .map((p, j) => ({
        j,
        d:
          (p[0] - nodes[i][0]) ** 2 +
          (p[1] - nodes[i][1]) ** 2 +
          (p[2] - nodes[i][2]) ** 2,
      }))
      .filter((e) => e.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, linksPerNode);
    for (const { j } of dists) {
      segs.push(...nodes[i], ...nodes[j]);
    }
  }
  return new Float32Array(segs);
}
