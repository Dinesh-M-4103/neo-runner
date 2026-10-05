import * as THREE from 'three'
import { WEAPON, PALETTE } from '../utils/Constants.js'

/**
 * NEON BLASTER: hitscan weapon. The shot ray starts at the camera and goes through the crosshair, so
 * whatever is under the crosshair is what you hit; the visible tracer then flies from the gun to that point.
 *
 * Targets (drones later) register in `targets`: { position:{x,y,z}, radius, alive, takeDamage(dmg, point) }.
 */
export class Weapon {
  constructor({ camera, cameraCtl, collision, effects, player }) {
    this.camera = camera
    this.cameraCtl = cameraCtl
    this.collision = collision
    this.effects = effects
    this.player = player

    this.targets = []
    this.ammo = WEAPON.MAG_SIZE
    this.cooldown = 0
    this.reloadTimer = 0
    this.reloading = false
    this.sinceFired = 99
    this.onHitTarget = null // (target, killed)
    this.onFire = null
    this.onReloadStart = null
    this.onReloadDone = null
    this.onDryFire = null

    this._dir = new THREE.Vector3()
    this._right = new THREE.Vector3()
    this._up = new THREE.Vector3()
    this._muzzle = { x: 0, y: 0, z: 0 }
  }

  reset() {
    this.ammo = WEAPON.MAG_SIZE
    this.cooldown = 0
    this.reloading = false
    this.reloadTimer = 0
    this.sinceFired = 99
  }

  get reloadProgress() {
    return this.reloading ? 1 - this.reloadTimer / WEAPON.RELOAD_TIME : 1
  }

  /** True shortly after firing: the player should face the aim direction. */
  get isAiming() {
    return this.sinceFired < WEAPON.AIM_FACING_TIME
  }

  startReload() {
    if (this.reloading || this.ammo >= WEAPON.MAG_SIZE) return
    this.reloading = true
    this.reloadTimer = WEAPON.RELOAD_TIME
    if (this.onReloadStart) this.onReloadStart()
  }

  update(dt, wantsFire, wantsReload) {
    this.sinceFired += dt
    if (this.cooldown > 0) this.cooldown -= dt

    if (wantsReload) this.startReload()

    if (this.reloading) {
      this.reloadTimer -= dt
      if (this.reloadTimer <= 0) {
        this.reloading = false
        this.ammo = WEAPON.MAG_SIZE
        if (this.onReloadDone) this.onReloadDone()
      }
      return
    }

    if (wantsFire && this.cooldown <= 0) {
      if (this.ammo <= 0) {
        this.startReload()
        if (this.onDryFire) this.onDryFire()
      } else {
        this.fire()
      }
    }
  }

  _muzzlePosition() {
    const p = this.player
    const fx = Math.sin(p.facing), fz = Math.cos(p.facing)
    const m = this._muzzle
    // right hand, slightly forward
    m.x = p.position.x + fx * 0.65 + fz * 0.36
    m.y = 1.42
    m.z = p.position.z + fz * 0.65 - fx * 0.36
    return m
  }

  fire() {
    this.ammo--
    this.cooldown = WEAPON.WEAPON_COOLDOWN
    this.sinceFired = 0

    // Aim ray: from camera through screen centre, with a little spread
    const cam = this.camera
    const dir = cam.getWorldDirection(this._dir)
    this._right.set(1, 0, 0).applyQuaternion(cam.quaternion)
    this._up.set(0, 1, 0).applyQuaternion(cam.quaternion)
    const sx = (Math.random() - 0.5) * 2 * WEAPON.SPREAD
    const sy = (Math.random() - 0.5) * 2 * WEAPON.SPREAD
    dir.addScaledVector(this._right, sx).addScaledVector(this._up, sy).normalize()

    // Start past the player so we don't hit things behind them
    const start = cam.position
    const skip = Math.min(this.cameraCtl.distance, 6.5)
    const ox = start.x + dir.x * skip, oy = start.y + dir.y * skip, oz = start.z + dir.z * skip
    const range = WEAPON.RANGE
    let hitDist = range
    let hitTarget = null

    // World (buildings / props)
    const t = this.collision.segmentHit(ox, oy, oz, ox + dir.x * range, oy + dir.y * range, oz + dir.z * range)
    if (t < 1) hitDist = t * range
    // Ground
    if (dir.y < -1e-4) {
      const gd = (0.06 - oy) / dir.y
      if (gd > 0 && gd < hitDist) hitDist = gd
    }
    // Targets (ray vs sphere)
    for (let i = 0; i < this.targets.length; i++) {
      const tg = this.targets[i]
      if (!tg.alive) continue
      const cx = tg.position.x - ox, cy = tg.position.y - oy, cz = tg.position.z - oz
      const proj = cx * dir.x + cy * dir.y + cz * dir.z
      if (proj < 0 || proj > hitDist) continue
      const d2 = cx * cx + cy * cy + cz * cz - proj * proj
      const r = tg.radius
      if (d2 > r * r) continue
      const dist = proj - Math.sqrt(r * r - d2)
      if (dist < hitDist) {
        hitDist = Math.max(0, dist)
        hitTarget = tg
      }
    }

    const hx = ox + dir.x * hitDist, hy = oy + dir.y * hitDist, hz = oz + dir.z * hitDist
    const m = this._muzzlePosition()
    const fx = this.effects
    fx.muzzleFlash(m.x, m.y, m.z)
    fx.tracer(m.x, m.y, m.z, hx, hy, hz, hitTarget ? PALETTE.MAGENTA : PALETTE.CYAN)

    if (hitDist < range) {
      fx.hitSparks(hx, hy, hz, dir.x, dir.y, dir.z, hitTarget ? PALETTE.MAGENTA : PALETTE.CYAN)
    }
    if (hitTarget) {
      const killed = hitTarget.takeDamage(WEAPON.WEAPON_DAMAGE, { x: hx, y: hy, z: hz })
      if (this.onHitTarget) this.onHitTarget(hitTarget, killed, WEAPON.WEAPON_DAMAGE)
    }

    // Feedback: recoil kick + tiny shake
    this.cameraCtl.kick(WEAPON.RECOIL_PITCH, (Math.random() - 0.5) * 0.004)
    this.cameraCtl.addShake(WEAPON.RECOIL_SHAKE)
    if (this.onFire) this.onFire()
  }
}
