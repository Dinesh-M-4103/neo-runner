import { SCORE, COMBO } from '../utils/Constants.js'

export class ScoreSystem {
  constructor(save) {
    this.save = save
    this.reset()
  }

  reset() {
    this.score = 0
    this.cores = 0
    this._survivalCarry = 0
    this.stacks = 0 // consecutive scoring actions inside the combo window
    this.comboTimer = 0
  }

  /** x1 .. xMAX: +1 every PER_STEP chained actions. */
  get multiplier() {
    return Math.min(COMBO.MAX_MULT, 1 + Math.floor(Math.max(0, this.stacks - 1) / COMBO.PER_STEP))
  }

  get comboFraction() {
    return this.stacks > 0 ? this.comboTimer / COMBO.WINDOW : 0
  }

  /** Score an action (kill / core) with the combo multiplier. Returns { points, mult }. */
  award(base) {
    this.stacks++
    this.comboTimer = COMBO.WINDOW
    const mult = this.multiplier
    const points = base * mult
    this.score += points
    return { points, mult }
  }

  breakCombo() {
    this.stacks = 0
    this.comboTimer = 0
  }

  update(dt) {
    this._survivalCarry += SCORE.SURVIVAL_PER_SECOND * dt
    const whole = Math.floor(this._survivalCarry)
    if (whole > 0) {
      this.score += whole
      this._survivalCarry -= whole
    }
    if (this.stacks > 0) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) this.breakCombo()
    }
  }

  get highScore() {
    return Math.max(this.save.highScore, this.score)
  }

  /** Persist at end of run. @returns {boolean} new record? */
  commit() {
    return this.save.submitScore(this.score)
  }
}
