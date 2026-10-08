import * as THREE from 'three'

const POOL = 64
const LIFE = 3.2

/** Pooled enemy bolts. Hit the player (cylinder test) or the world (segment test). */
export class Projectiles {
  constructor(scene, collision, effects) {
    this.collision = collision
    this.effects = effects
    this.geo = new THREE.BoxGeometry(1, 1, 1)
    this.mats = new Map()
    this.items = []
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(this.geo, this._mat(0xffffff))
      mesh.visible = false
      mesh.frustumCulled = false
      scene.add(mesh)
      this.items.push({ mesh, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, damage: 0, color: 0, trail: 0 })
    }
    this.next = 0
    this.onHitPlayer = null // (damage) => void
  }

  _mat(color) {
    let m = this.mats.get(color)
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, toneMapped: false })
      this.mats.set(color, m)
    }
    return m
  }

  fire(x, y, z, dx, dy, dz, cfg) {
    // find a free slot (round-robin, steals the oldest if the pool is saturated)
    let it = null
    for (let n = 0; n < POOL; n++) {
      const c = this.items[(this.next + n) % POOL]
      if (!c.active) { it = c; this.next = (this.next + n + 1) % POOL; break }
    }
    if (!it) { it = this.items[this.next]; this.next = (this.next + 1) % POOL }
    const l = Math.hypot(dx, dy, dz) || 1
    it.x = x; it.y = y; it.z = z
    it.vx = (dx / l) * cfg.projectileSpeed
    it.vy = (dy / l) * cfg.projectileSpeed
    it.vz = (dz / l) * cfg.projectileSpeed
    it.life = LIFE
    it.damage = cfg.damage
    it.color = cfg.color
    it.active = true
    it.trail = 0
    it.size = cfg.projectileSize
    const m = it.mesh
    m.material = this._mat(cfg.color)
    m.scale.set(0.16 * cfg.projectileSize, 0.16 * cfg.projectileSize, 0.9 * cfg.projectileSize)
    m.position.set(x, y, z)
    m.lookAt(x + it.vx, y + it.vy, z + it.vz)
    m.visible = true
  }

  clear() {
    for (const it of this.items) {
      it.active = false
      it.mesh.visible = false
    }
  }

  deactivate(it) {
    it.active = false
    it.mesh.visible = false
  }

  update(dt, player) {
    const px = player.position.x, pz = player.position.z
    const canHit = !player.dashing
    for (let i = 0; i < POOL; i++) {
      const it = this.items[i]
      if (!it.active) continue
      it.life -= dt
      if (it.life <= 0) { this.deactivate(it); continue }

      const nx = it.x + it.vx * dt, ny = it.y + it.vy * dt, nz = it.z + it.vz * dt

      // world hit
      if (ny < 0.06 || this.collision.segmentHit(it.x, it.y, it.z, nx, ny, nz) < 1) {
        this.effects.hitSparks(nx, Math.max(0.1, ny), nz, it.vx, it.vy, it.vz, it.color)
        this.deactivate(it)
        continue
      }

      // player hit: vertical cylinder around the runner (generous so dodging has to be deliberate)
      if (canHit && ny > 0 && ny < 2.1) {
        const dx = nx - px, dz = nz - pz
        const r = 0.8 + 0.12 * it.size
        if (dx * dx + dz * dz < r * r) {
          this.effects.hitSparks(nx, ny, nz, it.vx, it.vy, it.vz, it.color)
          this.deactivate(it)
          if (this.onHitPlayer) this.onHitPlayer(it.damage, it.x, it.z)
          continue
        }
      }

      it.x = nx; it.y = ny; it.z = nz
      it.mesh.position.set(nx, ny, nz)
      it.trail -= dt
      if (it.trail <= 0) {
        it.trail = 0.05
        this.effects.particles.emit(nx, ny, nz, 1, { color: it.color, speed: 0.3, life: 0.3, size: 0.11 * it.size, gravity: 0, drag: 3 })
      }
    }
  }
}
