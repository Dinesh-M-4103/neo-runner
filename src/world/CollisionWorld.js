// Static collision: axis-aligned boxes stored in a uniform spatial hash (XZ plane).
// Player collision = circle vs AABB; camera collision = segment vs AABB.

const CELL = 16

export class CollisionWorld {
  constructor() {
    this.boxes = [] // {minX,maxX,minZ,maxZ,height,stamp}
    this.cells = new Map()
    this.stamp = 0
    this.bounds = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity }
  }

  _key(ix, iz) {
    return ix * 100003 + iz
  }

  addBox(cx, cz, w, d, height) {
    const box = {
      minX: cx - w / 2, maxX: cx + w / 2,
      minZ: cz - d / 2, maxZ: cz + d / 2,
      height, stamp: 0,
    }
    this.boxes.push(box)
    const x0 = Math.floor(box.minX / CELL), x1 = Math.floor(box.maxX / CELL)
    const z0 = Math.floor(box.minZ / CELL), z1 = Math.floor(box.maxZ / CELL)
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this._key(ix, iz)
        let list = this.cells.get(k)
        if (!list) this.cells.set(k, (list = []))
        list.push(box)
      }
    }
    return box
  }

  /** Push a circle (x,z,r) out of all boxes. Mutates and returns `pos` ({x,z}). */
  resolveCircle(pos, r) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false
      const ix0 = Math.floor((pos.x - r) / CELL), ix1 = Math.floor((pos.x + r) / CELL)
      const iz0 = Math.floor((pos.z - r) / CELL), iz1 = Math.floor((pos.z + r) / CELL)
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const list = this.cells.get(this._key(ix, iz))
          if (!list) continue
          for (let i = 0; i < list.length; i++) {
            const b = list[i]
            const cx = pos.x < b.minX ? b.minX : pos.x > b.maxX ? b.maxX : pos.x
            const cz = pos.z < b.minZ ? b.minZ : pos.z > b.maxZ ? b.maxZ : pos.z
            const dx = pos.x - cx, dz = pos.z - cz
            const d2 = dx * dx + dz * dz
            if (d2 >= r * r) continue
            moved = true
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2)
              pos.x += (dx / d) * (r - d)
              pos.z += (dz / d) * (r - d)
            } else {
              // centre is inside the box: exit through the nearest face
              const l = pos.x - b.minX, rr = b.maxX - pos.x
              const t = pos.z - b.minZ, bt = b.maxZ - pos.z
              const m = Math.min(l, rr, t, bt)
              if (m === l) pos.x = b.minX - r
              else if (m === rr) pos.x = b.maxX + r
              else if (m === t) pos.z = b.minZ - r
              else pos.z = b.maxZ + r
            }
          }
        }
      }
      if (!moved) break
    }
    const bd = this.bounds
    pos.x = pos.x < bd.minX + r ? bd.minX + r : pos.x > bd.maxX - r ? bd.maxX - r : pos.x
    pos.z = pos.z < bd.minZ + r ? bd.minZ + r : pos.z > bd.maxZ - r ? bd.maxZ - r : pos.z
    return pos
  }

  /**
   * Fraction t in [0,1] along segment A->B of the first box hit (1 if clear).
   * Used to keep the camera out of buildings.
   */
  segmentHit(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az
    const len = Math.hypot(dx, dz)
    const steps = Math.max(1, Math.ceil(len / (CELL * 0.75)))
    this.stamp++
    let best = 1
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const ix = Math.floor((ax + dx * t) / CELL), iz = Math.floor((az + dz * t) / CELL)
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const list = this.cells.get(this._key(ix + ox, iz + oz))
          if (!list) continue
          for (let i = 0; i < list.length; i++) {
            const b = list[i]
            if (b.stamp === this.stamp) continue
            b.stamp = this.stamp
            const h = this._slab(ax, ay, az, dx, dy, dz, b)
            if (h < best) best = h
          }
        }
      }
    }
    return best
  }

  _slab(ax, ay, az, dx, dy, dz, b) {
    let tmin = 0, tmax = 1
    // X
    if (Math.abs(dx) < 1e-9) { if (ax < b.minX || ax > b.maxX) return 1 }
    else {
      let t1 = (b.minX - ax) / dx, t2 = (b.maxX - ax) / dx
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2)
      if (tmin > tmax) return 1
    }
    // Y (0..height)
    if (Math.abs(dy) < 1e-9) { if (ay < 0 || ay > b.height) return 1 }
    else {
      let t1 = (0 - ay) / dy, t2 = (b.height - ay) / dy
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2)
      if (tmin > tmax) return 1
    }
    // Z
    if (Math.abs(dz) < 1e-9) { if (az < b.minZ || az > b.maxZ) return 1 }
    else {
      let t1 = (b.minZ - az) / dz, t2 = (b.maxZ - az) / dz
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2)
      if (tmin > tmax) return 1
    }
    return tmin
  }
}
