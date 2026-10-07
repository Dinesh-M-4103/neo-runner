import { WANTED_SPAWN, TIME_PRESSURE, DRONES } from '../utils/Constants.js'

/**
 * Chooses how many / which drones exist from (wanted level) + (time pressure as the clock runs down).
 * `difficulty` is recomputed every update and read by the AI (aggression) and HUD/debug.
 */
export class SpawnSystem {
  constructor(enemies) {
    this.enemies = enemies
    this.timer = 1.5
    this.difficulty = { max: 1, interval: 3, types: { scout: 1 }, aggression: 1, pressure: 0 }
  }

  reset() {
    this.timer = 1.5
    this.enemies.ctx.aggression = 1
  }

  /** Combine the wanted-level table with the time-remaining pressure steps. */
  computeDifficulty(wantedLevel, timeLeft) {
    const base = WANTED_SPAWN[Math.min(wantedLevel, WANTED_SPAWN.length - 1)]
    const d = this.difficulty
    d.max = base.max
    d.interval = base.interval
    d.aggression = wantedLevel >= 5 ? 1.12 : 1
    d.types = { ...base.types }
    d.pressure = 0
    TIME_PRESSURE.forEach((step, i) => {
      if (timeLeft > step.remaining) return
      d.pressure = i + 1
      d.max = base.max + step.extraMax
      if (step.minTypes) for (const [t, w] of Object.entries(step.minTypes)) d.types[t] = Math.max(d.types[t] || 0, w)
      if (step.intervalMul) d.interval = base.interval * step.intervalMul
      if (step.aggression) d.aggression = Math.max(d.aggression, step.aggression)
    })
    d.max = Math.min(d.max, DRONES.MAX_ENEMIES)
    return d
  }

  update(dt, wantedLevel, timeLeft, player) {
    const diff = this.computeDifficulty(wantedLevel, timeLeft)
    this.enemies.ctx.aggression = diff.aggression

    this.timer -= dt
    if (this.timer > 0) return
    if (this.enemies.activeCount >= diff.max) {
      this.timer = 0.4
      return
    }
    this.timer = diff.interval * (0.85 + Math.random() * 0.3)

    let total = 0
    for (const w of Object.values(diff.types)) total += w
    let r = Math.random() * total
    let pick = 'scout'
    for (const [type, w] of Object.entries(diff.types)) {
      r -= w
      if (r <= 0) { pick = type; break }
    }
    // heavies are rare: at most 2 alive at once
    if (pick === 'heavy' && this.enemies.countOf('heavy') >= 2) pick = 'combat'
    this.enemies.spawnAround(pick, player)
  }
}
