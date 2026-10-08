import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CITY, PICKUPS, PALETTE } from '../utils/Constants.js'
import { SeededRandom } from '../utils/MathUtils.js'
import { roadCoord } from '../world/Road.js'

const HEALTH_SLOTS = PICKUPS.HEALTH_COUNT + 10 // static packs + room for drone drops
const GREEN = 0x39ff88
const KIND = { CORE: 0, HEALTH: 1 }
const GONE = 2

/**
 * Energy cores (score) and health packs. Each kind is one InstancedMesh + one halo InstancedMesh,
 * so the whole pickup field costs 4 draw calls. Layout is seeded => same cores every run for a seed.
 */
export class PickupManager {
  constructor(scene, { collision, effects, zones, seed, startPos }) {
    this.collision = collision
    this.effects = effects
    this.entries = []
    this.time = 0
    this.sparkTimer = 0
    this.onCollect = null // (entry)

    this._generate(seed, zones, startPos)

    const coreGeo = new THREE.OctahedronGeometry(0.42, 0)
    const haloGeo = new THREE.SphereGeometry(0.95, 10, 8)
    // health pack = a plus sign
    const bar = new THREE.BoxGeometry(0.28, 0.9, 0.28)
    const plus = mergeGeometries([bar, bar.clone().rotateZ(Math.PI / 2)])

    const solid = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
    const halo = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    })

    const nCores = this.entries.filter((e) => e.kind === KIND.CORE).length
    this.coreMesh = this._instanced(scene, coreGeo, solid, nCores)
    this.coreHalo = this._instanced(scene, haloGeo, halo, nCores)
    this.healthMesh = this._instanced(scene, plus, solid, HEALTH_SLOTS)
    this.healthHalo = this._instanced(scene, haloGeo, halo, HEALTH_SLOTS)

    // colours are fixed per slot
    const c = new THREE.Color()
    for (const e of this.entries) {
      c.setHex(e.color)
      if (e.kind === KIND.CORE) {
        this.coreMesh.setColorAt(e.slot, c)
        this.coreHalo.setColorAt(e.slot, c)
      } else {
        this.healthMesh.setColorAt(e.slot, c)
        this.healthHalo.setColorAt(e.slot, c)
      }
    }

    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._p = new THREE.Vector3()
    this._s = new THREE.Vector3()
    this._e = new THREE.Euler()
    this.reset()
  }

  _instanced(scene, geo, mat, count) {
    const m = new THREE.InstancedMesh(geo, mat, count)
    m.frustumCulled = false // pickups move (magnet) and drop in dynamically
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    scene.add(m)
    return m
  }

  // ---- layout -------------------------------------------------------------------------------
  _generate(seed, zones, start) {
    const rng = new SeededRandom((seed ^ 0xc0ffee) >>> 0)
    const col = this.collision
    let coreSlot = 0
    const addCore = (x, z, rich) => {
      this.entries.push({
        kind: KIND.CORE, slot: coreSlot++, x, z, y: 1.2, baseX: x, baseZ: z, phase: rng.next() * 6.28,
        value: rich ? PICKUPS.RICH_VALUE : PICKUPS.CORE_VALUE, rich, color: rich ? PALETTE.AMBER : PALETTE.CYAN,
        state: 0, dynamic: false,
      })
    }
    const randomRoadPoint = (central) => {
      for (let t = 0; t < 40; t++) {
        const span = central ? 4 : CITY.GRID
        const line = Math.floor(CITY.GRID / 2 - span / 2 + rng.next() * (span + 1))
        const seg = Math.floor(CITY.GRID / 2 - span / 2 + rng.next() * span)
        const along = roadCoord(seg) + CITY.PITCH / 2 + rng.range(-12, 12)
        const lat = roadCoord(line) + rng.range(-5.5, 5.5)
        const horizontal = rng.chance(0.5)
        const x = horizontal ? along : lat
        const z = horizontal ? lat : along
        if (col.isFree(x, z, 1.4)) return { x, z }
      }
      return null
    }

    // premium cores sit inside the restricted zones
    for (const zn of zones.list) {
      for (let i = 0; i < PICKUPS.ZONE_CORES; i++) {
        const a = (i / PICKUPS.ZONE_CORES) * Math.PI * 2 + 0.4
        addCore(zn.x + Math.sin(a) * 5, zn.z + Math.cos(a) * 5, true)
      }
    }
    // a handful close to the start so the first seconds reward movement
    for (let i = 0; i < 10; i++) {
      const p = randomRoadPoint(true)
      if (p && Math.hypot(p.x - start.x, p.z - start.z) > 12) addCore(p.x, p.z, false)
    }
    // the rest spread over the whole city; far-from-spawn ones are sometimes rich
    let guard = 0
    while (coreSlot < PICKUPS.CORE_COUNT && guard++ < 600) {
      const p = randomRoadPoint(false)
      if (!p) continue
      const far = Math.hypot(p.x - start.x, p.z - start.z) > 260
      addCore(p.x, p.z, far && rng.chance(0.25))
    }
    // static health packs
    let h = 0
    guard = 0
    while (h < PICKUPS.HEALTH_COUNT && guard++ < 200) {
      const p = randomRoadPoint(false)
      if (!p) continue
      this.entries.push({
        kind: KIND.HEALTH, slot: h++, x: p.x, z: p.z, y: 1.1, baseX: p.x, baseZ: p.z, phase: rng.next() * 6.28,
        value: PICKUPS.HEALTH_HEAL, rich: false, color: GREEN, state: 0, dynamic: false,
      })
    }
    // dynamic slots for drone drops start "gone"
    for (let s = PICKUPS.HEALTH_COUNT; s < HEALTH_SLOTS; s++) {
      this.entries.push({
        kind: KIND.HEALTH, slot: s, x: 0, z: 0, y: 1.1, baseX: 0, baseZ: 0, phase: 0, value: PICKUPS.DROP_HEAL,
        rich: false, color: GREEN, state: GONE, dynamic: true,
      })
    }
  }

  reset() {
    this.time = 0
    for (const e of this.entries) {
      e.x = e.baseX
      e.z = e.baseZ
      e.y = e.kind === KIND.CORE ? 1.2 : 1.1
      e.state = e.dynamic ? GONE : 0
      this._write(e, 0)
    }
    this._flush()
  }

  get coresTotal() {
    return this.coreMesh.count
  }

  /** Drop a health pack where a drone died. */
  spawnHealth(x, z) {
    const e = this.entries.find((q) => q.dynamic && q.state === GONE)
    if (!e) return
    e.x = e.baseX = x
    e.z = e.baseZ = z
    e.y = 1.1
    e.state = 0
    e.phase = Math.random() * 6.28
  }

  _write(e, spin) {
    const gone = e.state === GONE
    const isCore = e.kind === KIND.CORE
    const mesh = isCore ? this.coreMesh : this.healthMesh
    const halo = isCore ? this.coreHalo : this.healthHalo
    const bob = Math.sin(this.time * 2.2 + e.phase) * 0.18
    const pulse = 1 + Math.sin(this.time * 4 + e.phase) * 0.08
    const s = gone ? 0 : (e.rich ? 1.25 : 1) * pulse
    this._p.set(e.x, e.y + bob, e.z)
    this._e.set(0, spin + e.phase, isCore ? 0.25 : 0)
    this._q.setFromEuler(this._e)
    this._m.compose(this._p, this._q, this._s.setScalar(s))
    mesh.setMatrixAt(e.slot, this._m)
    this._m.compose(this._p, this._q, this._s.setScalar(s * (isCore ? 1 : 0.9)))
    halo.setMatrixAt(e.slot, this._m)
  }

  _flush() {
    this.coreMesh.instanceMatrix.needsUpdate = true
    this.coreHalo.instanceMatrix.needsUpdate = true
    this.healthMesh.instanceMatrix.needsUpdate = true
    this.healthHalo.instanceMatrix.needsUpdate = true
    for (const m of [this.coreMesh, this.coreHalo, this.healthMesh, this.healthHalo]) {
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }

  update(dt, player) {
    this.time += dt
    const px = player.position.x, pz = player.position.z
    const spin = this.time * 2.4
    const magnet = PICKUPS.MAGNET_RANGE
    const collect2 = PICKUPS.COLLECT_RANGE * PICKUPS.COLLECT_RANGE

    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]
      if (e.state === GONE) continue
      const dx = px - e.x, dz = pz - e.z
      const d2 = dx * dx + dz * dz
      if (d2 > 160 * 160) continue // far away: leave as-is

      if (d2 < magnet * magnet) {
        // full health: a health pack stays put (and keeps its place for later)
        const wasted = e.kind === KIND.HEALTH && player.health.hp >= player.health.max
        if (!wasted) {
          const d = Math.sqrt(d2) || 1e-3
          const pull = (8 + (magnet - d) * 10) * dt
          e.x += (dx / d) * Math.min(pull, d)
          e.z += (dz / d) * Math.min(pull, d)
          e.y += (1.1 - e.y) * Math.min(1, 6 * dt)
          if (d2 < collect2) {
            e.state = GONE
            this._write(e, spin)
            this.effects.pickupBurst(e.x, e.y, e.z, e.kind === KIND.HEALTH ? GREEN : e.color, e.rich ? 1.5 : 1)
            if (this.onCollect) this.onCollect(e)
            continue
          }
        }
      } else if (e.x !== e.baseX || e.z !== e.baseZ) {
        // drifted out of magnet range (e.g. player dashed away): ease back home
        e.x += (e.baseX - e.x) * Math.min(1, 3 * dt)
        e.z += (e.baseZ - e.z) * Math.min(1, 3 * dt)
        e.y += ((e.kind === KIND.CORE ? 1.2 : 1.1) - e.y) * Math.min(1, 3 * dt)
      }
      this._write(e, spin)
    }
    this._flush()

    // ambient sparkles drifting off nearby pickups
    this.sparkTimer -= dt
    if (this.sparkTimer <= 0) {
      this.sparkTimer = 0.07
      const e = this.entries[(Math.random() * this.entries.length) | 0]
      if (e.state !== GONE) {
        const dx = px - e.x, dz = pz - e.z
        if (dx * dx + dz * dz < 55 * 55) {
          this.effects.particles.emit(e.x, e.y + 0.3, e.z, 1, { color: e.color, speed: 0.6, life: 0.9, size: 0.14, gravity: -1.2, drag: 1 })
        }
      }
    }
  }
}
