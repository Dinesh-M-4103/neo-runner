import * as THREE from 'three'

const POOL = 18

/** Floating combat text (pooled DOM nodes). Projects a world position to the screen once; CSS animates it. */
export class DamageNumbers {
  constructor(root, camera) {
    this.camera = camera
    this.els = []
    this.next = 0
    this._v = new THREE.Vector3()
    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div')
      el.className = 'dmg-num'
      el.hidden = true
      root.appendChild(el)
      this.els.push(el)
    }
  }

  show(x, y, z, text, kind = '') {
    const v = this._v.set(x, y, z).project(this.camera)
    if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) return
    const el = this.els[this.next]
    this.next = (this.next + 1) % POOL
    el.hidden = false
    el.textContent = text
    el.className = 'dmg-num'
    void el.offsetWidth // restart animation
    el.className = `dmg-num go ${kind}`
    el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 24}px`
    el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`
  }

  clear() {
    for (const el of this.els) el.hidden = true
  }
}
