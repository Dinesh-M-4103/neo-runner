import { Screen } from './Screen.js'

/** Settings overlay. Edits the shared settings object in place and reports every change. */
export class Settings extends Screen {
  constructor(root, settings, { onChange, onBack }) {
    super(root, 'settings')
    this.settings = settings
    this.onChange = onChange
    this.el.innerHTML = `
      <div class="panel">
        <h2>SETTINGS</h2>
        <div class="rows"></div>
        <div class="menu-buttons"></div>
      </div>`
    const rows = this.el.querySelector('.rows')
    this.controls = {}

    const slider = (key, label, min, max, step) => {
      const row = document.createElement('label')
      row.className = 'row'
      row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`
      const input = row.querySelector('input')
      const out = row.querySelector('output')
      input.addEventListener('input', () => {
        this.settings[key] = parseFloat(input.value)
        out.textContent = this._fmt(key)
        this.onChange(key)
      })
      this.controls[key] = { input, out, type: 'range' }
      rows.appendChild(row)
    }
    const toggle = (key, label) => {
      const row = document.createElement('label')
      row.className = 'row'
      row.innerHTML = `<span>${label}</span><input type="checkbox"><output></output>`
      const input = row.querySelector('input')
      const out = row.querySelector('output')
      input.addEventListener('change', () => {
        this.settings[key] = input.checked
        out.textContent = input.checked ? 'ON' : 'OFF'
        this.onChange(key)
      })
      this.controls[key] = { input, out, type: 'check' }
      rows.appendChild(row)
    }
    const select = (key, label, options) => {
      const row = document.createElement('label')
      row.className = 'row'
      const opts = options.map((o) => `<option value="${o}">${o.toUpperCase()}</option>`).join('')
      row.innerHTML = `<span>${label}</span><select>${opts}</select><output></output>`
      const input = row.querySelector('select')
      input.addEventListener('change', () => {
        this.settings[key] = input.value
        this.onChange(key)
      })
      this.controls[key] = { input, type: 'select' }
      rows.appendChild(row)
    }

    slider('masterVolume', 'MASTER VOLUME', 0, 1, 0.05)
    slider('musicVolume', 'MUSIC VOLUME', 0, 1, 0.05)
    slider('sfxVolume', 'SFX VOLUME', 0, 1, 0.05)
    select('quality', 'GRAPHICS QUALITY', ['low', 'medium', 'high'])
    slider('mouseSensitivity', 'MOUSE SENSITIVITY', 0.2, 3, 0.1)
    toggle('screenShake', 'SCREEN SHAKE')
    toggle('postProcessing', 'POST-PROCESSING')

    this.el.querySelector('.menu-buttons').appendChild(this.button('BACK', onBack, 'primary'))
  }

  _fmt(key) {
    const v = this.settings[key]
    return key === 'mouseSensitivity' ? `${v.toFixed(1)}x` : `${Math.round(v * 100)}%`
  }

  /** Sync widgets to the current settings values. */
  refresh() {
    for (const [key, c] of Object.entries(this.controls)) {
      const v = this.settings[key]
      if (c.type === 'range') {
        c.input.value = v
        c.out.textContent = this._fmt(key)
      } else if (c.type === 'check') {
        c.input.checked = !!v
        c.out.textContent = v ? 'ON' : 'OFF'
      } else {
        c.input.value = v
      }
    }
  }

  show() {
    this.refresh()
    super.show()
  }
}
