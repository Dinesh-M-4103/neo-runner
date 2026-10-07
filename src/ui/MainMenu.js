import { Screen } from './Screen.js'

export class MainMenu extends Screen {
  constructor(root, { onStart }) {
    super(root, 'menu')
    this.el.innerHTML = `
      <div class="menu-inner">
        <h1 class="title"><span>NEON</span> RUNNER</h1>
        <p class="subtitle">ESCAPE BEFORE THEY FIND YOU.</p>
        <div class="menu-buttons"></div>
        <div class="howto" hidden>
          <h2>HOW TO PLAY</h2>
          <ul>
            <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</li>
            <li><kbd>MOUSE</kbd> Look</li>
            <li><kbd>SHIFT</kbd> Sprint</li>
            <li><kbd>SPACE</kbd> Dash</li>
            <li><kbd>CLICK</kbd> Shoot (hold to auto-fire) &nbsp;<kbd>R</kbd> Reload</li>
            <li><kbd>ESC</kbd> Pause</li>
          </ul>
          <p>Survive and explore the city. You have <b>60 seconds</b>.</p>
        </div>
        <p class="footnote">Phase 3 build &mdash; drones</p>
      </div>`
    const buttons = this.el.querySelector('.menu-buttons')
    const howto = this.el.querySelector('.howto')
    buttons.appendChild(this.button('START RUN', onStart, 'primary'))
    buttons.appendChild(this.button('HOW TO PLAY', () => (howto.hidden = !howto.hidden)))
  }
}
