import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, Environment, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { create } from 'zustand'
import { CityScene } from './CityScene'
import { BUS_S, sampleAgents, type World } from '../world/scenario'
import { simTime } from '../world/clock'
import { SUN, useAtmos, type TimeOfDay } from '../world/atmos'

/** Only render while on screen, so several live views can share a page. */
function useOnScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: '200px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  return [ref, on] as const
}

function Frame({ children, className, dpr = [1, 1.75] }: { children: ReactNode; className?: string; dpr?: [number, number] }) {
  const [ref, on] = useOnScreen<HTMLDivElement>()
  return (
    <div ref={ref} className={className}>
      {/* offsetSize: measure layout size, not the transformed box, so scaled device frames render crisp and full */}
      <Canvas
        shadows
        dpr={dpr}
        resize={{ offsetSize: true }}
        frameloop={on ? 'always' : 'never'}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        onCreated={(st) => {
          if (import.meta.env.DEV) ((window as unknown as { __r3f?: unknown[] }).__r3f ??= []).push(st)
        }}
      >
        {children}
      </Canvas>
    </div>
  )
}

/** Low raking sun: long shadows carry the relief, the clay stays light. */
function DayLight({ target, time = 'day' }: { target: [number, number]; time?: TimeOfDay }) {
  const light = useRef<THREE.DirectionalLight>(null)
  useEffect(() => {
    if (!light.current) return
    light.current.target.position.set(target[0], 0, target[1])
    light.current.target.updateMatrixWorld()
  }, [target])
  return (
    <>
      <hemisphereLight args={time === 'night' ? ['#3d5068', '#0c0d0e', 0.35] : time === 'dusk' ? ['#c9b6c4', '#6d5f55', 0.45] : ['#eef3f6', '#a49f8f', 0.55]} />
      <directionalLight
        ref={light}
        position={sunPosition(target, time)}
        intensity={SUN[time].intensity}
        color={SUN[time].color}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.6}
        shadow-camera-left={-700}
        shadow-camera-right={700}
        shadow-camera-top={700}
        shadow-camera-bottom={-700}
        shadow-camera-near={10}
        shadow-camera-far={2400}
      />
    </>
  )
}

function sunPosition(target: [number, number], time: TimeOfDay): [number, number, number] {
  const { elev, az } = SUN[time]
  const e = THREE.MathUtils.degToRad(elev)
  const a = THREE.MathUtils.degToRad(az)
  const d = 900
  return [target[0] + Math.sin(a) * Math.cos(e) * d, Math.sin(e) * d, target[1] + Math.cos(a) * Math.cos(e) * d]
}

/** Shift the projection centre so the action sits right of the title block. */
function ViewShift({ x }: { x: number }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    if (size.width < 900) cam.clearViewOffset()
    else cam.setViewOffset(size.width, size.height, x * size.width, 0, size.width, size.height)
    cam.updateProjectionMatrix()
  }, [camera, size, x])
  return null
}

/** Metres per screen pixel at the point the camera looks at; drives the honest scale bar. */
export const useViewScale = create<{ mpp: number }>(() => ({ mpp: 1 }))
function ScaleProbe({ target }: { target: THREE.Vector3 }) {
  const { camera, size } = useThree()
  const n = useRef(0)
  useFrame(() => {
    if (n.current++ % 20) return
    const cam = camera as THREE.PerspectiveCamera
    const d = cam.position.distanceTo(target)
    const mpp = (2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / size.height
    if (Math.abs(mpp - useViewScale.getState().mpp) / mpp > 0.02) useViewScale.setState({ mpp })
  })
  return null
}

export function busFocus(world: World): [number, number] {
  const p = world.path.at(world.sStart + BUS_S, 0)
  return [p.x, p.z]
}

function Post() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={6} distanceFalloff={0.6} intensity={2.4} halfRes color="#1d1a16" />
      <Bloom luminanceThreshold={1.1} intensity={0.35} mipmapBlur />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  )
}

/** Real sky: Poly Haven HDRI for image-based lighting and the visible horizon. */
function DaySky({ background = true, time = 'day' }: { background?: boolean; time?: TimeOfDay }) {
  return (
    <Suspense fallback={null}>
      <Environment
        files={time === 'night' ? '/assets/hdri/night.hdr' : '/assets/hdri/day.hdr'}
        background={background}
        environmentIntensity={SUN[time].env}
        backgroundIntensity={SUN[time].sky}
      />
    </Suspense>
  )
}

/** Level 1 on the showcase: the city sheet in raking light, with the sensor wave. */
export function HeroCanvas({ world, xray, className }: { world: World; xray: boolean; className?: string }) {
  const focus = useMemo(() => busFocus(world), [world])
  const target = useMemo(() => new THREE.Vector3(focus[0] + 30, 0, focus[1] - 10), [focus])
  return (
    <Frame className={className}>
      <fog attach="fog" args={['#d6dde0', 1100, 3200]} />
      <DaySky />
      <PerspectiveCamera makeDefault fov={30} near={6} far={8000} position={[focus[0] - 250, 190, focus[1] + 270]} />
      <ViewShift x={-0.17} />
      <OrbitControls
        target={target}
        enableDamping
        dampingFactor={0.06}
        minPolarAngle={0.35}
        maxPolarAngle={1.18}
        minDistance={120}
        maxDistance={1400}
        autoRotate
        autoRotateSpeed={0.12}
        enablePan={false}
      />
      <ScaleProbe target={target} />
      <DayLight target={focus} />
      <CityScene world={world} xray={xray} />
      <Post />
    </Frame>
  )
}

// ---------- Twin: the full city surface with camera presets ----------

export type TwinView = 'city' | 'corridor' | 'chase' | 'top'
export const useTwinCam = create<{ view: TwinView; focus: [number, number] | null; setView: (v: TwinView) => void; flyTo: (p: [number, number]) => void }>((set) => ({
  view: 'city',
  focus: null,
  setView: (view) => set({ view, focus: null }),
  flyTo: (focus) => set({ focus }),
}))

function TwinCamera({ world }: { world: World }) {
  const ref = useRef<CameraControls>(null)
  const view = useTwinCam((s) => s.view)
  const focus = useTwinCam((s) => s.focus)
  const bus = useMemo(() => busFocus(world), [world])
  useEffect(() => {
    const c = ref.current
    if (!c) return
    if (focus) {
      void c.setLookAt(focus[0] - 140, 120, focus[1] + 150, focus[0], 0, focus[1], true)
      return
    }
    if (view === 'city') void c.setLookAt(bus[0] - 560, 430, bus[1] + 620, bus[0] + 40, 0, bus[1] - 40, true)
    if (view === 'corridor') void c.setLookAt(bus[0] - 210, 150, bus[1] + 230, bus[0] + 30, 0, bus[1] - 10, true)
    if (view === 'top') void c.setLookAt(bus[0], 900, bus[1] + 1, bus[0], 0, bus[1], true)
  }, [view, focus, bus])
  useFrame(() => {
    const c = ref.current
    if (!c || view !== 'chase' || focus) return
    const ego = sampleAgents(world, simTime()).find((a) => a.id === 'ego')!
    const fx = Math.sin(ego.heading)
    const fz = Math.cos(ego.heading)
    void c.setLookAt(ego.x - fx * 70, 38, ego.z - fz * 70, ego.x + fx * 60, 0, ego.z + fz * 60, true)
  })
  return <CameraControls ref={ref} makeDefault minDistance={40} maxDistance={2200} maxPolarAngle={1.35} smoothTime={0.6} />
}

export function TwinCanvas({ world, xray, isolines, labels, className }: { world: World; xray: boolean; isolines: boolean; labels: boolean; className?: string }) {
  const focus = useMemo(() => busFocus(world), [world])
  const { time, rain, heat } = useAtmos()
  return (
    <Frame className={className}>
      <fog attach="fog" args={[SUN[time].fog, time === 'day' ? 1300 : 900, time === 'day' ? 3600 : 2600]} />
      <DaySky time={time} />
      <PerspectiveCamera makeDefault fov={32} near={6} far={8000} position={[focus[0] - 560, 430, focus[1] + 620]} />
      <TwinCamera world={world} />
      <DayLight target={focus} time={time} />
      <CityScene world={world} xray={xray} isolines={isolines} labels={labels} mode={time === 'day' ? 'day' : 'night'} dusk={time === 'dusk'} rain={rain} wet={rain} heat={heat} photoreal={time === 'day'} />
      <Post />
    </Frame>
  )
}

// ---------- Level 2: lane-level bird's-eye view ----------

function FollowTop({ world, height = 260 }: { world: World; height?: number }) {
  const { camera } = useThree()
  const look = useRef(new THREE.Vector3())
  const first = useRef(true)
  useFrame(() => {
    const ego = sampleAgents(world, simTime()).find((a) => a.id === 'ego')!
    const want = new THREE.Vector3(ego.x + Math.sin(ego.heading) * 60, 0, ego.z + Math.cos(ego.heading) * 60)
    if (first.current) {
      look.current.copy(want)
      first.current = false
    } else look.current.lerp(want, 0.08)
    camera.position.set(look.current.x, height, look.current.z + 0.001)
    camera.up.set(Math.sin(ego.heading), 0, Math.cos(ego.heading))
    camera.lookAt(look.current)
  })
  return null
}

export function BevCanvas({ world, className, zoom = 4.2 }: { world: World; className?: string; zoom?: number }) {
  const focus = useMemo(() => busFocus(world), [world])
  return (
    <Frame className={className} dpr={[1, 2]}>
      <color attach="background" args={['#e7e3d9']} />
      <OrthographicCamera makeDefault zoom={zoom} near={1} far={2000} position={[focus[0], 300, focus[1]]} />
      <FollowTop world={world} />
      <hemisphereLight args={['#faf8f3', '#d6d0c3', 0.9]} />
      <directionalLight position={[focus[0] - 200, 400, focus[1] + 100]} intensity={1.6} />
      <DaySky background={false} />
      <CityScene world={world} xray={false} isolines={false} labels={false} photoreal={false} />
    </Frame>
  )
}

// ---------- Level 3: the road from the driver's seat ----------

function DriverCam({ world, who }: { world: World; who: string }) {
  const { camera } = useThree()
  const target = useRef(new THREE.Vector3())
  const lamp = useRef<THREE.SpotLight>(null)
  useFrame(() => {
    const a = sampleAgents(world, simTime()).find((x) => x.id === who)!
    const fx = Math.sin(a.heading)
    const fz = Math.cos(a.heading)
    camera.position.set(a.x - fx * 0.6, 1.3, a.z - fz * 0.6)
    target.current.lerp(new THREE.Vector3(a.x + fx * 40, 0.9, a.z + fz * 40), 0.2)
    camera.lookAt(target.current)
    if (lamp.current) {
      lamp.current.position.set(a.x + fx * 1.8, 0.8, a.z + fz * 1.8)
      lamp.current.target.position.set(a.x + fx * 45, 0, a.z + fz * 45)
      lamp.current.target.updateMatrixWorld()
    }
  })
  return <spotLight ref={lamp} angle={0.55} penumbra={0.8} distance={140} intensity={900} decay={1.6} color="#f3ead8" />
}

/** The night sheet: graphite road, clay hairline lanes, headlights, threats drawn through what hides them. */
export function DriverCanvas({ world, who = 'ego', className, xray = true, own = false }: { world: World; who?: string; className?: string; xray?: boolean; own?: boolean }) {
  return (
    <Frame className={className}>
      <color attach="background" args={['#0a0f15']} />
      <fog attach="fog" args={['#0d131a', 40, 520]} />
      <PerspectiveCamera makeDefault fov={58} near={0.3} far={900} />
      <DriverCam world={world} who={who} />
      <Suspense fallback={null}>
        <Environment files="/assets/hdri/night.hdr" environmentIntensity={0.35} />
      </Suspense>
      <hemisphereLight args={['#4d5f73', '#120f0c', 0.55]} />
      <directionalLight position={[200, 300, 100]} intensity={0.12} color="#9fb2bb" />
      <CityScene world={world} mode="night" xray={xray && !own} own={own} isolines={false} labels={false} waveFrom={who} fans={false} driver />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={1.15} mipmapBlur />
      </EffectComposer>
    </Frame>
  )
}

// ---------- Landing story: camera and scenario time follow the scroll ----------

export const useStory = create<{ p: number }>(() => ({ p: 0 }))

function StoryCamera({ world }: { world: World }) {
  const { camera } = useThree()
  const curves = useMemo(() => {
    const f = busFocus(world)
    const at = (ds: number, off: number, y: number) => {
      const p = world.path.at(world.sStart + BUS_S + ds, off)
      return new THREE.Vector3(p.x, y, p.z)
    }
    const v = (x: number, y: number, z: number) => new THREE.Vector3(f[0] + x, y, f[1] + z)
    const pos = new THREE.CatmullRomCurve3([v(-760, 560, 820), v(-330, 240, 360), at(-90, 14, 46), at(-34, 2.5, 5.5), at(-70, -3.5, 3.2), v(-300, 380, 160)])
    const look = new THREE.CatmullRomCurve3([v(40, 0, -40), v(30, 0, -10), at(10, -4, 0), at(8, -5, 1.4), at(40, -2, 1.2), v(60, 0, -60)])
    return { pos, look }
  }, [world])
  const p = useRef(0)
  const look = useRef(new THREE.Vector3())
  useFrame(() => {
    p.current += (useStory.getState().p - p.current) * 0.08
    const k = Math.min(0.999, Math.max(0, p.current))
    camera.position.copy(curves.pos.getPoint(k))
    look.current.copy(curves.look.getPoint(k))
    camera.lookAt(look.current)
    // near plane follows altitude: crisp ground layers from the air, no clipping at street level
    const cam = camera as THREE.PerspectiveCamera
    const near = Math.min(6, Math.max(0.4, camera.position.y * 0.02))
    if (Math.abs(cam.near - near) > 0.05) {
      cam.near = near
      cam.updateProjectionMatrix()
    }
  })
  return null
}

export function StoryCanvas({ world, xray, className }: { world: World; xray: boolean; className?: string }) {
  return (
    <Frame className={className}>
      <fog attach="fog" args={['#d6dde0', 1100, 3400]} />
      <DaySky />
      <PerspectiveCamera makeDefault fov={34} near={0.5} far={8000} />
      <StoryCamera world={world} />
      <DayLight target={busFocus(world)} />
      <CityScene world={world} xray={xray} />
      <Post />
    </Frame>
  )
}
