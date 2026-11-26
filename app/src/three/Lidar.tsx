// LiDAR view of the twin: the same city, drawn as the point cloud a roof-mounted scanner returns.
// Every surface of the twin (walls, roofs, carriageways, footpaths, lane paint, trees, open ground)
// is sampled into points once per world. A shader colours them by what they are and how high they
// sit, sweeps a scan line around the ego car, draws the concentric ground rings a spinning sensor
// leaves on the road, and lets the rest of the city sit dimmer, as the map the fleet remembers.
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sampleAgents, waveRadius, type World } from "../world/scenario";
import { simTime } from "../world/clock";
import { treePoints } from "./realism/Street";

// what a point is; the shader picks its colour from this
const K = {
  ground: 0,
  road: 1,
  foot: 2,
  wall: 3,
  roof: 4,
  tree: 5,
  paint: 6,
} as const;

interface Geo {
  merged: THREE.BufferGeometry;
  major: THREE.BufferGeometry;
  minor: THREE.BufferGeometry;
  foot: THREE.BufferGeometry;
  kerb: THREE.BufferGeometry;
  lanes: { dash: THREE.BufferGeometry; solid: THREE.BufferGeometry };
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Cloud {
  pos: number[] = [];
  kind: number[] = [];
  seed: number[] = [];
  r = rng(7);
  push(x: number, y: number, z: number, k: number) {
    this.pos.push(x, y, z);
    this.kind.push(k);
    this.seed.push(this.r());
  }
  /** Scatter points over a triangle mesh, `spacing` metres apart on average. */
  surface(
    g: THREE.BufferGeometry,
    spacing: number,
    kind: (ny: number) => number,
    lift = 0,
  ) {
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    const idx = g.getIndex();
    const n = idx ? idx.count : p.count;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const per = 1 / (spacing * spacing);
    for (let i = 0; i < n; i += 3) {
      const ia = idx ? idx.getX(i) : i;
      const ib = idx ? idx.getX(i + 1) : i + 1;
      const ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(p, ia);
      b.fromBufferAttribute(p, ib);
      c.fromBufferAttribute(p, ic);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      const cross = ab.clone().cross(ac);
      const area = cross.length() / 2;
      if (area < 1e-4) continue;
      const k = kind(Math.abs(cross.y) / (area * 2));
      const count = Math.floor(area * per + this.r());
      for (let j = 0; j < count; j++) {
        let u = this.r();
        let v = this.r();
        if (u + v > 1) {
          u = 1 - u;
          v = 1 - v;
        }
        this.push(
          a.x + ab.x * u + ac.x * v,
          a.y + ab.y * u + ac.y * v + lift,
          a.z + ab.z * u + ac.z * v,
          k,
        );
      }
    }
  }
}

const cache = new WeakMap<World, THREE.BufferGeometry>();

/** The point cloud for a world. Built on first use (a few hundred ms), then shared. */
export function buildCloud(world: World, geo: Geo) {
  const hit = cache.get(world);
  if (hit) return hit;
  const c = new Cloud();
  // buildings: walls on a scanner-like grid, roofs a little sparser
  c.surface(geo.merged, 1.9, (ny) => (ny > 0.7 ? K.roof : K.wall));
  c.surface(geo.major, 1.1, () => K.road);
  c.surface(geo.minor, 1.9, () => K.road);
  c.surface(geo.foot, 1.7, () => K.foot);
  c.surface(geo.kerb, 0.6, () => K.foot);
  c.surface(geo.lanes.dash, 0.32, () => K.paint, 0.02);
  c.surface(geo.lanes.solid, 0.32, () => K.paint, 0.02);
  // trees: a trunk and a ragged crown
  for (const t of treePoints(world)) {
    for (let i = 0; i < 6; i++)
      c.push(
        t.x + (c.r() - 0.5) * 0.3,
        0.4 + i * 0.55,
        t.z + (c.r() - 0.5) * 0.3,
        K.tree,
      );
    for (let i = 0; i < 90; i++) {
      const th = c.r() * Math.PI * 2;
      const ph = Math.acos(2 * c.r() - 1);
      const rr = 2.1 + c.r() * 0.7;
      c.push(
        t.x + Math.sin(ph) * Math.cos(th) * rr,
        4.9 + Math.cos(ph) * rr * 0.8,
        t.z + Math.sin(ph) * Math.sin(th) * rr,
        K.tree,
      );
    }
  }
  // open ground: a sparse jittered grid across the whole sheet
  const [W, H] = world.data.size;
  for (let x = -W / 2; x < W / 2; x += 6)
    for (let z = -H / 2; z < H / 2; z += 6)
      c.push(x + c.r() * 6, 0, z + c.r() * 6, K.ground);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(c.pos, 3));
  g.setAttribute("kind", new THREE.Float32BufferAttribute(c.kind, 1));
  g.setAttribute("seed", new THREE.Float32BufferAttribute(c.seed, 1));
  g.computeBoundingSphere();
  cache.set(world, g);
  return g;
}

const vertex = /* glsl */ `
attribute float kind;
attribute float seed;
uniform vec2 uEgo;
uniform float uSweep;
uniform float uWave;
uniform float uWaveOn;
uniform float uScale;
uniform float uPx;
varying vec3 vColor;
varying float vAlpha;

vec3 heightRamp(float h) {
  float k = clamp(h / 60.0, 0.0, 1.0);
  vec3 lo = vec3(0.05, 0.20, 0.46);
  vec3 mid = vec3(0.20, 0.55, 0.86);
  vec3 hi = vec3(0.86, 0.93, 0.97);
  return k < 0.45 ? mix(lo, mid, k / 0.45) : mix(mid, hi, (k - 0.45) / 0.55);
}

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec2 d = position.xz - uEgo;
  float dist = length(d);
  // the scan head turns around the ego car; points it has just passed glow and fade
  float lag = mod(uSweep - atan(d.x, d.y), 6.2831853);
  float trail = exp(-lag * 2.4);
  float live = 1.0 - smoothstep(95.0, 150.0, dist);

  vec3 col;
  float size = 0.85;
  if (kind < 0.5) { col = vec3(0.085, 0.11, 0.125); size = 1.1; }
  else if (kind < 1.5) col = vec3(0.22, 0.29, 0.33);
  else if (kind < 2.5) col = vec3(0.30, 0.35, 0.37);
  else if (kind < 4.5) col = heightRamp(position.y) * (kind < 3.5 ? 1.0 : 1.3);
  else if (kind < 5.5) col = vec3(0.24, 0.52, 0.32);
  else { col = vec3(1.3, 1.3, 1.25); size = 0.5; }

  // rings a spinning sensor leaves on flat ground, tighter near the car
  float onGround = kind < 2.5 || kind > 5.5 ? 1.0 : 0.0;
  float ring = onGround * live * pow(abs(sin(log(dist + 3.0) * 24.0)), 6.0);

  float memory = 0.5 + 0.25 * seed;
  float bright = mix(memory, 1.15, live) + trail * live * 2.6 + ring * 1.8;
  float wave = uWaveOn * exp(-pow((dist - uWave) / 6.0, 2.0));
  vColor = col * bright + vec3(0.30, 0.62, 0.95) * wave * 1.3 + vec3(0.25, 0.55, 0.85) * ring * 0.25;
  vAlpha = 1.0 - smoothstep(1500.0, 3000.0, -mv.z);

  gl_PointSize = clamp(size * uScale / -mv.z, uPx, 4.5 * uPx);
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25) discard;
  gl_FragColor = vec4(vColor * vAlpha * (1.0 - r * 2.4), 1.0);
}
`;

export function Lidar({
  world,
  geo,
  xray,
  waveFrom = "ego",
}: {
  world: World;
  geo: Geo;
  xray: boolean;
  waveFrom?: string;
}) {
  const geometry = useMemo(() => buildCloud(world, geo), [world, geo]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uEgo: { value: new THREE.Vector2() },
          uSweep: { value: 0 },
          uWave: { value: 0 },
          uWaveOn: { value: 0 },
          uScale: { value: 400 },
          uPx: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useFrame((state) => {
    const t = simTime();
    const agents = sampleAgents(world, t);
    const src = agents.find((a) => a.id === waveFrom) ?? agents[0];
    const u = material.uniforms;
    u.uEgo.value.set(src.x, src.z);
    u.uSweep.value = (state.clock.elapsedTime * Math.PI * 2) / 1.6;
    u.uWave.value = waveRadius(t);
    u.uWaveOn.value = xray ? 1 : 0;
    const dpr = state.gl.getPixelRatio();
    u.uScale.value = state.size.height * dpr * 0.5;
    u.uPx.value = dpr;
  });
  return (
    <points
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-1}
    />
  );
}
