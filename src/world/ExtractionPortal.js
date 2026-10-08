import * as THREE from 'three'
import { CITY, PALETTE, PORTAL } from '../utils/Constants.js'
import { SeededRandom } from '../utils/MathUtils.js'
import { roadCoord } from './Road.js'

const RING_COLORS = [PALETTE.CYAN, PALETTE.MAGENTA, 0xffffff]

/**
 * The extraction portal: a vertical gate standing on a road intersection far from the start.
 * Visible from anywhere (light beam ignores fog), with animated rings, a swirling shader core,
 * rising particles and one dynamic light.
 */
export class ExtractionPortal {
  constructor(scene, seed, startPos, zones) {
    this.position = this._pickLocation(seed, startPos, zones)
    this.radius = PORTAL.RADIUS
    this.time = 0
    this.pulse = 1 // raised during the escape sequence

    const g = (this.group = new THREE.Group())
    g.position.set(this.position.x, 0, this.position.z)

    // swirling core disc
    this.coreMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPower: { value: 1 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uPower; varying vec2 vUv;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          if (r > 1.0) discard;
          float a = atan(p.y, p.x);
          float swirl = sin(a * 5.0 + r * 9.0 - uTime * 4.0) * 0.5 + 0.5;
          float swirl2 = sin(a * 3.0 - r * 14.0 + uTime * 5.0) * 0.5 + 0.5;
          float core = smoothstep(1.0, 0.0, r);
          vec3 col = mix(vec3(0.0, 0.9, 1.0), vec3(1.0, 0.15, 0.85), swirl2 * 0.8);
          col += vec3(1.0) * pow(core, 3.0) * 0.8;
          float alpha = (0.25 + 0.5 * swirl) * core + pow(core, 4.0) * 0.6 + smoothstep(0.85, 1.0, r) * 0.0;
          gl_FragColor = vec4(col * (0.8 + 0.4 * swirl), alpha * uPower);
        }`,
    })
    this.core = new THREE.Mesh(new THREE.CircleGeometry(3.5, 48), this.coreMat)
    this.core.position.y = 4.2
    g.add(this.core)

    // concentric rotating rings
    const ringMat = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false })
    this.rings = []
    const radii = [3.7, 3.3, 2.9]
    radii.forEach((r, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, i === 0 ? 0.16 : 0.08, 8, 64), ringMat(RING_COLORS[i]))
      ring.position.y = 4.2
      g.add(ring)
      this.rings.push(ring)
    })
    // chunky frame segments on the outer ring (so rotation reads)
    this.frame = new THREE.Group()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), ringMat(PALETTE.CYAN))
      seg.position.set(Math.cos(a) * 3.95, Math.sin(a) * 3.95, 0)
      seg.rotation.z = a
      this.frame.add(seg)
    }
    this.frame.position.y = 4.2
    g.add(this.frame)

    // ground glow
    this.groundMat = new THREE.MeshBasicMaterial({
      color: PALETTE.CYAN, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    })
    const ground = new THREE.Mesh(new THREE.RingGeometry(2.0, 6.5, 48).rotateX(-Math.PI / 2), this.groundMat)
    ground.position.y = 0.12
    g.add(ground)

    // light beam, visible through fog
    this.beamMat = new THREE.MeshBasicMaterial({
      color: PALETTE.CYAN, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide,
    })
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 260, 20, 1, true), this.beamMat)
    beam.position.y = 130
    g.add(beam)

    this.light = new THREE.PointLight(PALETTE.CYAN, 60, 55, 1.6)
    this.light.position.set(0, 4.5, 0)
    g.add(this.light)

    // orient the gate across the road (faces along Z by default)
    g.rotation.y = this.facingYaw
    scene.add(g)
  }

  _pickLocation(seed, start, zones) {
    const rng = new SeededRandom((seed ^ 0xbadc0de) >>> 0)
    this.facingYaw = 0
    for (let attempt = 0; attempt < 500; attempt++) {
      const i = rng.int(2, CITY.GRID - 2), j = rng.int(2, CITY.GRID - 2)
      const x = roadCoord(i), z = roadCoord(j)
      const d = Math.hypot(x - start.x, z - start.z)
      if (d < PORTAL.MIN_DIST || d > PORTAL.MAX_DIST) continue
      if (zones.list.some((q) => Math.hypot(q.x - x, q.z - z) < 40)) continue
      this.facingYaw = rng.chance(0.5) ? 0 : Math.PI / 2
      return { x, z }
    }
    // fallback (should not happen): somewhere far along +x
    return { x: roadCoord(CITY.GRID - 3), z: roadCoord(CITY.GRID / 2) }
  }

  distanceTo(x, z) {
    return Math.hypot(x - this.position.x, z - this.position.z)
  }

  reached(x, z) {
    return this.distanceTo(x, z) < this.radius + 0.5
  }

  /** `effects` is used for ambient particles; they're only emitted while the player is within range. */
  update(dt, effects, playerX, playerZ) {
    this.time += dt
    const t = this.time
    this.coreMat.uniforms.uTime.value = t
    this.coreMat.uniforms.uPower.value = this.pulse
    this.rings[0].rotation.z = t * 0.6
    this.rings[1].rotation.z = -t * 1.1
    this.rings[2].rotation.z = t * 1.8
    this.rings[1].scale.setScalar(1 + Math.sin(t * 2.5) * 0.03)
    this.frame.rotation.z = t * 0.6
    const glow = 0.24 + 0.1 * Math.sin(t * 3) * this.pulse
    this.groundMat.opacity = glow
    this.beamMat.opacity = 0.08 + 0.03 * Math.sin(t * 2) + (this.pulse - 1) * 0.1
    this.light.intensity = 55 + 20 * Math.sin(t * 4) * this.pulse

    if (this.distanceTo(playerX, playerZ) < 120) {
      // swirl particles rising off the ring
      const a = Math.random() * Math.PI * 2
      const r = 3.6
      const lx = Math.cos(a) * r, ly = 4.2 + Math.sin(a) * r
      const cos = Math.cos(this.facingYaw), sin = Math.sin(this.facingYaw)
      const wx = this.position.x + lx * cos
      const wz = this.position.z - lx * sin
      effects.particles.emit(wx, ly, wz, 1, {
        color: Math.random() < 0.5 ? PALETTE.CYAN : PALETTE.MAGENTA, speed: 1.1, life: 1.1, size: 0.28, gravity: -1.5, drag: 0.6,
      })
      if (Math.random() < 0.35) {
        effects.particles.emit(this.position.x + (Math.random() - 0.5) * 8, 0.2, this.position.z + (Math.random() - 0.5) * 8, 1, {
          color: PALETTE.CYAN, speed: 0.5, life: 1.4, size: 0.2, gravity: -3, drag: 0.5,
        })
      }
    }
  }
}
