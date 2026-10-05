import { SCORE } from '../utils/Constants.js'

export class ScoreSystem {
  constructor(save) {
    this.save = save
    this.score = 0
    this._survivalCarry = 0
  }

  reset() {
    this.score = 0
    this._survivalCarry = 0
  }

  add(points) {
    this.score += points
  }

  update(dt) {
    this._survivalCarry += SCORE.SURVIVAL_PER_SECOND * dt
    const whole = Math.floor(this._survivalCarry)
    if (whole > 0) {
      this.score += whole
      this._survivalCarry -= whole
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
