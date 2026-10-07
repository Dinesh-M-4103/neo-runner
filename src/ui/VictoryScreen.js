import { Screen } from './Screen.js'

const COLORS = ['#00f0ff', '#ff2bd6', '#ffb347', '#8a4dff', '#ffffff']

export class VictoryScreen extends Screen {
  constructor(root, { onRetry, onMenu }) {
    super(root, 'victory')
    this.el.innerHTML = `
      <div class="confetti"></div>
      <div class="panel win">
        <h2 class="success">EXTRACTION SUCCESSFUL</h2>
        <dl class="stats">
          <dt>TIME REMAINING</dt><dd data-k="time">0</dd>
          <dt>DISTANCE</dt><dd data-k="distance">0</dd>
          <dt>ENEMIES DESTROYED</dt><dd data-k="kills">0</dd>
          <dt>ENERGY COLLECTED</dt><dd data-k="cores">0</dd>
          <dt>EXTRACTION BONUS</dt><dd data-k="bonus">0</dd>
          <dt>SCORE</dt><dd data-k="score" class="big">0</dd>
          <dt>HIGH SCORE</dt><dd data-k="high">0</dd>
        </dl>
        <p class="record" hidden>NEW HIGH SCORE!</p>
        <div class="menu-buttons"></div>
      </div>`
    const buttons = this.el.querySelector('.menu-buttons')
    buttons.appendChild(this.button('RUN AGAIN', onRetry, 'primary'))
    buttons.appendChild(this.button('MAIN MENU', onMenu))
    this.confetti = this.el.querySelector('.confetti')
  }

  setStats({ timeLeft, distance, kills, cores, bonus, score, high, record }) {
    const set = (k, v) => (this.el.querySelector(`[data-k="${k}"]`).textContent = v)
    set('time', `${timeLeft.toFixed(1)}s`)
    set('distance', `${Math.round(distance)} m`)
    set('kills', String(kills))
    set('cores', String(cores))
    set('bonus', `+${bonus.toLocaleString()}`)
    set('score', score.toLocaleString())
    set('high', high.toLocaleString())
    this.el.querySelector('.record').hidden = !record
  }

  show() {
    super.show()
    // celebration: neon confetti falling (pure CSS animation, recreated each time)
    this.confetti.innerHTML = ''
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i')
      const color = COLORS[i % COLORS.length]
      p.style.left = `${Math.random() * 100}%`
      p.style.background = color
      p.style.animationDelay = `${Math.random() * 1.6}s`
      p.style.animationDuration = `${2.4 + Math.random() * 2.2}s`
      p.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`)
      p.style.boxShadow = `0 0 8px ${color}`
      this.confetti.appendChild(p)
    }
  }
}
