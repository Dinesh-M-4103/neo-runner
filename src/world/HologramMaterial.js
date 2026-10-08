import * as THREE from 'three'

/**
 * Instanced hologram shader for rooftop billboards: scrolling scanlines, flicker, bright edges.
 * Colour comes from the per-instance colour. Shares fog with the scene.
 * A single shared `uTime` uniform is advanced from the game loop.
 */
export function createHologramMaterial() {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWPos;
      varying vec3 vLocal;
      varying vec3 vTint;
      void main() {
        vTint = instanceColor;
        vLocal = position;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWPos;
      varying vec3 vLocal;
      varying vec3 vTint;
      #include <fog_pars_fragment>
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        float scan = 0.55 + 0.45 * sin(vWPos.y * 9.0 - uTime * 3.0);
        float band = smoothstep(0.96, 1.0, fract(vWPos.y * 0.08 - uTime * 0.25)); // slow sweeping bar
        float flick = 0.82 + 0.18 * hash(floor(uTime * 12.0) + floor(vWPos.x + vWPos.z));
        // bright rim on the unit box edges
        vec3 e = abs(vLocal) * 2.0;
        float edge = step(0.94, max(e.x, max(e.z, 0.0))) + step(0.96, e.y);
        float a = (0.28 * scan + 0.55 * band + 0.5 * min(edge, 1.0)) * flick;
        gl_FragColor = vec4(vTint * (0.7 + band), a);
        #include <fog_fragment>
      }`,
  })
  return mat
}
