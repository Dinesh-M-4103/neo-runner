import * as THREE from 'three'
import { CITY } from '../utils/Constants.js'
import { SeededRandom } from '../utils/MathUtils.js'
import { CollisionWorld } from './CollisionWorld.js'
import { createBuildingMaterial, generateLot } from './Building.js'
import { createHologramMaterial } from './HologramMaterial.js'
import { generateRoadSegment, roadCoord } from './Road.js'

// Shared geometry/materials: built once, reused by every chunk (and by every regeneration).
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0) // base sits on y = 0
const POOL_PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

function makePoolTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.14)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function createMaterials() {
  return {
    buildings: createBuildingMaterial(),
    slabs: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.5 }),
    props: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.4 }),
    poles: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.6 }),
    // Unlit neon: toneMapped=false keeps colours saturated instead of ACES-greying them.
    neon: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    holo: createHologramMaterial(),
    lamps: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    dashes: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    pools: new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: makePoolTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  }
}

const GEOMETRY = {
  buildings: UNIT_BOX, slabs: UNIT_BOX, props: UNIT_BOX, poles: UNIT_BOX,
  neon: UNIT_BOX, holo: UNIT_BOX, lamps: UNIT_BOX, dashes: UNIT_BOX, pools: POOL_PLANE,
}

/** Collects instance data for one spatial chunk, then bakes one InstancedMesh per layer. */
class Chunk {
  constructor() {
    this.layers = {}
    this.group = new THREE.Group()
    this.center = new THREE.Vector3()
  }

  add(layer, x, y, z, sx, sy, sz, color) {
    let l = this.layers[layer]
    if (!l) l = this.layers[layer] = []
    l.push(x, y, z, sx, sy, sz, color)
  }

  build(materials) {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    const c = new THREE.Color()
    for (const [name, data] of Object.entries(this.layers)) {
      const count = data.length / 7
      const mesh = new THREE.InstancedMesh(GEOMETRY[name], materials[name], count)
      for (let i = 0; i < count; i++) {
        const o = i * 7
        p.set(data[o], data[o + 1], data[o + 2])
        s.set(data[o + 3], data[o + 4], data[o + 5])
        m.compose(p, q, s)
        mesh.setMatrixAt(i, m)
        mesh.setColorAt(i, c.setHex(data[o + 6]))
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere() // needed for correct per-chunk frustum culling
      mesh.frustumCulled = true
      mesh.matrixAutoUpdate = false
      mesh.castShadow = false
      mesh.receiveShadow = false
      this.group.add(mesh)
    }
  }
}

export class City {
  constructor(seed) {
    this.seed = seed
    this.group = new THREE.Group()
    this.collision = new CollisionWorld()
    this.chunks = []
    this.stats = { buildings: 0, instances: 0 }
    this.materials = createMaterials()
    this._generate()
  }

  _chunkFor(x, z) {
    const size = CITY.CHUNK_BLOCKS * CITY.PITCH
    const n = Math.ceil(CITY.GRID / CITY.CHUNK_BLOCKS)
    const ix = Math.min(n - 1, Math.max(0, Math.floor((x + CITY.HALF_EXTENT) / size)))
    const iz = Math.min(n - 1, Math.max(0, Math.floor((z + CITY.HALF_EXTENT) / size)))
    return this.chunks[ix * n + iz]
  }

  _generate() {
    const rng = new SeededRandom(this.seed)
    const size = CITY.CHUNK_BLOCKS * CITY.PITCH
    const n = Math.ceil(CITY.GRID / CITY.CHUNK_BLOCKS)
    for (let ix = 0; ix < n; ix++) {
      for (let iz = 0; iz < n; iz++) {
        const ch = new Chunk()
        ch.center.set(-CITY.HALF_EXTENT + (ix + 0.5) * size, 0, -CITY.HALF_EXTENT + (iz + 0.5) * size)
        this.chunks.push(ch)
      }
    }

    const collision = this.collision
    const pitch = CITY.PITCH

    // Buildings, one lot per city block
    for (let bx = 0; bx < CITY.GRID; bx++) {
      for (let bz = 0; bz < CITY.GRID; bz++) {
        const cx = (bx - (CITY.GRID - 1) / 2) * pitch
        const cz = (bz - (CITY.GRID - 1) / 2) * pitch
        const chunk = this._chunkFor(cx, cz)
        const lot = {
          cx, cz, size: CITY.LOT_SIZE,
          centerFactor: 1 - Math.min(1, Math.hypot(cx, cz) / CITY.HALF_EXTENT),
        }
        generateLot(
          rng, lot,
          (layer, x, y, z, sx, sy, sz, color) => chunk.add(layer, x, y, z, sx, sy, sz, color),
          (x, z, w, d, h) => collision.addBox(x, z, w, d, h)
        )
      }
    }

    // Roads: every segment between two neighbouring intersections (outer ring included)
    for (let line = 0; line <= CITY.GRID; line++) {
      const fixed = roadCoord(line)
      for (let seg = 0; seg < CITY.GRID; seg++) {
        const mid = roadCoord(seg) + pitch / 2
        // Road running along Z at x = fixed, and along X at z = fixed
        for (const axis of ['z', 'x']) {
          const wx = axis === 'z' ? fixed : mid
          const wz = axis === 'z' ? mid : fixed
          const chunk = this._chunkFor(wx, wz)
          generateRoadSegment(
            rng, axis, fixed, mid,
            (layer, x, y, z, sx, sy, sz, color) => chunk.add(layer, x, y, z, sx, sy, sz, color),
            (x, z, w, d, h) => collision.addBox(x, z, w, d, h)
          )
        }
      }
    }

    // Solid city border so the player can't leave the map
    const edge = CITY.HALF_EXTENT + CITY.ROAD_WIDTH / 2
    const t = CITY.BORDER_THICKNESS
    const len = 2 * (edge + t)
    const walls = [
      [0, -(edge + t / 2), len, t],
      [0, edge + t / 2, len, t],
      [-(edge + t / 2), 0, t, len],
      [edge + t / 2, 0, t, len],
    ]
    for (const [x, z, w, d] of walls) {
      // Split each wall per chunk-sized piece so culling stays effective
      const pieces = Math.ceil(Math.max(w, d) / size)
      for (let i = 0; i < pieces; i++) {
        const pw = w > d ? w / pieces : w, pd = w > d ? d : d / pieces
        const px = w > d ? x - w / 2 + pw * (i + 0.5) : x
        const pz = w > d ? z : z - d / 2 + pd * (i + 0.5)
        this._chunkFor(px, pz).add('buildings', px, 0, pz, pw, CITY.BORDER_HEIGHT, pd, 0xff2bd6)
        collision.addBox(px, pz, pw, pd, CITY.BORDER_HEIGHT)
      }
    }
    collision.bounds = { minX: -edge, maxX: edge, minZ: -edge, maxZ: edge }

    // Bake
    for (const ch of this.chunks) {
      ch.build(this.materials)
      this.group.add(ch.group)
      for (const mesh of ch.group.children) this.stats.instances += mesh.count
    }
    this.stats.buildings = collision.boxes.length
  }

  /** Advance time-driven shaders (hologram billboards). */
  update(time) {
    this.materials.holo.uniforms.uTime.value = time
  }

  /** Distance-based chunk visibility (on top of frustum culling). Cheap: 16 chunks. */
  updateVisibility(cameraPosition, maxDistance = 420) {
    const radius = (CITY.CHUNK_BLOCKS * CITY.PITCH) * 0.75
    for (const ch of this.chunks) {
      const dx = ch.center.x - cameraPosition.x, dz = ch.center.z - cameraPosition.z
      ch.group.visible = dx * dx + dz * dz < (maxDistance + radius) ** 2
    }
  }

  /** Spawn point: a road intersection near the map centre (always clear). */
  getStartPosition() {
    return { x: roadCoord(CITY.GRID / 2), z: roadCoord(CITY.GRID / 2) }
  }

  dispose() {
    for (const ch of this.chunks) for (const m of ch.group.children) m.dispose()
  }
}

