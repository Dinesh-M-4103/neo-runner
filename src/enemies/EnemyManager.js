import { DRONES } from '../utils/Constants.js'
import { Drone } from './Drone.js'
import { updateDrone } from './DroneAI.js'
import { Projectiles } from './Projectiles.js'

/**
 * Owns every drone (pre-built pools per type: nothing is created or destroyed during a run) and the
 * enemy projectiles. `all` is handed to the Weapon as its target list.
 */
export class EnemyManager {
  constructor(scene, { collision, effects }) {
    this.collision = collision
    this.effects = effects
    this.pools = {}
    this.all = []
    this.active = [] // reused array of currently active drones (no per-frame allocation)
    this.kills = 0
    this.killsByType = { scout: 0, combat: 0, heavy: 0 }

    for (const [type, cfg] of Object.entries(DRONES.TYPES)) {
      const pool = []
      for (let i = 0; i < cfg.pool; i++) {
        const drone = new Drone(type)
        drone.onDamaged = (d, amount, point) => this.onDamaged && this.onDamaged(d, amount, point)
        drone.onKilled = (d) => this._handleKilled(d)
        scene.add(drone.root)
        pool.push(drone)
        this.all.push(drone)
      }
      this.pools[type] = pool
    }

    this.projectiles = new Projectiles(scene, collision, effects)
    this.projectiles.onHitPlayer = (dmg, fromX, fromZ) => this.onPlayerHit && this.onPlayerHit(dmg, fromX, fromZ)

    this.ctx = {
      playerX: 0, playerZ: 0, playerVX: 0, playerVZ: 0,
      collision, projectiles: this.projectiles, drones: this.active, onShot: null,
    }

    // callbacks assigned by Game
    this.onDamaged = null // (drone, amount, point)
    this.onKilled = null // (drone)
    this.onPlayerHit = null // (damage, fromX, fromZ)
  }

  get activeCount() {
    return this.active.length
  }

  countOf(type) {
    let n = 0
    for (let i = 0; i < this.active.length; i++) if (this.active[i].type === type) n++
    return n
  }

  _handleKilled(d) {
    this.kills++
    this.killsByType[d.type]++
    if (this.onKilled) this.onKilled(d)
  }

  reset() {
    for (const d of this.all) d.deactivate()
    this.active.length = 0
    this.projectiles.clear()
    this.kills = 0
    this.killsByType.scout = this.killsByType.combat = this.killsByType.heavy = 0
  }

  /** Spawn a drone of `type` at a random free road position ring around the player. Returns it or null. */
  spawnAround(type, player) {
    if (this.active.length >= DRONES.MAX_ENEMIES) return null
    const drone = this.pools[type].find((d) => !d.active)
    if (!drone) return null

    for (let attempt = 0; attempt < 14; attempt++) {
      const a = Math.random() * Math.PI * 2
      const r = DRONES.SPAWN_MIN + Math.random() * (DRONES.SPAWN_MAX - DRONES.SPAWN_MIN)
      const x = player.position.x + Math.sin(a) * r
      const z = player.position.z + Math.cos(a) * r
      if (!this.collision.isFree(x, z, drone.radius + 1, 6)) continue
      drone.spawn(x, z, player.position.x, player.position.z)
      this.effects.particles.emit(x, drone.cfg.altitude, z, 14, { color: drone.cfg.color, speed: 4, life: 0.5, size: 0.3, gravity: 0 })
      return drone
    }
    return null
  }

  update(dt, player) {
    const ctx = this.ctx
    ctx.playerX = player.position.x
    ctx.playerZ = player.position.z
    ctx.playerVX = player.velocity.x
    ctx.playerVZ = player.velocity.z

    // rebuild the active list (cheap: <= ~25 drones)
    this.active.length = 0
    for (let i = 0; i < this.all.length; i++) if (this.all[i].active) this.active.push(this.all[i])

    for (let i = 0; i < this.active.length; i++) {
      const d = this.active[i]
      const dx = d.position.x - ctx.playerX, dz = d.position.z - ctx.playerZ
      if (dx * dx + dz * dz > DRONES.DESPAWN_RANGE * DRONES.DESPAWN_RANGE) {
        d.deactivate() // wandered too far: recycle (spawner will place a new one nearby)
        continue
      }
      updateDrone(d, dt, ctx)
    }
    this.projectiles.update(dt, player)
  }
}
