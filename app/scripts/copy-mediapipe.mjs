// Serve runtime decoders from our own origin (no CDN dependency at demo time):
// MediaPipe's WASM for face landmarks, and three.js's Draco decoder for Google 3D tiles.
import { cpSync, existsSync, mkdirSync } from 'node:fs'

for (const [from, to] of [
  ['node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe/wasm'],
  ['node_modules/three/examples/jsm/libs/draco/gltf', 'public/draco'],
]) {
  if (!existsSync(from)) {
    console.warn('copy-runtime: missing', from)
    continue
  }
  mkdirSync(to, { recursive: true })
  cpSync(from, to, { recursive: true })
  console.log('copy-runtime:', from, '->', to)
}
