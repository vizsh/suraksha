// Fetch OSM data for the demo corridor and convert it to local metres.
// Usage: node scripts/fetch-osm.mjs
// Output: public/data/corridor.json
import { writeFileSync, mkdirSync } from 'node:fs'

// Powai: IIT Bombay main gate, JVLR, Saki Vihar Road, Adi Shankaracharya Marg.
const BBOX = { s: 19.1140, w: 72.9020, n: 19.1300, e: 72.9175 }
const MIRRORS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
]
const b = `${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e}`
const QUERY = `[out:json][timeout:90];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|footway)$"](${b});
  way["building"](${b});
  node["highway"~"^(crossing|traffic_signals|bus_stop)$"](${b});
  node["amenity"~"^(school|college|hospital|clinic)$"](${b});
);
out body geom;`

async function overpass() {
  for (const url of MIRRORS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': 'suraksha-prototype/0.1', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(QUERY),
        })
        if (res.ok) return await res.json()
        console.warn(`${url} -> ${res.status}`)
      } catch (e) {
        console.warn(`${url} failed: ${e.message}`)
      }
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt))
    }
  }
  throw new Error('All Overpass mirrors failed')
}

const lat0 = (BBOX.s + BBOX.n) / 2
const lon0 = (BBOX.w + BBOX.e) / 2
const mPerLat = 110574
const mPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
// x = east, z = south (three.js ground plane, y up)
const proj = (lat, lon) => [+((lon - lon0) * mPerLon).toFixed(1), +(-(lat - lat0) * mPerLat).toFixed(1)]

function hash(n) {
  let x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const data = await overpass()
const roads = []
const buildings = []
const points = []

for (const el of data.elements) {
  const t = el.tags || {}
  if (el.type === 'way' && el.geometry) {
    const pts = el.geometry.map((g) => proj(g.lat, g.lon))
    if (t.building) {
      const levels = parseFloat(t['building:levels'])
      const h = Number.isFinite(levels) ? levels * 3.2 : 6 + Math.floor(hash(el.id) * 7) * 3.2
      buildings.push({ id: el.id, h: +h.toFixed(1), pts })
    } else if (t.highway) {
      roads.push({
        id: el.id,
        kind: t.highway,
        name: t.name || null,
        lanes: t.lanes ? parseInt(t.lanes, 10) : null,
        oneway: t.oneway === 'yes',
        sidewalk: t.sidewalk || null,
        pts,
      })
    }
  } else if (el.type === 'node') {
    points.push({ id: el.id, kind: t.highway || t.amenity, name: t.name || null, p: proj(el.lat, el.lon) })
  }
}

const out = {
  source: 'OpenStreetMap contributors (ODbL), fetched ' + new Date().toISOString(),
  bbox: BBOX,
  origin: { lat: lat0, lon: lon0 },
  size: [Math.round((BBOX.e - BBOX.w) * mPerLon), Math.round((BBOX.n - BBOX.s) * mPerLat)],
  roads,
  buildings,
  points,
}
mkdirSync('public/data', { recursive: true })
writeFileSync('public/data/corridor.json', JSON.stringify(out))
console.log(`roads ${roads.length}, buildings ${buildings.length}, points ${points.length}, size ${out.size.join('x')} m`)
