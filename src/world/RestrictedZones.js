import * as THREE from 'three'
import { CITY, ZONES } from '../utils/Constants.js'
import { SeededRandom } from '../utils/MathUtils.js'
import { roadCoord } from './Road.js'

/**
 * Restricted areas: road intersections ringed in red. Standing inside raises the wanted level fast,
 * but they hold the richest energy cores (risk / reward).
 */
export class RestrictedZones {
  constructor(scene, seed, startPos) {
    this.list = []
    const rng = new SeededRandom((seed ^ 0x5f3759df) >>> 0)
    let guard = 0
    while (this.list.length < ZONES.COUNT && guard++ < 400) {
      const i = rng.int(3, CITY.GRID - 3), j = rng.int(3, CITY.GRID - 3)
      const x = roadCoord(i), z = roadCoord(j)
      if (Math.hypot(x - startPos.x, z - startPos.z) < ZONES.MIN_FROM_START) continue
      if (this.list.some((q) => Math.hypot(q.x - x, q.z - z) < ZONES.MIN_SPACING)) continue
      this.list.push({ x, z, r: ZONES.RADIUS })
    }

    // Shared materials: pulsed together in update()
    const make = (opacity) =>
      new THREE.MeshBasicMaterial({
        color: 0xff2040, transparent: true, opacity, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      })
    this.ringMat = make(0.9)
    this.fillMat = make(0.1)
    this.wallMat = make(0.1)

    const R = ZONES.RADIUS
    const ringGeo = new THREE.RingGeometry(R - 0.5, R, 64).rotateX(-Math.PI / 2)
    const fillGeo = new THREE.CircleGeometry(R, 48).rotateX(-Math.PI / 2)
    const wallGeo = new THREE.CylinderGeometry(R, R, 26, 40, 1, true)
    this.group = new THREE.Group()
    for (const z of this.list) {
      const ring = new THREE.Mesh(ringGeo, this.ringMat)
      ring.position.set(z.x, 0.1, z.z)
      const fill = new THREE.Mesh(fillGeo, this.fillMat)
      fill.position.set(z.x, 0.09, z.z)
      const wall = new THREE.Mesh(wallGeo, this.wallMat)
      wall.position.set(z.x, 13, z.z)
      for (const m of [ring, fill, wall]) {
        m.matrixAutoUpdate = false
        m.updateMatrix()
        this.group.add(m)
      }
    }
    scene.add(this.group)
    this.time = 0
  }

  contains(x, z) {
    for (let i = 0; i < this.list.length; i++) {
      const q = this.list[i]
      const dx = x - q.x, dz = z - q.z
      if (dx * dx + dz * dz < q.r * q.r) return true
    }
    return false
  }

  update(dt, active) {
    this.time += dt
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (active ? 9 : 3))
    this.ringMat.opacity = 0.55 + 0.4 * pulse
    this.fillMat.opacity = (active ? 0.18 : 0.08) + 0.06 * pulse
    this.wallMat.opacity = (active ? 0.16 : 0.08) + 0.04 * pulse
  }
}
