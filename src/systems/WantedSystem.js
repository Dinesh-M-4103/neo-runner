import { WANTED, WANTED_THRESHOLDS } from '../utils/Constants.js'

/** Wanted level 0-5 derived from accumulated "heat". Heat only goes up during a run. */
export class WantedSystem {
  constructor() {
    this.heat = 0
    this.level = 0
    this.inZone = false
    this.onLevelUp = null // (level)
  }

  reset() {
    this.heat = 0
    this.level = 0
    this.inZone = false
  }

  get maxLevel() {
    return WANTED_THRESHOLDS.length - 1
  }

  /** 0..1 progress toward the next level (1 at max). */
  get progress() {
    if (this.level >= this.maxLevel) return 1
    const a = WANTED_THRESHOLDS[this.level], b = WANTED_THRESHOLDS[this.level + 1]
    return (this.heat - a) / (b - a)
  }

  addHeat(amount) {
    this.heat += amount
    while (this.level < this.maxLevel && this.heat >= WANTED_THRESHOLDS[this.level + 1]) {
      this.level++
      if (this.onLevelUp) this.onLevelUp(this.level)
    }
  }

  update(dt, inZone) {
    this.inZone = inZone
    this.addHeat(WANTED.SURVIVE_PER_SEC * dt + (inZone ? WANTED.ZONE_PER_SEC * dt : 0))
  }
}
