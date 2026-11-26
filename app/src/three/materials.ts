// Shaders shared by every scene.
// 1. The sensor wave: a band that grows from a connected car. Inside it, solid surfaces dissolve
//    into a screen-door stipple, so threats behind buildings show.
// 2. Facades: floors and window bays generated from world position, glazing that reflects the sky,
//    and a scatter of lit windows at night.
import * as THREE from 'three'

export interface WaveUniforms {
  uCenter: { value: THREE.Vector2 }
  uRadius: { value: number }
  uOn: { value: number }
  uStipple: { value: number }
  uRing: { value: THREE.Color }
  uNight: { value: number }
}

export function makeWaveUniforms(stipple = 1): WaveUniforms {
  return {
    uCenter: { value: new THREE.Vector2() },
    uRadius: { value: 0 },
    uOn: { value: 0 },
    uStipple: { value: stipple },
    uRing: { value: new THREE.Color('#1f6fb2') },
    uNight: { value: 0 },
  }
}

const HEAD = /* glsl */ `
uniform vec2 uCenter;
uniform float uRadius;
uniform float uOn;
uniform float uStipple;
uniform vec3 uRing;
uniform float uNight;
varying vec3 vWPos;
varying vec3 vWNormal;
varying float vSeed;
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[idx] + 0.5) / 16.0;
}
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`

/** Patch a standard material for the sensor wave, and optionally for building facades. */
export function withWave<T extends THREE.MeshStandardMaterial>(m: T, u: WaveUniforms, opts: { facade?: boolean } = {}): T {
  const facade = !!opts.facade
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\nvarying float vSeed;\n' + (facade ? 'attribute float seed;' : ''))
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        vWPos = (modelMatrix * wp).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);
        vSeed = ${facade ? 'seed' : '0.0'};`,
      )
    let frag = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HEAD)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float dC = distance(vWPos.xz, uCenter);
        float inside = uOn * uStipple * smoothstep(uRadius - 190.0, uRadius - 110.0, dC) * (1.0 - smoothstep(uRadius - 12.0, uRadius, dC));
        if (inside > 0.01 && bayer4(gl_FragCoord.xy) < inside * 0.93) discard;
        float glass = 0.0;
        float lit = 0.0;`,
      )
    if (facade) {
      frag = frag
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float wall = 1.0 - step(0.5, abs(vWNormal.y));
          if (wall > 0.5) {
            float along = abs(vWNormal.x) > abs(vWNormal.z) ? vWPos.z : vWPos.x;
            float floorY = vWPos.y / 3.2;
            float bay = along / (2.6 + vSeed * 1.2);
            vec2 cell = vec2(floor(bay), floor(floorY));
            float fy = fract(floorY);
            float fx = fract(bay);
            float ground = step(vWPos.y, 3.0);
            glass = step(0.32, fy) * step(fy, 0.86) * step(0.16, fx) * step(fx, 0.84) * (1.0 - ground);
            float slab = smoothstep(0.0, 0.06, fy) * (1.0 - smoothstep(0.94, 1.0, fy));
            diffuseColor.rgb *= mix(0.9, 1.0, slab);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55, ground * 0.6);
            vec3 pane = mix(vec3(0.16, 0.2, 0.23), vec3(0.32, 0.37, 0.4), h21(cell + vSeed));
            diffuseColor.rgb = mix(diffuseColor.rgb, pane, glass);
            lit = glass * step(0.62, h21(cell * 1.7 + vSeed * 9.0)) * uNight;
          } else {
            diffuseColor.rgb *= 0.78 + 0.1 * h21(floor(vWPos.xz / 3.0));
          }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.08, glass);`,
        )
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
          metalnessFactor = mix(metalnessFactor, 0.6, glass);`,
        )
    }
    frag = frag.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float band = uOn * (1.0 - smoothstep(0.0, 5.0, abs(dC - uRadius)));
      totalEmissiveRadiance += uRing * band * 1.4;
      totalEmissiveRadiance += vec3(1.0, 0.78, 0.48) * lit * 1.6;`,
    )
    sh.fragmentShader = frag
  }
  m.customProgramCacheKey = () => `wave-${u.uStipple.value}-${facade}`
  return m
}

/** Building edge drawing: faint everywhere, firm inside the revealed disc. */
export function makeEdgeMaterial(u: WaveUniforms, color: string, rest = 0.1) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...u, uColor: { value: new THREE.Color(color) }, uRest: { value: rest } },
    vertexShader: /* glsl */ `
      varying vec3 vWPos;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWPos = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uCenter; uniform float uRadius; uniform float uOn;
      uniform vec3 uColor; uniform float uRest;
      varying vec3 vWPos;
      void main() {
        float d = distance(vWPos.xz, uCenter);
        float inside = uOn * smoothstep(uRadius - 190.0, uRadius - 110.0, d) * (1.0 - smoothstep(uRadius - 12.0, uRadius, d));
        gl_FragColor = vec4(uColor, mix(uRest, 0.78, inside));
      }`,
  })
}
