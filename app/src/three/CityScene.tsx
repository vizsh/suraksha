import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { buildBuildings, buildKerbGap, buildLanePaint, buildRoads } from './geometry'
import { makeEdgeMaterial, makeWaveUniforms, withWave } from './materials'
import { arcsAt, BUS_S, sampleAgents, waveRadius, type World } from '../world/scenario'
import { simTime } from '../world/clock'
import { useSim, type ThreatView } from '../world/store'
import { Fleet } from './realism/Fleet'
import { Walkers } from './realism/Walkers'
import { BarricadeSet, Lamps, Pothole, Trees, useSurfaceMaterials } from './realism/Street'
import { GOOGLE_KEY, GoogleTiles, SatelliteGround } from './realism/Ground'

export type SheetMode = 'day' | 'night'

const STATE_COLOR = {
  confirmed: '#e0401f',
  potential: '#d19a1c',
  noticed: '#d19a1c',
  predicted: '#6b4fa0',
  resolved: '#8a8f8c',
  faded: '#8a8f8c',
} as const

export function CityScene({
  world,
  mode = 'day',
  xray = true,
  isolines = true,
  labels = true,
  waveFrom = 'ego',
  fans = true,
  driver = false,
  photoreal = true,
}: {
  world: World
  mode?: SheetMode
  xray?: boolean
  isolines?: boolean
  labels?: boolean
  waveFrom?: string
  fans?: boolean
  driver?: boolean
  /** use Google photoreal tiles when a key is configured */
  photoreal?: boolean
}) {
  const night = mode === 'night'
  const google = photoreal && !night && !!GOOGLE_KEY
  const geo = useMemo(() => {
    const b = buildBuildings(world.data)
    const roads = buildRoads(world.data)
    const lanes = buildLanePaint(world.path, world.sStart - 160, world.sStart + 760)
    const gap = buildKerbGap(world.path, world.sStart + BUS_S + 14, world.sStart + BUS_S + 110, -8.4)
    return { ...b, ...roads, lanes, gap }
  }, [world])

  const u = useMemo(() => makeWaveUniforms(1), [])
  const uGround = useMemo(() => makeWaveUniforms(0), [])
  const mats = useMemo(() => {
    const building = withWave(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 }), u, { facade: true })
    const ground = withWave(new THREE.MeshStandardMaterial({ color: night ? '#3a4144' : '#e8e6e0', roughness: 0.95 }), uGround)
    const edge = makeEdgeMaterial(u, night ? '#a9b2ad' : '#1c2226', night ? 0.08 : 0.05)
    return { building, ground, edge }
  }, [u, uGround, night])

  useFrame(() => {
    const t = simTime()
    const agents = sampleAgents(world, t)
    const src = agents.find((a) => a.id === waveFrom) ?? agents[0]
    for (const uu of [u, uGround]) {
      uu.uCenter.value.set(src.x, src.z)
      uu.uRadius.value = waveRadius(t)
      uu.uOn.value = xray ? 1 : 0
      uu.uNight.value = night ? 1 : 0
    }
  })

  return (
    <group>
      {/* earth beyond the imagery, then the imagery itself */}
      <mesh rotation-x={-Math.PI / 2} position-y={-1.5} receiveShadow>
        <planeGeometry args={[6000, 6000]} />
        <meshStandardMaterial color={night ? '#0e1214' : '#9a9886'} roughness={1} />
      </mesh>
      {google ? (
        <GoogleTiles data={world.data} calibrateAt={[world.path.at(world.sStart + BUS_S, 0).x, world.path.at(world.sStart + BUS_S, 0).z]} />
      ) : (
        <>
          <SatelliteGround data={world.data} material={mats.ground} night={night} />
          <mesh geometry={geo.merged} material={mats.building} castShadow receiveShadow />
          <lineSegments geometry={geo.edges} material={mats.edge} />
          <Suspense fallback={null}>
            <Roads geo={geo} night={night} />
            <Trees world={world} night={night} />
          </Suspense>
          <Lamps world={world} night={night} />
        </>
      )}
      <mesh geometry={geo.lanes.dash}>
        <meshStandardMaterial polygonOffset polygonOffsetFactor={-6} polygonOffsetUnits={-6} color="#f4f2ec" roughness={0.6} emissive="#ffffff" emissiveIntensity={night ? 0.06 : 0} />
      </mesh>
      <mesh geometry={geo.lanes.solid}>
        <meshStandardMaterial polygonOffset polygonOffsetFactor={-6} polygonOffsetUnits={-6} color="#f4f2ec" roughness={0.6} emissive="#ffffff" emissiveIntensity={night ? 0.06 : 0} />
      </mesh>
      <mesh geometry={geo.gap} position-y={0.02}>
        <meshBasicMaterial color="#b4562b" />
      </mesh>
      {isolines && <RiskTerraces world={world} />}
      <Fleet world={world} night={night} rings={!driver} hide={driver ? waveFrom : undefined} />
      <Suspense fallback={null}>
        <Walkers world={world} xray={xray} ambient={!driver || true} />
        <BarricadeSet world={world} night={night} />
      </Suspense>
      <Pothole world={world} />
      {fans && <SensorFans world={world} />}
      {!driver && <Arcs world={world} />}
      <Markers labels={labels} mode={mode} driver={driver} />
    </group>
  )
}

function Roads({ geo, night }: { geo: ReturnType<typeof buildRoads>; night: boolean }) {
  const m = useSurfaceMaterials(night)
  return (
    <group>
      <mesh geometry={geo.minor} material={m.minor} receiveShadow />
      <mesh geometry={geo.major} material={m.road} receiveShadow />
      <mesh geometry={geo.foot} material={m.foot} receiveShadow />
      <mesh geometry={geo.kerb} material={m.kerb} receiveShadow />
    </group>
  )
}

/** Chaikin corner cutting: turns grid-stepped contours into surveyed curves. */
function smoothRing(ring: [number, number][], passes = 3) {
  let pts = ring
  for (let p = 0; p < passes; p++) {
    const out: [number, number][] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[i + 1]
      out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75])
    }
    out.push(out[0])
    pts = out
  }
  return pts
}

function RiskTerraces({ world }: { world: World }) {
  const rings = useMemo(
    () =>
      world.risk.isolines.flatMap((iso, k) =>
        iso.rings
          .filter((r) => r.length > 6)
          .map((ring, i) => ({ key: `${k}-${i}`, k, level: iso.level, pts: smoothRing(ring as [number, number][]) })),
      ),
    [world],
  )
  return (
    <group>
      {rings.map((r) => (
        <Line
          key={r.key}
          points={r.pts.map(([x, z]) => [x, 0.4 + r.k * 5.5, z] as [number, number, number])}
          color="#6b4fa0"
          lineWidth={0.8 + r.k * 0.35}
          transparent
          opacity={0.42 + r.k * 0.09}
        />
      ))}
      {rings
        .filter((r) => r.k >= 3 && r.pts.length > 40)
        .map((r) => {
          const [x, z] = r.pts[Math.floor(r.pts.length * 0.15)]
          return (
            <Html key={'v' + r.key} position={[x, 0.4 + r.k * 5.5, z]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <span className="figures bg-clay/80 px-1 text-[10px] text-predicted">{r.level.toFixed(2)}</span>
            </Html>
          )
        })}
    </group>
  )
}

/** Perception footprint of the two connected cars that matter in this beat. */
function SensorFans({ world }: { world: World }) {
  const ego = useRef<THREE.Mesh>(null)
  const scout = useRef<THREE.Mesh>(null)
  const fan = useMemo(() => {
    const g = new THREE.CircleGeometry(46, 40, -Math.PI / 3, (2 * Math.PI) / 3)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  useFrame(() => {
    const agents = sampleAgents(world, simTime())
    for (const [ref, id] of [
      [ego, 'ego'],
      [scout, 'scout'],
    ] as const) {
      const a = agents.find((x) => x.id === id)
      if (!a || !ref.current) continue
      ref.current.position.set(a.x, 0.15, a.z)
      ref.current.rotation.y = a.heading - Math.PI / 2
    }
  })
  return (
    <group>
      <mesh ref={ego} geometry={fan}>
        <meshBasicMaterial color="#2a7fd0" transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={scout} geometry={fan}>
        <meshBasicMaterial color="#2a7fd0" transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

const ARC_POOL = 36
const ARC_PTS = 28
function Arcs({ world }: { world: World }) {
  const lines = useMemo(
    () =>
      Array.from({ length: ARC_POOL }, () => {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_PTS * 3), 3))
        const m = new THREE.LineBasicMaterial({ color: '#1f6fb2', transparent: true, depthTest: false })
        const l = new THREE.Line(g, m)
        l.renderOrder = 30
        l.frustumCulled = false
        return l
      }),
    [],
  )
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const q = new THREE.QuadraticBezierCurve3(a, c, b)
  useFrame(() => {
    const t = simTime()
    const agents = sampleAgents(world, t)
    const byId = new Map(agents.map((x) => [x.id, x]))
    const arcs = arcsAt(world, t)
    lines.forEach((l, i) => {
      const arc = arcs[i]
      if (!arc) {
        l.visible = false
        return
      }
      const f = byId.get(arc.from)
      const to = byId.get(arc.to)
      if (!f || !to) {
        l.visible = false
        return
      }
      l.visible = true
      a.set(f.x, 3, f.z)
      b.set(to.x, 3, to.z)
      c.set((f.x + to.x) / 2, 18 + a.distanceTo(b) * 0.22, (f.z + to.z) / 2)
      const pos = l.geometry.getAttribute('position') as THREE.BufferAttribute
      const head = Math.min(1, arc.p * 1.6)
      const tail = Math.max(0, arc.p * 1.6 - 0.55)
      for (let k = 0; k < ARC_PTS; k++) {
        const p = q.getPoint(tail + ((head - tail) * k) / (ARC_PTS - 1))
        pos.setXYZ(k, p.x, p.y, p.z)
      }
      pos.needsUpdate = true
      const m = l.material as THREE.LineBasicMaterial
      m.color.set(arc.color === 'confirmed' ? '#e0401f' : '#d19a1c')
      m.opacity = 1 - arc.p * 0.6
    })
  })
  return (
    <group>
      {lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
    </group>
  )
}

function Markers({ labels, mode, driver }: { labels: boolean; mode: SheetMode; driver: boolean }) {
  const threats = useSim((st) => st.threats)
  return (
    <group>
      {threats
        .filter((th) => !(driver && th.state === 'predicted'))
        .map((th) => (
          <Benchmark key={th.id} th={th} labels={labels} mode={mode} compact={driver} />
        ))}
    </group>
  )
}

function ringPoints(r: number) {
  const pts: [number, number, number][] = []
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2
    pts.push([Math.cos(a) * r, 0, Math.sin(a) * r])
  }
  return pts
}

/** A survey benchmark: inverted triangle on a stem when confirmed, dashed ring while potential,
 *  open double ring for predicted risk, hollow grey once resolved. Drawn through buildings. */
function Benchmark({ th, labels, mode, compact = false }: { th: ThreatView; labels: boolean; mode: SheetMode; compact?: boolean }) {
  const group = useRef<THREE.Group>(null)
  const tri = useRef<THREE.Mesh>(null)
  const pulse = useRef<THREE.Group>(null)
  const target = useRef(new THREE.Vector3(th.pos[0], 0, th.pos[1]))
  target.current.set(th.pos[0], 0, th.pos[1])
  const triGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(2.6, 4.2, 3)
    g.rotateX(Math.PI)
    return g
  }, [])
  const rSmall = useMemo(() => ringPoints(9), [])
  const rBig = useMemo(() => ringPoints(26), [])
  const rMid = useMemo(() => ringPoints(15), [])
  const st = th.state
  const color = STATE_COLOR[st as keyof typeof STATE_COLOR] ?? '#8a8f8c'
  const predicted = st === 'predicted'
  const tentative = st === 'potential' || st === 'noticed'
  useFrame(({ clock }) => {
    if (!group.current) return
    group.current.position.lerp(target.current, 0.25)
    if (tri.current) {
      tri.current.position.y = 16 + Math.sin(clock.elapsedTime * 2) * 0.6
      tri.current.rotation.y += 0.01
    }
    if (pulse.current) {
      const k = (clock.elapsedTime * 0.6) % 1
      pulse.current.scale.setScalar(1 + k * 0.9)
      pulse.current.children.forEach((c) => {
        const m = (c as THREE.Mesh).material as THREE.Material & { opacity: number }
        if (m) m.opacity = 1 - k
      })
    }
  })
  return (
    <group ref={group} position={[th.pos[0], 0, th.pos[1]]}>
      {st === 'confirmed' && compact && (
        <group ref={pulse}>
          <Line points={rSmall} color={color} lineWidth={2.4} depthTest={false} transparent />
        </group>
      )}
      {st === 'confirmed' && !compact && (
        <>
          <mesh ref={tri} geometry={triGeo} renderOrder={40}>
            <meshBasicMaterial color={color} depthTest={false} transparent />
          </mesh>
          <Line points={[[0, 0.2, 0], [0, 14, 0]]} color={color} lineWidth={1} depthTest={false} transparent opacity={0.7} />
          <group ref={pulse}>
            <Line points={rSmall} color={color} lineWidth={1.6} depthTest={false} transparent />
          </group>
        </>
      )}
      {tentative && <Line points={st === 'noticed' ? rSmall : rMid} color={color} lineWidth={1.6} dashed dashSize={2.2} gapSize={1.6} depthTest={false} transparent />}
      {predicted && (
        <>
          <Line points={rBig} color={color} lineWidth={1.4} depthTest={false} transparent opacity={0.85} />
          <Line points={rMid} color={color} lineWidth={1.2} depthTest={false} transparent opacity={0.7} />
        </>
      )}
      {st === 'resolved' && (
        <Line points={rSmall} color={color} lineWidth={1.2} dashed dashSize={1} gapSize={2.5} depthTest={false} transparent opacity={0.6} />
      )}
      {labels && st !== 'resolved' && (
        <Html position={[0, predicted ? 10 : 24, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={'whitespace-nowrap border-l px-2 py-0.5 text-[11px] leading-tight ' + (mode === 'day' ? 'bg-clay/85 text-ink' : 'bg-night/80 text-clay')}
            style={{ borderColor: color, fontVariationSettings: "'wdth' 82" }}
          >
            <span className="font-medium">{tentative ? `Possible ${th.label.toLowerCase()}` : th.label}</span>
          </div>
        </Html>
      )}
    </group>
  )
}
