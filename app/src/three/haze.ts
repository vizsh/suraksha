// Mumbai haze. Patches three.js's shared fog code once, for every material:
// on top of the scene's linear fog, a humid haze that builds with distance and thins with height,
// so the ground fades into the air while tall towers stand out above it.
// Applied only to the wide city views (fog that starts beyond 300 m); close fog, such as the
// cockpit's at night, is left as it was.
import * as THREE from 'three'

const C = THREE.ShaderChunk as unknown as Record<string, string>
if (!C.fog_vertex.includes('vFogHeight')) {
  C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogHeight;
#endif`
  // world height from the view-space position: the view matrix is a rotation and a translation
  C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogHeight = ((mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix)).y;
#endif`
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogHeight;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`
  C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    if ( fogNear > 300.0 ) {
      float haze = ( 1.0 - exp( - vFogDepth / ( fogFar * 0.6 ) ) ) * exp( - max( vFogHeight, 0.0 ) / 70.0 );
      fogFactor = max( fogFactor, haze * 0.5 );
    }
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`
}

export {}
