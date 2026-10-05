import { CITY, PALETTE } from '../utils/Constants.js'

const CONTAINER_COLORS = [0x2a4a6a, 0x6a2a4a, 0x3a5a4a, 0x5a4a2a, 0x40406a]
const LAMP_COLORS = [PALETTE.AMBER, PALETTE.AMBER, PALETTE.CYAN, PALETTE.MAGENTA]

/** Road centerline coordinate for index k in 0..GRID */
export function roadCoord(k) {
  return (k - CITY.GRID / 2) * CITY.PITCH
}

/**
 * Emits road markings, crosswalks, street lights and street props for one road segment.
 * Segments run between two intersections; `axis` is the direction of travel ('x' or 'z').
 * `fixed` is the road centerline coordinate on the other axis, `mid` the segment centre along `axis`.
 *
 * Street props are only placed in the outer 3.5m strip on ONE side of the road, so there is always a
 * wide clear lane => the player can never be trapped.
 */
export function generateRoadSegment(rng, axis, fixed, mid, emit, addCollider) {
  const span = CITY.LOT_SIZE // free length between intersection boxes
  const half = CITY.ROAD_WIDTH / 2

  // world-space helpers: along = travel direction, lat = across the road
  const X = (along, lat) => (axis === 'z' ? fixed + lat : mid + along)
  const Z = (along, lat) => (axis === 'z' ? mid + along : fixed + lat)
  const sx = (a, l) => (axis === 'z' ? l : a) // world size along X
  const sz = (a, l) => (axis === 'z' ? a : l)

  // Dashed centre line
  for (const a of [-9, 0, 9]) {
    emit('dashes', X(a, 0), 0.01, Z(a, 0), sx(3.2, 0.28), 0.02, sz(3.2, 0.28), 0x2c8796)
  }

  // Crosswalk stripes at both intersection ends
  for (const end of [-1, 1]) {
    const a = end * (span / 2 + 1.6)
    for (let i = -2; i <= 2; i++) {
      emit('dashes', X(a, i * 2.6), 0.012, Z(a, i * 2.6), sx(1.2, 1.3), 0.02, sz(1.2, 1.3), 0x3a4058)
    }
  }

  // Street lights: one on each side, staggered along the segment
  for (const side of [-1, 1]) {
    const a = side * 8
    const lat = side * (half - 0.4)
    const color = rng.pick(LAMP_COLORS)
    emit('poles', X(a, lat), 0.06, Z(a, lat), 0.22, 7.2, 0.22, 0x1c1f29)
    // arm reaching over the road + lamp head
    emit('poles', X(a, lat - side * 0.9), 7.1, Z(a, lat - side * 0.9), sx(0.2, 1.8), 0.16, sz(0.2, 1.8), 0x1c1f29)
    emit('lamps', X(a, lat - side * 1.6), 6.95, Z(a, lat - side * 1.6), sx(0.9, 0.5), 0.14, sz(0.9, 0.5), color)
    // fake light pool on the ground (additive decal) instead of a real light
    emit('pools', X(a, lat - side * 1.6), 0.03, Z(a, lat - side * 1.6), 11, 1, 11, color)
  }

  // Street props on the outer strip of a single side
  const r = rng.next()
  if (r < 0.3) {
    // Shipping container
    const side = rng.chance(0.5) ? 1 : -1
    const len = 6, wid = 2.4
    const lat = side * (half - 1.0 - wid / 2)
    const a = rng.range(-5, 5)
    const x = X(a, lat), z = Z(a, lat)
    emit('props', x, 0.06, z, sx(len, wid), 2.6, sz(len, wid), rng.pick(CONTAINER_COLORS))
    addCollider(x, z, sx(len, wid), sz(len, wid), 2.6)
  } else if (r < 0.55) {
    // Row of hazard barriers reaching in from the curb (never more than ~5m in)
    const side = rng.chance(0.5) ? 1 : -1
    const a = rng.range(-9, 9)
    const n = rng.int(2, 3)
    for (let i = 0; i < n; i++) {
      const lat = side * (half - 1.3 - i * 2.4)
      const x = X(a, lat), z = Z(a, lat)
      emit('props', x, 0.06, z, sx(0.5, 2.2), 1.0, sz(0.5, 2.2), 0x3a3f52)
      emit('neon', x, 1.0, z, sx(0.55, 2.25), 0.12, sz(0.55, 2.25), PALETTE.AMBER)
      addCollider(x, z, sx(0.5, 2.2), sz(0.5, 2.2), 1.1)
    }
  }
}
