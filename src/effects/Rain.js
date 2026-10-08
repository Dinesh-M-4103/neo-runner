import * as THREE from 'three'
import { damp } from '../utils/MathUtils.js'

const MAX_DROPS = 9000
const BOX = { x: 70, y: 42, z: 70 }

/**
 * GPU rain: one LineSegments object, every drop animated in the vertex shader (zero CPU per drop).
 * The rain volume is a box that follows the camera; drops are fixed in world space (so they stream
 * past when you run). Intensity thins the visible fraction. Wind slants streaks against player movement.
 */
export class Rain {
  constructor(scene) {
    const base = new Float32Array(MAX_DROPS * 2 * 3)
    const rnd = new Float32Array(MAX_DROPS * 2)
    const end = new Float32Array(MAX_DROPS * 2)
    for (let i = 0; i < MAX_DROPS; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random(), r = Math.random()
      for (let k = 0; k < 2; k++) {
        const v = i * 2 + k
        base[v * 3] = x; base[v * 3 + 1] = y; base[v * 3 + 2] = z
        rnd[v] = r
        end[v] = k
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(base, 3)) // required by three; also our drop seed
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1))
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1))

    this.uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(BOX.x, BOX.y, BOX.z) },
      uFall: { value: 34 },
      uWind: { value: new THREE.Vector2(0, 0) },
      uIntensity: { value: 0.7 },
      uLen: { value: 1.3 },
      uColor: { value: new THREE.Color(0x9ec8ff) },
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aRand;
        attribute float aEnd;
        uniform float uTime, uFall, uLen, uIntensity;
        uniform vec3 uCenter, uBox;
        uniform vec2 uWind;
        varying float vAlpha;
        void main() {
          vec3 b = position;
          float speed = uFall * (0.85 + 0.3 * aRand);
          float y = fract(b.y - uTime * speed / uBox.y);
          vec3 world;
          world.x = uCenter.x + (fract((b.x * uBox.x - uCenter.x) / uBox.x) - 0.5) * uBox.x;
          world.z = uCenter.z + (fract((b.z * uBox.z - uCenter.z) / uBox.z) - 0.5) * uBox.z;
          world.y = y * uBox.y;
          vec3 dir = normalize(vec3(uWind.x, -1.0, uWind.y));
          world -= dir * uLen * aEnd; // tail trails above the head
          float visible = step(aRand, uIntensity);
          float dist = length(world.xz - uCenter.xz);
          float fade = 1.0 - smoothstep(22.0, 36.0, dist);
          vAlpha = visible * fade * mix(0.55, 0.04, aEnd);
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() { if (vAlpha < 0.01) discard; gl_FragColor = vec4(uColor, vAlpha); }`,
    })
    this.lines = new THREE.LineSegments(geo, mat)
    this.lines.frustumCulled = false
    this.lines.renderOrder = 5
    scene.add(this.lines)

    this.target = 0.7
    this.windX = 0
    this.windZ = 0
  }

  /** 0..1 (before quality scaling). */
  setTarget(v) {
    this.target = v
  }

  update(dt, camera, playerVX, playerVZ, qualityScale = 1) {
    const u = this.uniforms
    u.uTime.value += dt
    u.uCenter.value.copy(camera.position)
    u.uIntensity.value = damp(u.uIntensity.value, Math.min(1, this.target * qualityScale), 1.5, dt)
    this.windX = damp(this.windX, -playerVX * 0.07 + 0.08, 4, dt)
    this.windZ = damp(this.windZ, -playerVZ * 0.07, 4, dt)
    u.uWind.value.set(this.windX, this.windZ)
  }
}
