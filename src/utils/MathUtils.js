// Small math helpers + seeded RNG (no allocations in hot paths).

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

/** Shortest signed angle difference a->b in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function dampAngle(current, target, lambda, dt) {
  return current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt))
}

/** mulberry32 - tiny deterministic PRNG so a seed reproduces the same city. */
export class SeededRandom {
  constructor(seed) {
    this.state = seed >>> 0
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min, max) {
    return min + (max - min) * this.next()
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1))
  }

  chance(p) {
    return this.next() < p
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)]
  }
}
