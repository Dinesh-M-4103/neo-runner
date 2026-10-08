/**
 * On-screen touch controls. They write into the same InputManager fields keyboard/mouse use
 * (move axis, mouse delta, buttons, key presses), so gameplay code never knows the difference.
 *   left thumb: virtual stick | right thumb: drag to look | buttons: fire / dash / sprint / reload / pause
 * Enabled automatically on coarse-pointer devices (or with ?touch=1 for testing).
 */
export function touchSupported() {
  const q = new URLSearchParams(window.location.search)
  if (q.get('touch') === '1') return true
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

export class TouchInput {
  constructor(root, input, { onPause }) {
    this.input = input
    input.touchMode = true
    input.locked = true // no pointer lock on touch devices

    const el = (this.el = document.createElement('div'))
    el.className = 'touch'
    el.hidden = true
    el.innerHTML = `
      <div class="stick-zone" data-k="stick"><div class="stick-base"><div class="stick-knob"></div></div></div>
      <div class="look-zone" data-k="look"></div>
      <button class="tbtn fire" data-k="fire">FIRE</button>
      <button class="tbtn dash" data-k="dash">DASH</button>
      <button class="tbtn sprint" data-k="sprint">RUN</button>
      <button class="tbtn reload" data-k="reload">R</button>
      <button class="tbtn pause" data-k="pause">II</button>`
    root.appendChild(el)
    const q = (k) => el.querySelector(`[data-k="${k}"]`)

    // --- virtual stick
    const zone = q('stick'), base = el.querySelector('.stick-base'), knob = el.querySelector('.stick-knob')
    let stickId = null, cx = 0, cy = 0
    const R = 55
    zone.addEventListener('pointerdown', (e) => {
      if (stickId !== null) return
      stickId = e.pointerId
      try { zone.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
      cx = e.clientX; cy = e.clientY
      base.style.left = `${cx}px`; base.style.top = `${cy}px`
      base.classList.add('on')
    })
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return
      let dx = e.clientX - cx, dy = e.clientY - cy
      const d = Math.hypot(dx, dy)
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R }
      knob.style.transform = `translate(${dx}px, ${dy}px)`
      input.touchAxis.x = Math.abs(dx / R) < 0.12 ? 0 : dx / R
      input.touchAxis.y = Math.abs(dy / R) < 0.12 ? 0 : -dy / R
    })
    const endStick = (e) => {
      if (e.pointerId !== stickId) return
      stickId = null
      input.touchAxis.x = input.touchAxis.y = 0
      knob.style.transform = ''
      base.classList.remove('on')
    }
    zone.addEventListener('pointerup', endStick)
    zone.addEventListener('pointercancel', endStick)

    // --- look drag
    const look = q('look')
    let lookId = null, lx = 0, ly = 0
    look.addEventListener('pointerdown', (e) => {
      if (lookId !== null) return
      lookId = e.pointerId
      try { look.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
      lx = e.clientX; ly = e.clientY
    })
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return
      input.mouseDX += (e.clientX - lx) * 1.6
      input.mouseDY += (e.clientY - ly) * 1.6
      lx = e.clientX; ly = e.clientY
    })
    const endLook = (e) => { if (e.pointerId === lookId) lookId = null }
    look.addEventListener('pointerup', endLook)
    look.addEventListener('pointercancel', endLook)

    // --- buttons
    const hold = (btn, down, up) => {
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ } btn.classList.add('on'); down() })
      const end = () => { btn.classList.remove('on'); up() }
      btn.addEventListener('pointerup', end)
      btn.addEventListener('pointercancel', end)
    }
    hold(q('fire'), () => input.mouseButtons.add(0), () => input.mouseButtons.delete(0))
    hold(q('sprint'), () => input.keys.add('ShiftLeft'), () => input.keys.delete('ShiftLeft'))
    hold(q('dash'), () => input.pressedThisFrame.add('Space'), () => {})
    hold(q('reload'), () => input.pressedThisFrame.add('KeyR'), () => {})
    hold(q('pause'), () => onPause(), () => {})
  }

  setVisible(v) {
    this.el.hidden = !v
  }
}
