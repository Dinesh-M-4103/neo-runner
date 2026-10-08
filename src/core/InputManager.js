// Device-agnostic input. Gameplay reads abstract axes/actions so touch controls can plug in later
// (a TouchInput would simply write into the same `moveAxis` / action fields).

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space',
])

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas
    this.keys = new Set()
    this.pressedThisFrame = new Set()
    this.mouseButtons = new Set()
    this.mouseDX = 0
    this.mouseDY = 0
    this.locked = false
    this.moveAxis = { x: 0, y: 0 } // x: right+, y: forward+
    this.touchMode = false // set by TouchInput
    this.touchAxis = { x: 0, y: 0 }
    this.onEscape = null
    this.onLockChange = null

    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault()
      if (!e.repeat) this.pressedThisFrame.add(e.code)
      this.keys.add(e.code)
      if (e.code === 'Escape' && !e.repeat && this.onEscape) this.onEscape()
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.reset())

    window.addEventListener('mousedown', (e) => this.mouseButtons.add(e.button))
    window.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button))
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return
      this.mouseDX += e.movementX
      this.mouseDY += e.movementY
    })
    window.addEventListener('contextmenu', (e) => e.preventDefault())

    document.addEventListener('pointerlockchange', () => {
      if (this.touchMode) return
      this.locked = document.pointerLockElement === this.canvas
      if (!this.locked) this.reset()
      if (this.onLockChange) this.onLockChange(this.locked)
    })
  }

  requestLock() {
    if (this.touchMode) return
    try {
      const p = this.canvas.requestPointerLock()
      if (p && p.catch) p.catch(() => {})
    } catch {
      /* pointer lock unavailable */
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  reset() {
    this.touchAxis.x = this.touchAxis.y = 0
    if (!this.touchMode) this.keys.clear()
    this.mouseButtons.clear()
    this.pressedThisFrame.clear()
    this.mouseDX = 0
    this.mouseDY = 0
  }

  isDown(code) {
    return this.keys.has(code)
  }

  wasPressed(code) {
    return this.pressedThisFrame.has(code)
  }

  mouseDown(button = 0) {
    return this.mouseButtons.has(button)
  }

  /** Updates and returns the shared movement axis object (no allocation). */
  getMoveAxis() {
    if (this.touchMode) {
      this.moveAxis.x = this.touchAxis.x
      this.moveAxis.y = this.touchAxis.y
      return this.moveAxis
    }
    const k = this.keys
    const axis = this.moveAxis
    axis.x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
    axis.y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
    return axis
  }

  /** Call once at the end of every frame. */
  endFrame() {
    this.pressedThisFrame.clear()
    this.mouseDX = 0
    this.mouseDY = 0
  }
}
