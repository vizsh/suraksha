// Download the CC0 / CC-BY assets the prototype uses, from their official sources.
// Usage: node scripts/fetch-assets.mjs   (skips files that already exist)
//   Poly Haven (CC0): https://polyhaven.com  - HDRIs and PBR textures, via api.polyhaven.com
//   CesiumMan (CC-BY 4.0, Cesium): KhronosGroup/glTF-Sample-Assets
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const OUT = 'public/assets'
const HDRIS = { day: 'kloofendal_43d_clear_puresky', night: 'rogland_clear_night' }
const TEXTURES = {
  asphalt: 'asphalt_02',
  pavers: 'patterned_concrete_pavers',
  concrete: 'concrete_pavement',
  metal: 'metal_plate',
}
const MAPS = { Diffuse: 'diff', nor_gl: 'nor', arm: 'arm' }

async function save(url, path) {
  if (existsSync(path)) return console.log('have', path)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  console.log('got ', path)
}
async function files(asset) {
  const res = await fetch(`https://api.polyhaven.com/files/${asset}`)
  if (!res.ok) throw new Error(`polyhaven ${asset} -> ${res.status}`)
  return res.json()
}

mkdirSync(`${OUT}/hdri`, { recursive: true })
mkdirSync(`${OUT}/tex`, { recursive: true })
mkdirSync(`${OUT}/models`, { recursive: true })

for (const [name, asset] of Object.entries(HDRIS)) {
  const f = await files(asset)
  await save(f.hdri['2k'].hdr.url, `${OUT}/hdri/${name}.hdr`)
}
for (const [name, asset] of Object.entries(TEXTURES)) {
  const f = await files(asset)
  for (const [key, short] of Object.entries(MAPS)) await save(f[key]['1k'].jpg.url, `${OUT}/tex/${name}_${short}.jpg`)
}
await save(
  'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CesiumMan/glTF-Binary/CesiumMan.glb',
  `${OUT}/models/walker.glb`,
)
writeFileSync(
  `${OUT}/CREDITS.txt`,
  [
    'HDRIs and textures: Poly Haven (polyhaven.com), CC0.',
    `  ${Object.values(HDRIS).join(', ')}, ${Object.values(TEXTURES).join(', ')}`,
    'Walking figure: CesiumMan, Cesium, CC-BY 4.0, via KhronosGroup/glTF-Sample-Assets.',
    'Satellite imagery (runtime): Esri World Imagery, Esri and its data providers.',
    'Photoreal 3D (runtime, optional): Google Photorealistic 3D Tiles, Map data Google.',
  ].join('\n') + '\n',
)
console.log('done')
