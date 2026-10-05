import { PLAYER } from '../utils/Constants.js'

/** Health with brief post-hit invulnerability. Reusable for the player (and later, anything damageable). */
export class Health {
  constructor(max = PLAYER.MAX_HEALTH) {
    this.max = max
    this.hp = max
    this.invuln = 0
    this.onDamage = null // (amount, hpLeft)
    this.onDeath = null
  }

  reset() {
    this.hp = this.max
    this.invuln = 0
  }

  get dead() {
    return this.hp <= 0
  }

  get fraction() {
    return this.hp / this.max
  }

  /** @returns {boolean} true if damage was actually applied */
  damage(amount) {
    if (this.dead || this.invuln > 0) return false
    this.hp = Math.max(0, this.hp - amount)
    this.invuln = PLAYER.DAMAGE_INVULN
    if (this.onDamage) this.onDamage(amount, this.hp)
    if (this.hp <= 0 && this.onDeath) this.onDeath()
    return true
  }

  heal(amount) {
    if (!this.dead) this.hp = Math.min(this.max, this.hp + amount)
  }

  update(dt) {
    if (this.invuln > 0) this.invuln -= dt
  }
}
