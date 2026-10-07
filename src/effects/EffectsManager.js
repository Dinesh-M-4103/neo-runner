import * as THREE from 'three'
import { PALETTE } from '../utils/Constants.js'
import { ParticleManager } from './ParticleManager.js'

const TRACER_POOL = 24
const TRACER_LIFE = 0.09

function makeFlashTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.3, 'rgba(120,250,255,0.8)')
  grad.addColorStop(1, 'rgba(0,240,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

/** Gameplay-facing effect API: tracers, muzzle flash, sparks, dash burst... All pooled. */
export class EffectsManager {
  constructor(scene) {
    this.scene = scene
    this.particles = new ParticleManager(scene)

    // Tracer pool: stretched additive boxes, reused round-robin
    const geo = new THREE.BoxGeometry(1, 1, 1)
    this.tracers = []
    for (let i = 0; i < TRACER_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: PALETTE.CYAN, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      mesh.frustumCulled = false
      scene.add(mesh)
      this.tracers.push({ mesh, life: 0 })
    }
    this.nextTracer = 0

    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeFlashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false,
      })
    )
    this.flash.visible = false
    scene.add(this.flash)
    this.flashLife = 0

    this.dustTimer = 0

    // Explosion fireballs: pooled additive sprites that expand and fade
    const tex = this.flash.material.map
    this.fireballs = []
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, color: 0xff7a30, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })
      )
      sp.visible = false
      scene.add(sp)
      this.fireballs.push({ sprite: sp, life: 0, max: 0.4, size: 4 })
    }
    this.nextFireball = 0
  }

  tracer(fx, fy, fz, tx, ty, tz, color = PALETTE.CYAN) {
    const t = this.tracers[this.nextTracer]
    this.nextTracer = (this.nextTracer + 1) % TRACER_POOL
    const len = Math.hypot(tx - fx, ty - fy, tz - fz)
    if (len < 0.01) return
    const m = t.mesh
    m.position.set((fx + tx) / 2, (fy + ty) / 2, (fz + tz) / 2)
    m.lookAt(tx, ty, tz)
    m.scale.set(0.045, 0.045, len)
    m.material.color.setHex(color)
    m.material.opacity = 1
    m.visible = true
    t.life = TRACER_LIFE
  }

  muzzleFlash(x, y, z) {
    this.flash.position.set(x, y, z)
    const s = 0.9 + Math.random() * 0.5
    this.flash.scale.set(s, s, s)
    this.flash.visible = true
    this.flashLife = 0.05
    this.particles.emit(x, y, z, 4, { color: PALETTE.CYAN, speed: 4, life: 0.18, size: 0.14, gravity: 0 })
  }

  hitSparks(x, y, z, dirX, dirY, dirZ, color = PALETTE.CYAN) {
    // spray back toward the shooter
    this.particles.emit(x, y, z, 9, {
      color, speed: 6, life: 0.4, size: 0.17, gravity: 12, dx: -dirX, dy: -dirY, dz: -dirZ, bias: 0.8,
    })
    this.particles.emit(x, y, z, 2, { color: 0xffffff, speed: 2, life: 0.15, size: 0.3, gravity: 0 })
  }

  explosion(x, y, z, scale = 1, color = 0xff7a30) {
    const pm = this.particles
    pm.emit(x, y, z, Math.round(34 * scale), { color, speed: 11 * scale, life: 0.75, size: 0.38, gravity: 5, drag: 1.2 })
    pm.emit(x, y, z, Math.round(16 * scale), { color: PALETTE.MAGENTA, speed: 8 * scale, life: 0.6, size: 0.3, gravity: 3, drag: 1.5 })
    pm.emit(x, y, z, 8, { color: 0xffffff, speed: 3, life: 0.25, size: 0.9 * scale, gravity: 0 })
    const f = this.fireballs[this.nextFireball]
    this.nextFireball = (this.nextFireball + 1) % this.fireballs.length
    f.sprite.position.set(x, y, z)
    f.sprite.material.color.setHex(color)
    f.size = 5 * scale
    f.life = f.max = 0.4
    f.sprite.visible = true
  }

  /** Burst at both ends of a dash + streak along the path. */
  dashBurst(x, z) {
    this.particles.emit(x, 1.0, z, 26, { color: PALETTE.CYAN, speed: 7, life: 0.45, size: 0.22, gravity: 2 })
    this.particles.emit(x, 0.3, z, 12, { color: PALETTE.MAGENTA, speed: 5, life: 0.4, size: 0.2, gravity: 2 })
  }

  dashTrail(x, z) {
    this.particles.emit(x, 0.9 + Math.random() * 0.6, z, 4, {
      color: Math.random() < 0.5 ? PALETTE.CYAN : PALETTE.MAGENTA, speed: 0.8, life: 0.5, size: 0.3, gravity: 0, drag: 2,
    })
  }

  /** Dust/energy puffs under the runner's feet while sprinting. */
  sprintDust(dt, x, z) {
    this.dustTimer -= dt
    if (this.dustTimer > 0) return
    this.dustTimer = 0.05
    this.particles.emit(x, 0.15, z, 1, { color: PALETTE.BLUE, speed: 1.2, life: 0.4, size: 0.22, gravity: -0.5, drag: 2 })
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue
      t.life -= dt
      if (t.life <= 0) t.mesh.visible = false
      else t.mesh.material.opacity = t.life / TRACER_LIFE
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt
      if (this.flashLife <= 0) this.flash.visible = false
    }
    for (const f of this.fireballs) {
      if (f.life <= 0) continue
      f.life -= dt
      if (f.life <= 0) { f.sprite.visible = false; continue }
      const k = 1 - f.life / f.max
      f.sprite.scale.setScalar(f.size * (0.35 + k))
      f.sprite.material.opacity = 1 - k
    }
    this.particles.update(dt)
  }

  setViewport(height, fov) {
    this.particles.setViewport(height, fov)
  }
}
