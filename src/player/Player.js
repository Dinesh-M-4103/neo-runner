import * as THREE from 'three'
import { PLAYER, PALETTE } from '../utils/Constants.js'
import { Health } from './Health.js'

const FOOT_Y = 0.06 // matches sidewalk slab height

// Shared across all Player instances
const darkSuit = new THREE.MeshStandardMaterial({ color: 0x2a3148, roughness: 0.4, metalness: 0.6, emissive: 0x0a1020 })
const armor = new THREE.MeshStandardMaterial({ color: 0x465073, roughness: 0.35, metalness: 0.6, emissive: 0x101830 })
const glowCyan = new THREE.MeshBasicMaterial({ color: PALETTE.CYAN, toneMapped: false })
const glowMagenta = new THREE.MeshBasicMaterial({ color: PALETTE.MAGENTA, toneMapped: false })

/** Player state + procedural runner model (visual only; movement lives in PlayerController). */
export class Player {
  constructor() {
    this.position = { x: PLAYER.START_POSITION.x, z: PLAYER.START_POSITION.z }
    this.velocity = { x: 0, z: 0 }
    this.facing = 0 // yaw radians, 0 = looking toward +Z
    this.distance = 0
    this.runPhase = 0

    this.health = new Health()
    this.stamina = PLAYER.MAX_STAMINA
    this.exhausted = false
    this.sprinting = false
    this.staminaIdle = 0
    this.dashing = false
    this.dashTime = 0
    this.dashCooldown = 0 // seconds remaining

    this.root = new THREE.Group() // world position + facing
    this.body = new THREE.Group() // lean pivot
    this.root.add(this.body)
    this._buildModel()
  }

  _buildModel() {
    const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)

    const torso = box(0.56, 0.72, 0.32, armor)
    torso.position.y = 1.18
    const chestLight = box(0.36, 0.06, 0.02, glowCyan)
    chestLight.position.set(0, 1.3, 0.17)
    const spine = box(0.06, 0.6, 0.02, glowMagenta)
    spine.position.set(0, 1.18, -0.17)
    const pack = box(0.4, 0.5, 0.18, darkSuit)
    pack.position.set(0, 1.2, -0.25)

    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), darkSuit)
    head.position.y = 1.72
    const visor = box(0.3, 0.09, 0.14, glowCyan)
    visor.position.set(0, 1.74, 0.13)

    this.body.add(torso, chestLight, spine, pack, head, visor)

    // Limbs pivot from the hip/shoulder so rotation looks like swinging
    const limb = (w, h, d, mat, px, py, pz) => {
      const pivot = new THREE.Group()
      pivot.position.set(px, py, pz)
      const m = box(w, h, d, mat)
      m.position.y = -h / 2
      pivot.add(m)
      this.body.add(pivot)
      return pivot
    }
    this.legL = limb(0.2, 0.8, 0.22, darkSuit, -0.15, 0.82, 0)
    this.legR = limb(0.2, 0.8, 0.22, darkSuit, 0.15, 0.82, 0)
    this.armL = limb(0.16, 0.62, 0.18, armor, -0.38, 1.5, 0)
    this.armR = limb(0.16, 0.62, 0.18, armor, 0.38, 1.5, 0)
    for (const leg of [this.legL, this.legR]) {
      const shoe = box(0.2, 0.05, 0.24, glowMagenta)
      shoe.position.set(0, -0.78, 0.01)
      leg.add(shoe)
    }
  }

  reset() {
    this.position.x = PLAYER.START_POSITION.x
    this.position.z = PLAYER.START_POSITION.z
    this.velocity.x = this.velocity.z = 0
    this.facing = 0
    this.distance = 0
    this.runPhase = 0
    this.health.reset()
    this.stamina = PLAYER.MAX_STAMINA
    this.exhausted = this.sprinting = this.dashing = false
    this.staminaIdle = this.dashTime = this.dashCooldown = 0
    this.syncTransform()
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z)
  }

  syncTransform() {
    this.root.position.set(this.position.x, FOOT_Y, this.position.z)
    this.root.rotation.y = this.facing
  }

  /** Procedural run cycle driven by actual speed. */
  animate(dt) {
    const speedFrac = Math.min(1.35, this.speed / PLAYER.PLAYER_SPEED)
    this.runPhase += dt * (4 + speedFrac * 9)
    if (this.dashing) this.runPhase += dt * 10
    const swing = Math.sin(this.runPhase) * 0.9 * speedFrac
    this.legL.rotation.x = swing
    this.legR.rotation.x = -swing
    this.armL.rotation.x = -swing * 0.9
    this.armR.rotation.x = swing * 0.9
    this.body.rotation.x = 0.22 * speedFrac // lean into the run
    this.body.position.y = Math.abs(Math.sin(this.runPhase)) * 0.06 * speedFrac
  }
}
