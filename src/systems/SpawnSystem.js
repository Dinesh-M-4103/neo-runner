import { SPAWN_TIERS, DRONES } from '../utils/Constants.js'

/**
 * Keeps the number/mix of drones matched to the current difficulty tier.
 * (Phase 4 will drive the tier from the wanted level instead of just elapsed time.)
 */
export class SpawnSystem {
  constructor(enemies) {
    this.enemies = enemies
    this.timer = 1
  }

  reset() {
    this.timer = 1
  }

  tierFor(elapsed) {
    let tier = SPAWN_TIERS[0]
    for (const t of SPAWN_TIERS) if (elapsed >= t.from) tier = t
    return tier
  }

  update(dt, elapsed, player) {
    this.timer -= dt
    if (this.timer > 0) return
    const tier = this.tierFor(elapsed)
    const target = Math.min(tier.max, DRONES.MAX_ENEMIES)
    if (this.enemies.activeCount >= target) {
      this.timer = 0.5
      return
    }
    this.timer = 1.1 + Math.random() * 0.6

    // weighted pick among allowed types
    let total = 0
    for (const w of Object.values(tier.types)) total += w
    let r = Math.random() * total
    let pick = 'scout'
    for (const [type, w] of Object.entries(tier.types)) {
      r -= w
      if (r <= 0) { pick = type; break }
    }
    // heavies are rare: never more than 2 alive
    if (pick === 'heavy' && this.enemies.countOf('heavy') >= 2) pick = 'combat'
    this.enemies.spawnAround(pick, player)
  }
}
