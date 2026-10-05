/** Tiny base class for full-screen HTML overlays (menus, result screens, loading). */
export class Screen {
  constructor(root, className) {
    this.el = document.createElement('div')
    this.el.className = `screen ${className}`
    this.el.hidden = true
    root.appendChild(this.el)
  }

  show() {
    this.el.hidden = false
    requestAnimationFrame(() => this.el.classList.add('visible'))
  }

  hide() {
    this.el.classList.remove('visible')
    this.el.hidden = true
  }

  button(label, onClick, className = '') {
    const b = document.createElement('button')
    b.className = `btn ${className}`.trim()
    b.textContent = label
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      onClick()
    })
    return b
  }
}
