import { Screen } from './Screen.js'

export class GameOver extends Screen {
  constructor(root, { onRetry, onMenu }) {
    super(root, 'gameover')
    this.el.innerHTML = `
      <div class="panel">
        <h2 class="fail">MISSION FAILED</h2>
        <dl class="stats">
          <dt>TIME SURVIVED</dt><dd data-k="time">0</dd>
          <dt>DISTANCE</dt><dd data-k="distance">0</dd>
          <dt>ENEMIES DESTROYED</dt><dd data-k="kills">0</dd>
          <dt>ENERGY COLLECTED</dt><dd data-k="cores">0</dd>
          <dt>SCORE</dt><dd data-k="score">0</dd>
          <dt>HIGH SCORE</dt><dd data-k="high">0</dd>
        </dl>
        <p class="record" hidden>NEW HIGH SCORE!</p>
        <div class="menu-buttons"></div>
      </div>`
    const buttons = this.el.querySelector('.menu-buttons')
    buttons.appendChild(this.button('RETRY', onRetry, 'primary'))
    buttons.appendChild(this.button('MAIN MENU', onMenu))
  }

  setStats({ time, distance, kills, cores, score, high, record }) {
    const set = (k, v) => (this.el.querySelector(`[data-k="${k}"]`).textContent = v)
    set('time', `${time.toFixed(1)}s`)
    set('distance', `${Math.round(distance)} m`)
    set('kills', String(kills))
    set('cores', String(cores))
    set('score', score.toLocaleString())
    set('high', high.toLocaleString())
    this.el.querySelector('.record').hidden = !record
  }
}
