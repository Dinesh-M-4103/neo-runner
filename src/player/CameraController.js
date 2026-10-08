import * as THREE from 'three'
import { CAMERA, PLAYER } from '../utils/Constants.js'
import { clamp, damp, dampAngle } from '../utils/MathUtils.js'

/**
 * Third-person over-the-shoulder camera.
 * yaw = rotation around Y (0 looks toward -Z, same as a default three.js camera); pitch > 0 looks down.
 * Mouse look is lightly smoothed, the follow point lags slightly, FOV widens with speed,
 * the camera banks into strafing and is pulled in by geometry so it never sits inside a building.
 */
export class CameraController {
  constructor(camera, input, collision, settings) {
    this.camera = camera
    this.input = input
    this.collision = collision
    this.settings = settings

    this.targetYaw = Math.PI // start looking toward +Z
    this.targetPitch = CAMERA.DEFAULT_PITCH
    this.yaw = this.targetYaw
    this.pitch = this.targetPitch
    this.roll = 0
    this.fov = CAMERA.BASE_FOV
    this.distance = CAMERA.DISTANCE
    this.shake = 0 // 0..1 trauma
    this.fovKick = 0
    this.time = 0

    this.pivot = new THREE.Vector3()
    this._shifted = new THREE.Vector3()
    this._desired = new THREE.Vector3()
    this._look = new THREE.Vector3()
  }

  /** Snap to the player (used on run start so the camera doesn't sweep across the map). */
  reset(player) {
    this.targetYaw = this.yaw = Math.PI
    this.targetPitch = this.pitch = CAMERA.DEFAULT_PITCH
    this.roll = 0
    this.shake = 0
    this.fovKick = 0
    this.distance = CAMERA.DISTANCE
    this.pivot.set(player.position.x, CAMERA.HEIGHT_OFFSET, player.position.z)
  }

  /** Recoil: pitch up (negative pitch = looks up) and a little yaw jitter. */
  kick(pitchUp, yawJitter = 0) {
    this.targetPitch = clamp(this.targetPitch - pitchUp, CAMERA.MIN_PITCH, CAMERA.MAX_PITCH)
    this.targetYaw += yawJitter
  }

  addShake(amount) {
    this.shake = Math.min(1, this.shake + amount)
  }

  update(dt, player) {
    this.time += dt
    const sens = 0.0024 * this.settings.mouseSensitivity
    this.targetYaw -= this.input.mouseDX * sens
    this.targetPitch = clamp(this.targetPitch + this.input.mouseDY * sens, CAMERA.MIN_PITCH, CAMERA.MAX_PITCH)
    this.yaw = dampAngle(this.yaw, this.targetYaw, CAMERA.LOOK_DAMPING, dt)
    this.pitch = damp(this.pitch, this.targetPitch, CAMERA.LOOK_DAMPING, dt)

    // Laggy pivot
    this.pivot.x = damp(this.pivot.x, player.position.x, CAMERA.FOLLOW_DAMPING, dt)
    this.pivot.z = damp(this.pivot.z, player.position.z, CAMERA.FOLLOW_DAMPING, dt)
    this.pivot.y = damp(this.pivot.y, CAMERA.HEIGHT_OFFSET, CAMERA.FOLLOW_DAMPING, dt)

    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw)
    const fx = -sinY, fz = -cosY // camera forward on XZ
    const rx = -fz, rz = fx // camera right

    // Over-the-shoulder shift
    const shifted = this._shifted.set(
      this.pivot.x + rx * CAMERA.SHOULDER_OFFSET,
      this.pivot.y,
      this.pivot.z + rz * CAMERA.SHOULDER_OFFSET
    )

    // Desired position behind + above
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch)
    const back = CAMERA.DISTANCE
    const desired = this._desired.set(
      shifted.x - fx * cp * back,
      shifted.y + sp * back,
      shifted.z - fz * cp * back
    )
    if (desired.y < 0.5) desired.y = 0.5

    // Camera collision: shorten the boom when something is in the way.
    const t = this.collision.segmentHit(shifted.x, shifted.y, shifted.z, desired.x, desired.y, desired.z)
    const fullLen = Math.hypot(desired.x - shifted.x, desired.y - shifted.y, desired.z - shifted.z)
    const targetDist = Math.max(0.9, t * fullLen - 0.35)
    // Fast in (never clip), slow out (no popping)
    this.distance = damp(this.distance, Math.min(targetDist, fullLen), targetDist < this.distance ? 30 : 4, dt)
    const k = fullLen > 1e-4 ? Math.min(this.distance, fullLen) / fullLen : 1
    const cam = this.camera
    cam.position.set(
      shifted.x + (desired.x - shifted.x) * k,
      shifted.y + (desired.y - shifted.y) * k,
      shifted.z + (desired.z - shifted.z) * k
    )

    // Look at a point slightly ahead of the pivot so the player sits low-left in frame
    this._look.set(shifted.x + fx * 6, shifted.y + 0.15 - sp * 1.5, shifted.z + fz * 6)
    cam.lookAt(this._look)

    // Bank into lateral motion (velocity component along camera-right)
    const lateral = player.velocity.x * rx + player.velocity.z * rz
    const speedFrac = Math.min(1, player.speed / PLAYER.SPRINT_SPEED)
    this.roll = damp(this.roll, clamp(-lateral * 0.0045, -CAMERA.MAX_ROLL, CAMERA.MAX_ROLL), 7, dt)
    cam.rotateZ(this.roll)

    // Screen shake (trauma^2 for a nice falloff)
    if (this.shake > 0 && this.settings.screenShake !== false) {
      const s = this.shake * this.shake
      cam.rotateX(Math.sin(this.time * 61) * 0.02 * s)
      cam.rotateY(Math.sin(this.time * 53 + 1.7) * 0.02 * s)
    }
    this.shake = Math.max(0, this.shake - dt * 1.6)
    this.fovKick = damp(this.fovKick, 0, 8, dt)

    // Dynamic FOV
    const targetFov = CAMERA.BASE_FOV + speedFrac * CAMERA.SPEED_FOV_BONUS + this.fovKick
    this.fov = damp(this.fov, targetFov, 6, dt)
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov
      cam.updateProjectionMatrix()
    }
  }

  /**
   * Escape cinematic: sweeps in an arc around the portal, slowly pulling back, with a FOV punch.
   * t = seconds since the escape began; (px, pz) = portal position.
   */
  updateEscape(dt, t, px, pz) {
    this.time += dt
    const cam = this.camera
    const ang = this.yaw + 0.9 + t * 0.55
    const dist = 11 + t * 3.2
    const tx = px + Math.sin(ang) * dist
    const tz = pz + Math.cos(ang) * dist
    const ty = 3.2 + t * 1.6
    cam.position.x += (tx - cam.position.x) * Math.min(1, 4 * dt)
    cam.position.y += (ty - cam.position.y) * Math.min(1, 4 * dt)
    cam.position.z += (tz - cam.position.z) * Math.min(1, 4 * dt)
    this._look.set(px, 4.2, pz)
    cam.lookAt(this._look)
    const targetFov = 68 + Math.min(1, t * 0.6) * 22 + Math.sin(t * 6) * Math.max(0, 1 - t) * 4
    this.fov += (targetFov - this.fov) * Math.min(1, 5 * dt)
    cam.fov = this.fov
    cam.updateProjectionMatrix()
  }

  /** Cinematic dolly down a main road, used behind the main menu. */
  updateMenu(dt) {
    this.time += dt
    const t = this.time
    const cam = this.camera
    cam.position.set(Math.sin(t * 0.21) * 3.2, 9 + Math.sin(t * 0.17) * 1.6, 200 * Math.sin(t * 0.045) - 40)
    this._look.set(Math.sin(t * 0.13) * 6, 11 + Math.sin(t * 0.11) * 2, cam.position.z + 60)
    cam.lookAt(this._look)
    cam.rotateZ(Math.sin(t * 0.19) * 0.02)
    if (Math.abs(cam.fov - 62) > 0.01) {
      cam.fov = 62
      cam.updateProjectionMatrix()
    }
  }
}
