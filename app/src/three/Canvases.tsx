import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, Environment, OrbitControls, OrthographicCamera, PerformanceMonitor, PerspectiveCamera, useProgress } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import './haze'
import { satellitePending } from './realism/Ground'
import { create } from 'zustand'
import { CityScene } from './CityScene'
import { focusPoint, sampleAgents, type World } from '../world/scenario'
import { simTime } from '../world/clock'
import { SUN, useAtmos, type TimeOfDay } from '../world/atmos'

/** Only render while on screen, so several live views can share a page. */
function useOnScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [on, setOn] = useState(false)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const io = new IntersectionObserver(
      ([e]) => {
        setOn(e.isIntersecting)
        if (e.isIntersecting) setSeen(true)
      },
      { rootMargin: '300px' },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  return [ref, on, seen] as const
}

function Frame({ children, className, dpr = [1, 1.75], post = true }: { children: ReactNode; className?: string; dpr?: [number, number]; post?: boolean }) {
  const [ref, on, seen] = useOnScreen<HTMLDivElement>()
  // Start with a modest pixel ratio and let the performance monitor raise or lower it.
  const [ratio, setRatio] = useState(Math.min(dpr[1], 1.25))
  // Shaders are compiled in parallel before the first frame, then the view fades in.
  const [warm, setWarm] = useState(false)
  const onWarm = useCallback(() => setWarm(true), [])
  return (
    <div ref={ref} className={className}>
      {/* a view is only created when it first comes near the screen, then kept */}
      {seen && (
      <Canvas
        // PCF explicitly: three r187 swaps PCFSoft for PCF on the first frame, which would invalidate every precompiled shader
        shadows="percentage"
        dpr={[dpr[0], ratio]}
        resize={{ offsetSize: true }}
        frameloop={on && warm ? 'always' : 'never'}
        style={{ opacity: warm ? 1 : 0, transition: 'opacity 420ms ease-out' }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        onCreated={(st) => {
          // Checking shader logs makes the browser wait for every compile; only worth it while developing.
          st.gl.debug.checkShaderErrors = import.meta.env.DEV
          if (import.meta.env.DEV) ((window as unknown as { __r3f?: unknown[] }).__r3f ??= []).push(st)
        }}
      >
        <PerformanceMonitor
          bounds={() => [45, 58]}
          flipflops={4}
          onIncline={() => setRatio((r) => Math.min(dpr[1], r + 0.25))}
          onDecline={() => setRatio((r) => Math.max(0.75, r - 0.25))}
        />
        <Warmup onReady={onWarm} post={post} />
        {children}
      </Canvas>
      )}
    </div>
  )
}

/**
 * Compile every material in the scene with KHR_parallel_shader_compile before the first frame.
 * Without this, three compiles each program synchronously on first render, which froze the
 * page for seconds on the cockpit and landing views.
 */
function Warmup({ onReady, post }: { onReady: () => void; post: boolean }) {
  const done = useRef(false)
  const get = useThree((st) => st.get)
  useEffect(() => {
    let live = true
    const finish = () => {
      if (!live || done.current) return
      done.current = true
      performance.mark('view:ready')
      onReady()
    }
    // Wait for the sky, textures, models and satellite to land: each one changes shader defines,
    // so compiling before they arrive would only compile everything twice.
    let raf = 0
    const t0 = performance.now()
    let settle = 4
    const tick = () => {
      if (!live) return
      const busy = useProgress.getState().active || satellitePending() > 0
      if (busy && performance.now() - t0 < 5000) {
        settle = 4
        raf = requestAnimationFrame(tick)
        return
      }
      // a few more frames so the state updates and effects that apply the new textures have run
      if (settle-- > 0) {
        raf = requestAnimationFrame(tick)
        return
      }
      raf = requestAnimationFrame(() => {
        const { gl, scene, camera } = get()
        performance.mark('view:compile')
        // A view drawn through post-processing renders into a linear buffer, not the screen, and
        // three keys its programs on that: compile against the same kind of target.
        const rt = post ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }) : null
        const prev = gl.getRenderTarget()
        const passes = passScene(scene.userData.composer, scene)
        gl.setRenderTarget(rt)
        const jobs = [gl.compileAsync(scene, camera)]
        // the post-processing passes draw both into buffers and, for the last one, to the screen
        if (passes) jobs.push(gl.compileAsync(passes, camera))
        gl.setRenderTarget(null)
        if (passes) jobs.push(gl.compileAsync(passes, camera))
        gl.setRenderTarget(prev)
        Promise.all(jobs)
          .then(finish, finish)
          .finally(() => {
            rt?.dispose()
            passes?.userData.geometry.dispose()
          })
      })
    }
    raf = requestAnimationFrame(() => requestAnimationFrame(tick))
    const cap = setTimeout(finish, 7000)
    return () => {
      live = false
      cancelAnimationFrame(raf)
      clearTimeout(cap)
    }
  }, [onReady, get, post])
  return null
}

/** Every shader material reachable from the composer, each on a full-screen triangle, so they can be compiled ahead. */
function passScene(composer: unknown, main: THREE.Scene): THREE.Scene | null {
  if (!composer) return null
  const found = new Set<THREE.ShaderMaterial>()
  const seen = new Set<unknown>()
  const walk = (o: unknown, depth: number) => {
    if (!o || typeof o !== 'object' || seen.has(o) || depth > 6) return
    seen.add(o)
    const x = o as Record<string, unknown> & { isShaderMaterial?: boolean; isWebGLRenderer?: boolean; isTexture?: boolean; isBufferGeometry?: boolean; isWebGLRenderTarget?: boolean }
    if (o === main || x.isWebGLRenderer || x.isTexture || x.isBufferGeometry || x.isWebGLRenderTarget) return
    if (x.isShaderMaterial) {
      found.add(o as THREE.ShaderMaterial)
      return
    }
    for (const v of Array.isArray(o) ? o : o instanceof Map ? [...o.values()] : Object.values(x)) walk(v, depth + 1)
  }
  walk(composer, 0)
  if (found.size === 0) return null
  const scene = new THREE.Scene()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))
  for (const m of found) {
    const mesh = new THREE.Mesh(geometry, m)
    mesh.frustumCulled = false
    scene.add(mesh)
  }
  scene.userData.geometry = geometry
  return scene
}

/** An effect composer the warm-up can find, so its pass shaders are compiled with the scene. */
function Composer({ children }: { children: ReactElement | ReactElement[] }) {
  const scene = useThree((st) => st.scene)
  return (
    <EffectComposer
      ref={(c) => {
        scene.userData.composer = c ?? undefined
      }}
      multisampling={0}
      enableNormalPass={false}
    >
      {children}
    </EffectComposer>
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

/** The place the views centre on: the scenario's focus (the bus stop, in the night story). */
export function busFocus(world: World): [number, number] {
  return focusPoint(world)
}

function Post() {
  return (
    <Composer>
      <N8AO aoRadius={6} distanceFalloff={0.6} intensity={2.4} halfRes color="#1d1a16" />
      <Bloom luminanceThreshold={1.1} intensity={0.35} mipmapBlur />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </Composer>
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

import { useTwinCam } from '../world/twinCam'
import { shotAt, useFilm } from '../world/film'

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
const mix = (a: number, b: number, k: number) => a + (b - a) * k

/** Camera for each film-mode shot at scenario second t: [position, target]. */
function filmCamera(world: World, t: number): [number, number, number, number, number, number] {
  const { shot, k } = shotAt(t, world.scenario.shots)
  const e = ease(k)
  const P = (s: number, o = 0) => world.path.at(world.sStart + s, o)
  const orbit = (cx: number, cz: number, ang: number, r: number, h: number, ty = 0): [number, number, number, number, number, number] => [
    cx + Math.sin(ang) * r,
    h,
    cz + Math.cos(ang) * r,
    cx,
    ty,
    cz,
  ]
  const f = busFocus(world)
  const cam = shot.cam
  switch (cam.type) {
    case 'establish':
      return orbit(f[0] + 40, f[1] - 40, -0.75 + e * 0.32, mix(980, 640, e), mix(560, 380, e))
    case 'orbit': {
      const d = P(cam.s, cam.off ?? 0)
      const [r0, r1] = cam.r ?? [96, 64]
      const [h0, h1] = cam.h ?? [46, 24]
      return orbit(d.x, d.z, d.heading + 2.1 - e * 0.9, mix(r0, r1, e), mix(h0, h1, e), 1)
    }
    case 'crane': {
      const b = P(cam.s, cam.off ?? 0)
      return orbit(b.x, b.z, b.heading + 2.6 + e * 0.5, mix(60, 120, e), mix(12, 95, e), 1)
    }
    case 'chase': {
      const ego = sampleAgents(world, t).find((a) => a.id === 'ego')!
      const fx = Math.sin(ego.heading)
      const fz = Math.cos(ego.heading)
      const back = mix(52, 38, e)
      return [ego.x - fx * back + fz * 9, mix(20, 13, e), ego.z - fz * back - fx * 9, ego.x + fx * 55, 0, ego.z + fz * 55]
    }
    case 'top': {
      const c = cam.s !== undefined ? P(cam.s) : { x: f[0], z: f[1] }
      return orbit(c.x, c.z, 0.2 + e * 0.5, mix(60, 140, e), mix(720, 300, e))
    }
    default:
      return orbit(f[0] + 40, f[1] - 40, 0.7 + e * 0.6, mix(260, 1150, e), mix(150, 720, e))
  }
}

function TwinCamera({ world }: { world: World }) {
  const ref = useRef<CameraControls>(null)
  const view = useTwinCam((s) => s.view)
  const focus = useTwinCam((s) => s.focus)
  const bus = useMemo(() => busFocus(world), [world])
  const film = useFilm((s) => s.on)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.enabled = !film
    if (film) return
    if (focus) {
      void c.setLookAt(focus[0] - 140, 120, focus[1] + 150, focus[0], 0, focus[1], true)
      return
    }
    if (view === 'city') void c.setLookAt(bus[0] - 560, 430, bus[1] + 620, bus[0] + 40, 0, bus[1] - 40, true)
    if (view === 'corridor') void c.setLookAt(bus[0] - 210, 150, bus[1] + 230, bus[0] + 30, 0, bus[1] - 10, true)
    if (view === 'top') void c.setLookAt(bus[0], 900, bus[1] + 1, bus[0], 0, bus[1], true)
  }, [view, focus, bus, film])
  useFrame(() => {
    const c = ref.current
    if (!c) return
    // development only: lets visual checks point the camera anywhere from the console
    if (import.meta.env.DEV) (window as unknown as { __twin?: unknown }).__twin = { controls: c, world }
    if (film) {
      void c.setLookAt(...filmCamera(world, simTime()), false)
      return
    }
    if (view !== 'chase' || focus) return
    const ego = sampleAgents(world, simTime()).find((a) => a.id === 'ego')!
    const fx = Math.sin(ego.heading)
    const fz = Math.cos(ego.heading)
    void c.setLookAt(ego.x - fx * 70, 38, ego.z - fz * 70, ego.x + fx * 60, 0, ego.z + fz * 60, true)
  })
  return <CameraControls ref={ref} makeDefault minDistance={40} maxDistance={2200} maxPolarAngle={1.35} smoothTime={0.6} />
}

const LIDAR_BG = '#05080b'
/** Keep a flat background colour; the sky environment restores its own when its props change. */
function HoldBackground({ color }: { color: string }) {
  const scene = useThree((s) => s.scene)
  const c = useMemo(() => new THREE.Color(color), [color])
  useFrame(() => {
    if (scene.background !== c) scene.background = c
  })
  useEffect(() => () => void (scene.background = null), [scene])
  return null
}

export function TwinCanvas({ world, xray, isolines, labels, className }: { world: World; xray: boolean; isolines: boolean; labels: boolean; className?: string }) {
  const focus = useMemo(() => busFocus(world), [world])
  const { time, rain, heat, lidar } = useAtmos()
  return (
    <Frame className={className}>
      <fog attach="fog" args={lidar ? [LIDAR_BG, 1600, 3400] : [SUN[time].fog, time === 'day' ? 1300 : 900, time === 'day' ? 3600 : 2600]} />
      <DaySky time={time} background={!lidar} />
      {lidar && <HoldBackground color={LIDAR_BG} />}
      <PerspectiveCamera makeDefault fov={32} near={6} far={8000} position={[focus[0] - 560, 430, focus[1] + 620]} />
      <TwinCamera world={world} />
      <DayLight target={focus} time={time} />
      <CityScene world={world} xray={xray} isolines={isolines} labels={labels} mode={time === 'day' ? 'day' : 'night'} dusk={time === 'dusk'} rain={rain} wet={rain} heat={heat} photoreal={time === 'day'} lidar={lidar} />
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
    <Frame className={className} dpr={[1, 2]} post={false}>
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

function DriverCam({ world, who, lamps = true }: { world: World; who: string; lamps?: boolean }) {
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
  return <spotLight ref={lamp} angle={0.55} penumbra={0.8} distance={140} intensity={lamps ? 900 : 0} decay={1.6} color="#f3ead8" />
}

/** The road from the driver's seat, at the scenario's time of day: night with headlights, dusk, or day. */
export function DriverCanvas({ world, who = 'ego', className, xray = true, own = false }: { world: World; who?: string; className?: string; xray?: boolean; own?: boolean }) {
  // the driver's view is the scenario's own hour; rain follows the scenario or the live weather
  const time = world.scenario.time
  const rain = useAtmos((s) => s.rain) || world.scenario.rain
  const night = time === 'night'
  const focus = useMemo(() => busFocus(world), [world])
  return (
    <Frame className={className}>
      {night ? (
        <>
          <color attach="background" args={['#0a0f15']} />
          <fog attach="fog" args={['#0d131a', 40, 520]} />
          <Suspense fallback={null}>
            <Environment files="/assets/hdri/night.hdr" environmentIntensity={0.35} />
          </Suspense>
          <hemisphereLight args={['#4d5f73', '#120f0c', 0.55]} />
          <directionalLight position={[200, 300, 100]} intensity={0.12} color="#9fb2bb" />
        </>
      ) : (
        <>
          <fog attach="fog" args={[SUN[time].fog, time === 'day' ? 160 : 90, time === 'day' ? 1100 : 700]} />
          <DaySky time={time} />
          <DayLight target={focus} time={time} />
        </>
      )}
      <PerspectiveCamera makeDefault fov={58} near={0.3} far={night ? 900 : 2400} />
      <DriverCam world={world} who={who} lamps={time !== 'day'} />
      <CityScene world={world} mode={time === 'day' ? 'day' : 'night'} dusk={time === 'dusk'} rain={rain} wet={rain} xray={xray && !own} own={own} isolines={false} labels={false} waveFrom={who} fans={false} driver photoreal={false} />
      <Composer>
        <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={1.15} mipmapBlur />
      </Composer>
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
      const p = world.path.at(world.focusS + ds, off)
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

export function StoryCanvas({ world, xray, labels = true, className }: { world: World; xray: boolean; labels?: boolean; className?: string }) {
  return (
    <Frame className={className}>
      <fog attach="fog" args={['#d6dde0', 1100, 3400]} />
      <DaySky />
      <PerspectiveCamera makeDefault fov={34} near={0.5} far={8000} />
      <StoryCamera world={world} />
      <DayLight target={busFocus(world)} />
      <CityScene world={world} xray={xray} labels={labels} />
      <Post />
    </Frame>
  )
}

// ---------- In-dash navigation: the city behind and above your car, the route glowing ahead ----------

function NavCam({ world }: { world: World }) {
  const { camera } = useThree()
  const look = useRef(new THREE.Vector3())
  const pos = useRef(new THREE.Vector3())
  const first = useRef(true)
  useFrame(() => {
    const ego = sampleAgents(world, simTime()).find((a) => a.id === 'ego')!
    const fx = Math.sin(ego.heading)
    const fz = Math.cos(ego.heading)
    const wantPos = new THREE.Vector3(ego.x - fx * 150, 120, ego.z - fz * 150)
    const wantLook = new THREE.Vector3(ego.x + fx * 90, 0, ego.z + fz * 90)
    if (first.current) {
      pos.current.copy(wantPos)
      look.current.copy(wantLook)
      first.current = false
    }
    // a heavy, smooth follow: navigation cameras never jerk
    pos.current.lerp(wantPos, 0.04)
    look.current.lerp(wantLook, 0.06)
    camera.position.copy(pos.current)
    camera.lookAt(look.current)
  })
  return null
}

/** The route ahead as a glowing ribbon: bright in front of your car, faint behind, with a slow flow. */
function RouteRibbon({ world }: { world: World }) {
  const { geometry, material } = useMemo(() => {
    const pos: number[] = []
    const sAttr: number[] = []
    const side: number[] = []
    const from = world.sStart - 40
    const to = Math.min(world.path.length, world.sStart + 900)
    for (let s = from; s < to; s += 2) {
      for (const k of [-1, 1]) {
        const p = world.path.at(s, k * 1.6)
        pos.push(p.x, 0.3, p.z)
        sAttr.push(s)
        side.push(k)
      }
    }
    const idx: number[] = []
    for (let i = 0; i < pos.length / 6 - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('s', new THREE.Float32BufferAttribute(sAttr, 1))
    g.setAttribute('side', new THREE.Float32BufferAttribute(side, 1))
    g.setIndex(idx)
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      // main roads and lane paint are pulled toward the camera to avoid flicker; pull further
      polygonOffset: true,
      polygonOffsetFactor: -12,
      polygonOffsetUnits: -12,
      uniforms: { uEgo: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `attribute float s; attribute float side; varying float vS; varying float vSide;
        void main() { vS = s; vSide = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uEgo; uniform float uTime; varying float vS; varying float vSide;
        void main() {
          float ahead = vS - uEgo;
          float a = ahead < 0.0 ? 0.12 : mix(1.0, 0.35, clamp(ahead / 700.0, 0.0, 1.0));
          float edge = smoothstep(1.0, 0.55, abs(vSide));
          float flow = 0.75 + 0.25 * sin(ahead * 0.12 - uTime * 4.0);
          vec3 col = vec3(0.29, 0.64, 1.0) * (0.6 + 0.8 * edge) * flow;
          gl_FragColor = vec4(col * a, 1.0);
        }`,
    })
    return { geometry: g, material: m }
  }, [world])
  useFrame((st) => {
    material.uniforms.uEgo.value = world.egoS[Math.min(world.egoS.length - 1, Math.round(simTime() / 0.05))]
    material.uniforms.uTime.value = st.clock.elapsedTime
  })
  return <mesh geometry={geometry} material={material} renderOrder={6} />
}

export function NavCanvas({ world, className }: { world: World; className?: string }) {
  const { time, rain } = useAtmos()
  return (
    <Frame className={className}>
      <color attach="background" args={['#06090c']} />
      <fog attach="fog" args={['#06090c', 260, 900]} />
      <PerspectiveCamera makeDefault fov={42} near={2} far={1400} />
      <NavCam world={world} />
      <Suspense fallback={null}>
        <Environment files="/assets/hdri/night.hdr" environmentIntensity={0.3} />
      </Suspense>
      <hemisphereLight args={['#5d7085', '#0b0c0d', 0.75]} />
      <directionalLight position={[200, 400, 100]} intensity={0.35} color="#b6c6d6" />
      <CityScene world={world} mode="night" dusk={time === 'dusk'} rain={rain && false} xray={false} isolines={false} labels={false} fans={false} photoreal={false} />
      <RouteRibbon world={world} />
      <Composer>
        <Bloom luminanceThreshold={0.7} intensity={0.9} mipmapBlur />
      </Composer>
    </Frame>
  )
}
