import * as THREE from 'three'

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), 72.0);
    gl_Position = projectionMatrix * mv;
  }
`
const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * 1.4, a);
  }
`

/**
 * One pooled Points object drives every particle effect (sparks, dust, trails, explosions, pickups).
 * Fixed-size ring buffer: emitting never allocates, dead particles just have alpha 0.
 */
export class ParticleManager {
  constructor(scene, capacity = 2500) {
    this.capacity = capacity
    this.next = 0
    this.active = 0

    this.pos = new Float32Array(capacity * 3)
    this.vel = new Float32Array(capacity * 3)
    this.baseColor = new Float32Array(capacity * 3)
    this.colorOut = new Float32Array(capacity * 3)
    this.size = new Float32Array(capacity)
    this.baseSize = new Float32Array(capacity)
    this.alpha = new Float32Array(capacity)
    this.life = new Float32Array(capacity)
    this.maxLife = new Float32Array(capacity)
    this.gravity = new Float32Array(capacity)
    this.drag = new Float32Array(capacity)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colorOut, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage))
    this.geometry = geo

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.points = new THREE.Points(geo, this.material)
    this.points.frustumCulled = false
    scene.add(this.points)

    this._c = new THREE.Color()
  }

  /** Keeps particle size consistent across resolutions / FOV. */
  setViewport(height, fovDeg) {
    this.material.uniforms.uScale.value = height / (2 * Math.tan((fovDeg * Math.PI) / 360))
  }

  /**
   * Radial burst. opts: color, speed, speedJitter, life, size, gravity, drag,
   * dx/dy/dz + bias (0..1) to push particles along a direction (e.g. surface normal).
   */
  emit(x, y, z, count, opts = {}) {
    const {
      color = 0x00f0ff, speed = 5, speedJitter = 0.6, life = 0.45, size = 0.2,
      gravity = 9, drag = 1.5, dx = 0, dy = 1, dz = 0, bias = 0,
    } = opts
    this._c.setHex(color)
    for (let n = 0; n < count; n++) {
      const i = this.next
      this.next = (this.next + 1) % this.capacity
      // random unit vector
      let rx = Math.random() * 2 - 1, ry = Math.random() * 2 - 1, rz = Math.random() * 2 - 1
      const l = Math.hypot(rx, ry, rz) || 1
      rx /= l; ry /= l; rz /= l
      rx += dx * bias * 2; ry += dy * bias * 2; rz += dz * bias * 2
      const s = speed * (1 - speedJitter * Math.random())
      const i3 = i * 3
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z
      this.vel[i3] = rx * s; this.vel[i3 + 1] = ry * s; this.vel[i3 + 2] = rz * s
      this.baseColor[i3] = this._c.r; this.baseColor[i3 + 1] = this._c.g; this.baseColor[i3 + 2] = this._c.b
      this.baseSize[i] = size * (0.6 + Math.random() * 0.8)
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.4)
      this.gravity[i] = gravity
      this.drag[i] = drag
    }
  }

  update(dt) {
    const cap = this.capacity
    let active = 0
    for (let i = 0; i < cap; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0 }
        continue
      }
      active++
      this.life[i] -= dt
      const i3 = i * 3
      const k = Math.max(0, this.life[i] / this.maxLife[i])
      const damp = Math.max(0, 1 - this.drag[i] * dt)
      this.vel[i3] *= damp
      this.vel[i3 + 1] = this.vel[i3 + 1] * damp - this.gravity[i] * dt
      this.vel[i3 + 2] *= damp
      this.pos[i3] += this.vel[i3] * dt
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt
      if (this.pos[i3 + 1] < 0.05) { this.pos[i3 + 1] = 0.05; this.vel[i3 + 1] *= -0.3 }
      this.colorOut[i3] = this.baseColor[i3]
      this.colorOut[i3 + 1] = this.baseColor[i3 + 1]
      this.colorOut[i3 + 2] = this.baseColor[i3 + 2]
      this.alpha[i] = k
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * k)
    }
    // Upload only when something was/is alive (one extra frame after the last particle dies clears it)
    if (active > 0 || this.active > 0) {
      const g = this.geometry.attributes
      g.position.needsUpdate = g.aColor.needsUpdate = g.aSize.needsUpdate = g.aAlpha.needsUpdate = true
    }
    this.active = active
  }
}
