import { GAME } from '../utils/Constants.js'

/** Run countdown. Only ticks when update() is called, so pausing is simply not calling it. */
export class TimerSystem {
  constructor(duration = GAME.GAME_DURATION) {
    this.duration = duration
    this.remaining = duration
    this.expired = false
    this.onExpire = null
    this.onSecond = null // (secondsLeft) fired each time the displayed second changes
    this._lastWhole = Math.ceil(duration)
  }

  reset() {
    this.remaining = this.duration
    this.expired = false
    this._lastWhole = Math.ceil(this.duration)
  }

  get elapsed() {
    return this.duration - this.remaining
  }

  update(dt) {
    if (this.expired) return
    this.remaining = Math.max(0, this.remaining - dt)
    const whole = Math.ceil(this.remaining)
    if (whole !== this._lastWhole) {
      this._lastWhole = whole
      if (this.onSecond) this.onSecond(whole)
    }
    if (this.remaining <= 0) {
      this.expired = true
      if (this.onExpire) this.onExpire()
    }
  }
}
