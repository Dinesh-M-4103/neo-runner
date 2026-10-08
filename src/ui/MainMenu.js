import { Screen } from './Screen.js'

export class MainMenu extends Screen {
  constructor(root, { onStart, onSettings }) {
    super(root, 'menu')
    this.el.innerHTML = `
      <div class="menu-inner">
        <h1 class="title"><span>NEON</span> RUNNER</h1>
        <p class="subtitle">ESCAPE BEFORE THEY FIND YOU.</p>
        <div class="menu-buttons"></div>
        <div class="howto" hidden>
          <h2>HOW TO PLAY</h2>
          <ul>
            <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move &nbsp;<kbd>MOUSE</kbd> Look</li>
            <li><kbd>SHIFT</kbd> Sprint &nbsp;<kbd>SPACE</kbd> Dash</li>
            <li><kbd>CLICK</kbd> Shoot (hold to auto-fire) &nbsp;<kbd>R</kbd> Reload</li>
            <li><kbd>ESC</kbd> Pause</li>
          </ul>
          <p class="objective"><b>OBJECTIVE:</b> reach the extraction portal before the timer reaches zero.</p>
          <p>Collect <b>energy cores</b> and destroy drones for combos &mdash; but everything you do raises your <b>wanted level</b>. Red zones are risky, and pay the most.</p>
        </div>
        <p class="footnote">60 SECONDS &middot; ONE CITY &middot; ONE EXIT</p>
      </div>`
    const buttons = this.el.querySelector('.menu-buttons')
    const howto = this.el.querySelector('.howto')
    buttons.appendChild(this.button('START RUN', onStart, 'primary'))
    buttons.appendChild(this.button('SETTINGS', onSettings))
    buttons.appendChild(this.button('HOW TO PLAY', () => (howto.hidden = !howto.hidden)))
  }
}
