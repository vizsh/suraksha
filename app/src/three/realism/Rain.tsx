// Monsoon rain: a few thousand streaks in a box that travels with the camera, slanted by wind.
// One draw call; positions are wrapped on the GPU so the CPU does nothing per frame.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const N = 9000
const BOX = 140
const HEIGHT = 90

export function Rain({ night = false }: { night?: boolean }) {
  const { camera } = useThree()
  const mat = useRef<THREE.ShaderMaterial>(null)
  const geo = useMemo(() => {
    const pos = new Float32Array(N * 2 * 3)
    const seed = new Float32Array(N * 2)
    const end = new Float32Array(N * 2)
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * BOX
      const y = Math.random() * HEIGHT
      const z = (Math.random() - 0.5) * BOX
      const s = Math.random()
      for (let k = 0; k < 2; k++) {
        pos.set([x, y, z], (i * 2 + k) * 3)
        seed[i * 2 + k] = s
        end[i * 2 + k] = k
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
    g.setAttribute('tail', new THREE.BufferAttribute(end, 1))
    return g
  }, [])
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(night ? '#7f93a6' : '#c9d3da') } }),
    [night],
  )
  useFrame((_, dt) => {
    uniforms.uTime.value += dt
    uniforms.uCam.value.copy(camera.position)
  })
  return (
    <lineSegments geometry={geo} frustumCulled={false} renderOrder={60}>
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          attribute float seed; attribute float tail;
          uniform float uTime; uniform vec3 uCam;
          varying float vA;
          void main() {
            vec3 p = position;
            float speed = 24.0 + seed * 10.0;
            p.y = mod(p.y - uTime * speed, ${HEIGHT.toFixed(1)});
            // wrap the box around the camera
            p.x = mod(p.x - uCam.x + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)} + uCam.x;
            p.z = mod(p.z - uCam.z + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)} + uCam.z;
            p.y += max(0.0, uCam.y - ${(HEIGHT / 2).toFixed(1)});
            // streak: the tail trails up and against the wind
            p += tail * vec3(0.18, 0.9 + seed * 0.5, 0.06);
            vA = 0.25 + seed * 0.35;
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }`}
        fragmentShader={/* glsl */ `
          uniform vec3 uColor; varying float vA;
          void main() { gl_FragColor = vec4(uColor, vA); }`}
      />
    </lineSegments>
  )
}
