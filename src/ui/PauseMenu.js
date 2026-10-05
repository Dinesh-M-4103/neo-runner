import { Screen } from './Screen.js'

export class PauseMenu extends Screen {
  constructor(root, { onResume, onRestart, onQuit }) {
    super(root, 'pause')
    this.el.innerHTML = `<div class="panel"><h2>PAUSED</h2><div class="menu-buttons"></div></div>`
    const buttons = this.el.querySelector('.menu-buttons')
    buttons.appendChild(this.button('RESUME', onResume, 'primary'))
    buttons.appendChild(this.button('RESTART', onRestart))
    buttons.appendChild(this.button('QUIT TO MENU', onQuit))
  }
}
