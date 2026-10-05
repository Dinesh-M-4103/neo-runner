import { PLAYER } from '../utils/Constants.js'
import { dampAngle } from '../utils/MathUtils.js'

const MAX_STEP = 0.3 // max distance per collision sub-step (dash is fast: avoids tunnelling through thin props)

/**
 * Camera-relative WASD movement with snappy acceleration, sprint + stamina, dash, and wall collision.
 * Pure logic - no allocations per frame.
 */
export class PlayerController {
  constructor(player, input, collision) {
    this.player = player
    this.input = input
    this.collision = collision
    this.moveDirX = 0 // last world-space input direction
    this.moveDirZ = 1
    this.hasInput = false
    this.dashDirX = 0
    this.dashDirZ = 1
    this.onDash = null // (x, z, dirX, dirZ)
    this.onDashTick = null // (x, z)
    this.onDashEnd = null
    this.onExhausted = null
  }

  /**
   * @param {number} cameraYaw camera yaw (radians)
   * @param {number|null} aimFacing if set, the runner faces this yaw (while shooting)
   */
  update(dt, cameraYaw, aimFacing = null) {
    const p = this.player
    const input = this.input
    const axis = input.getMoveAxis()

    // Camera forward/right on XZ (yaw 0 looks toward -Z)
    const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw)
    const rx = -fz, rz = fx

    let dx = fx * axis.y + rx * axis.x
    let dz = fz * axis.y + rz * axis.x
    const len = Math.hypot(dx, dz)
    this.hasInput = len > 0.001
    if (this.hasInput) {
      dx /= len
      dz /= len
      this.moveDirX = dx
      this.moveDirZ = dz
    }

    // ---- sprint + stamina ------------------------------------------------------------------
    const wantSprint = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && this.hasInput
    if (p.exhausted && p.stamina >= PLAYER.STAMINA_EXHAUST_RECOVER) p.exhausted = false
    p.sprinting = wantSprint && !p.exhausted && p.stamina > 0 && !p.dashing
    if (p.sprinting) {
      p.stamina -= PLAYER.STAMINA_DRAIN * dt
      p.staminaIdle = 0
      if (p.stamina <= 0) {
        p.stamina = 0
        p.exhausted = true
        p.sprinting = false
        if (this.onExhausted) this.onExhausted()
      }
    } else {
      p.staminaIdle += dt
      if (p.staminaIdle > PLAYER.STAMINA_REGEN_DELAY && !p.dashing) {
        p.stamina = Math.min(PLAYER.MAX_STAMINA, p.stamina + PLAYER.STAMINA_REGEN * dt)
      }
    }

    // ---- dash ------------------------------------------------------------------------------
    if (p.dashCooldown > 0) p.dashCooldown -= dt
    if (input.wasPressed('Space') && p.dashCooldown <= 0 && !p.dashing) {
      // Dash where you are steering; standing still dashes the way the runner faces
      if (this.hasInput) {
        this.dashDirX = dx
        this.dashDirZ = dz
      } else {
        this.dashDirX = Math.sin(p.facing)
        this.dashDirZ = Math.cos(p.facing)
      }
      p.dashing = true
      p.dashTime = PLAYER.DASH_DURATION
      p.dashCooldown = PLAYER.DASH_COOLDOWN
      p.health.invuln = Math.max(p.health.invuln, PLAYER.DASH_DURATION + 0.08) // brief i-frames
      if (this.onDash) this.onDash(p.position.x, p.position.z, this.dashDirX, this.dashDirZ)
    }

    // ---- velocity --------------------------------------------------------------------------
    if (p.dashing) {
      const dashSpeed = PLAYER.DASH_DISTANCE / PLAYER.DASH_DURATION
      p.velocity.x = this.dashDirX * dashSpeed
      p.velocity.z = this.dashDirZ * dashSpeed
    } else {
      const top = p.sprinting ? PLAYER.SPRINT_SPEED : PLAYER.PLAYER_SPEED
      const targetVX = this.hasInput ? dx * top : 0
      const targetVZ = this.hasInput ? dz * top : 0
      const accel = this.hasInput ? PLAYER.ACCELERATION : PLAYER.DECELERATION
      const vx = targetVX - p.velocity.x, vz = targetVZ - p.velocity.z
      const dv = Math.hypot(vx, vz)
      const maxDv = accel * dt
      if (dv <= maxDv || dv < 1e-6) {
        p.velocity.x = targetVX
        p.velocity.z = targetVZ
      } else {
        p.velocity.x += (vx / dv) * maxDv
        p.velocity.z += (vz / dv) * maxDv
      }
    }

    // ---- move with sub-stepped collision ---------------------------------------------------
    const ox = p.position.x, oz = p.position.z
    const total = Math.hypot(p.velocity.x, p.velocity.z) * dt
    const steps = Math.max(1, Math.ceil(total / MAX_STEP))
    const sdt = dt / steps
    for (let i = 0; i < steps; i++) {
      p.position.x += p.velocity.x * sdt
      p.position.z += p.velocity.z * sdt
      this.collision.resolveCircle(p.position, PLAYER.RADIUS)
      if (p.dashing && this.onDashTick) this.onDashTick(p.position.x, p.position.z)
    }

    const moved = Math.hypot(p.position.x - ox, p.position.z - oz)
    p.distance += moved
    if (dt > 0) {
      p.velocity.x = (p.position.x - ox) / dt
      p.velocity.z = (p.position.z - oz) / dt
    }

    if (p.dashing) {
      p.dashTime -= dt
      if (p.dashTime <= 0) {
        p.dashing = false
        // keep a bit of momentum so the dash doesn't stop dead
        const keep = this.hasInput ? 1 : 0.25
        p.velocity.x = this.dashDirX * PLAYER.PLAYER_SPEED * keep
        p.velocity.z = this.dashDirZ * PLAYER.PLAYER_SPEED * keep
        if (this.onDashEnd) this.onDashEnd()
      }
    }

    // ---- facing ----------------------------------------------------------------------------
    if (aimFacing !== null) {
      p.facing = dampAngle(p.facing, aimFacing, 22, dt)
    } else if (p.speed > 0.5) {
      p.facing = dampAngle(p.facing, Math.atan2(p.velocity.x, p.velocity.z), PLAYER.TURN_SPEED, dt)
    }

    p.syncTransform()
    p.animate(dt)
  }
}
