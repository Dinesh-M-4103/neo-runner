import * as THREE from 'three'
import { DRONES } from '../utils/Constants.js'

export const DroneState = Object.freeze({
  IDLE: 'IDLE',
  SEARCH: 'SEARCH',
  CHASE: 'CHASE',
  ATTACK: 'ATTACK',
  DAMAGED: 'DAMAGED',
  DESTROYED: 'DESTROYED',
})

// ---- shared geometry / materials (built once, lazily; every drone of a type reuses them) ----
let shared = null
function getShared() {
  if (shared) return shared
  shared = {
    hull: new THREE.MeshStandardMaterial({ color: 0x23273a, roughness: 0.4, metalness: 0.8, emissive: 0x0a0c16 }),
    plate: new THREE.MeshStandardMaterial({ color: 0x3a4058, roughness: 0.35, metalness: 0.85, emissive: 0x0a0c16 }),
    glow: {}, // per colour, created on demand
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 14, 10),
    octa: new THREE.OctahedronGeometry(1, 0),
    ico: new THREE.IcosahedronGeometry(1, 0),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
    torus: new THREE.TorusGeometry(1, 0.06, 6, 24),
  }
  return shared
}
function glowMat(color) {
  const s = getShared()
  if (!s.glow[color]) s.glow[color] = new THREE.MeshBasicMaterial({ color, toneMapped: false })
  return s.glow[color]
}

function mesh(geo, mat, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat)
  m.scale.set(sx, sy, sz)
  m.position.set(x, y, z)
  return m
}

/** Distinct silhouette per type, all procedural. Returns { model, ring, eye }. */
function buildModel(type, color) {
  const s = getShared()
  const g = glowMat(color)
  const model = new THREE.Group()
  let ring, eye

  if (type === 'scout') {
    // small, sleek dart: flat diamond body + swept wings + one bright eye
    model.add(mesh(s.octa, s.hull, 0.5, 0.28, 0.75))
    model.add(mesh(s.box, s.plate, 1.5, 0.05, 0.38, 0, 0, -0.1))
    model.add(mesh(s.box, g, 1.52, 0.06, 0.05, 0, 0, -0.3))
    eye = mesh(s.sphere, g, 0.14, 0.14, 0.14, 0, 0.02, 0.5)
    ring = mesh(s.torus, g, 0.55, 0.55, 0.55)
    ring.rotation.x = Math.PI / 2
  } else if (type === 'combat') {
    // boxy gunship: body, twin side pods, two barrels, visor eye
    model.add(mesh(s.box, s.hull, 1.1, 0.5, 1.2))
    model.add(mesh(s.cyl, s.plate, 0.28, 0.9, 0.28, -0.85, 0, 0).rotateZ(Math.PI / 2))
    model.add(mesh(s.cyl, s.plate, 0.28, 0.9, 0.28, 0.85, 0, 0).rotateZ(Math.PI / 2))
    model.add(mesh(s.box, g, 0.12, 0.12, 0.7, -0.38, -0.12, 0.85))
    model.add(mesh(s.box, g, 0.12, 0.12, 0.7, 0.38, -0.12, 0.85))
    model.add(mesh(s.box, s.plate, 0.9, 0.12, 0.6, 0, 0.32, -0.1))
    eye = mesh(s.box, g, 0.5, 0.12, 0.08, 0, 0.08, 0.62)
    ring = mesh(s.torus, g, 0.95, 0.95, 0.95, 0, -0.3, 0)
    ring.rotation.x = Math.PI / 2
  } else {
    // heavy: armoured dome, plates, big cannons, glowing core
    model.add(mesh(s.ico, s.hull, 1.5, 1.1, 1.5))
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const plate = mesh(s.box, s.plate, 0.9, 0.9, 0.18, Math.sin(a) * 1.35, 0, Math.cos(a) * 1.35)
      plate.rotation.y = a
      model.add(plate)
    }
    model.add(mesh(s.cyl, s.plate, 0.28, 1.5, 0.28, -0.7, -0.35, 1.1).rotateX(Math.PI / 2))
    model.add(mesh(s.cyl, s.plate, 0.28, 1.5, 0.28, 0.7, -0.35, 1.1).rotateX(Math.PI / 2))
    model.add(mesh(s.sphere, g, 0.34, 0.34, 0.34, -0.7, -0.35, 1.9))
    model.add(mesh(s.sphere, g, 0.34, 0.34, 0.34, 0.7, -0.35, 1.9))
    eye = mesh(s.sphere, g, 0.42, 0.42, 0.42, 0, 0.1, 1.35)
    ring = mesh(s.torus, g, 1.9, 1.9, 1.9, 0, 0.55, 0)
    ring.rotation.x = Math.PI / 2
  }
  model.add(ring, eye)
  return { model, ring, eye }
}

/**
 * A pooled flying drone. Doubles as a weapon target: { position, radius, alive, takeDamage() }.
 * Behaviour lives in DroneAI.js; this class is state + visuals.
 */
export class Drone {
  constructor(type) {
    this.type = type
    this.cfg = DRONES.TYPES[type]
    this.radius = this.cfg.radius
    this.position = { x: 0, y: this.cfg.altitude, z: 0 }
    this.velocity = { x: 0, z: 0 }
    this.alive = false // targetable
    this.active = false // in use (part of the pool)

    this.root = new THREE.Group()
    this.root.visible = false
    const { model, ring, eye } = buildModel(type, this.cfg.color)
    this.model = model
    this.ring = ring
    this.eye = eye
    this.root.add(model)

    // White additive shell: flashes when the drone is hit (own material so flashes are independent)
    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })
    this.flash = new THREE.Mesh(getShared().sphere, this.flashMat)
    this.flash.scale.setScalar(this.radius * 1.1)
    this.root.add(this.flash)

    this.onDamaged = null // (drone, amount, point)
    this.onKilled = null // (drone)
    this.reset()
  }

  reset() {
    this.hp = this.cfg.health
    this.state = DroneState.IDLE
    this.prevState = DroneState.IDLE
    this.stateTime = 0
    this.age = 0
    this.yaw = 0
    this.bobPhase = Math.random() * 6.28
    this.hasLOS = false
    this.losTimer = Math.random() * 0.2
    this.noLosTime = 0
    this.lastKnownX = 0
    this.lastKnownZ = 0
    this.wanderX = 0
    this.wanderZ = 0
    this.wanderTimer = 0
    this.strafeDir = Math.random() < 0.5 ? -1 : 1
    this.strafeTimer = 1 + Math.random() * 2
    this.fireTimer = 0.8 + Math.random()
    this.windup = 0
    this.burstLeft = 0
    this.burstTimer = 0
    this.stuck = 0
    this.detour = 0
    this.detourDir = 1
    this.flashMat.opacity = 0
    this.knockX = 0
    this.knockZ = 0
  }

  spawn(x, z, playerX, playerZ) {
    this.reset()
    this.position.x = x
    this.position.z = z
    this.position.y = this.cfg.altitude
    this.velocity.x = this.velocity.z = 0
    this.lastKnownX = playerX
    this.lastKnownZ = playerZ
    this.yaw = Math.atan2(playerX - x, playerZ - z)
    this.active = true
    this.alive = true
    this.state = DroneState.SEARCH // arrives already hunting the player
    this.root.visible = true
    this.root.scale.setScalar(0.01)
    this.syncMesh(0)
  }

  deactivate() {
    this.active = false
    this.alive = false
    this.root.visible = false
  }

  setState(state) {
    if (this.state === state) return
    this.prevState = this.state
    this.state = state
    this.stateTime = 0
  }

  /** @returns {boolean} true if this hit destroyed the drone */
  takeDamage(amount, point) {
    if (!this.alive) return false
    this.hp -= amount
    this.flashMat.opacity = 0.85
    if (this.onDamaged) this.onDamaged(this, amount, point)
    if (this.hp <= 0) {
      this.state = DroneState.DESTROYED
      this.deactivate()
      if (this.onKilled) this.onKilled(this)
      return true
    }
    // knock back away from the impact and stagger
    if (point) {
      const dx = this.position.x - point.x, dz = this.position.z - point.z
      const l = Math.hypot(dx, dz) || 1
      const k = this.type === 'heavy' ? 1.2 : this.type === 'combat' ? 2.4 : 4
      this.knockX = (dx / l) * k
      this.knockZ = (dz / l) * k
    }
    if (this.state !== DroneState.DAMAGED) this.setState(DroneState.DAMAGED)
    else this.stateTime = 0
    this.windup = 0 // being shot interrupts a charging shot
    return false
  }

  /** Visual update: transform, lean, ring spin, spawn-in scale, windup glow. */
  syncMesh(dt) {
    const p = this.position
    this.bobPhase += dt * 2.2
    this.root.position.set(p.x, p.y + Math.sin(this.bobPhase) * 0.25, p.z)
    this.root.rotation.y = this.yaw
    // lean into movement
    const speed = Math.hypot(this.velocity.x, this.velocity.z)
    const lean = Math.min(0.35, speed * 0.03)
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw)
    const fwd = (this.velocity.x * fx + this.velocity.z * fz) / (speed + 1e-4)
    this.model.rotation.x = lean * fwd * (speed > 0.5 ? 1 : 0)
    this.ring.rotation.z += dt * (3 + speed * 0.4)

    if (this.age < 0.5 && this.root.scale.x < 1) {
      this.root.scale.setScalar(Math.min(1, 0.01 + this.age / 0.4))
    }
    // eye pulses while charging a shot
    const w = this.windup > 0 ? 1 + 1.6 * (1 - this.windup / this.cfg.windup) : 1
    this.eye.scale.setScalar(w)
    if (this.flashMat.opacity > 0) this.flashMat.opacity = Math.max(0, this.flashMat.opacity - dt * 6)
  }
}
