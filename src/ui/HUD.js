/** In-run HUD (HTML overlay). Writes to the DOM only when a displayed value actually changes. */
export class HUD {
  constructor(root) {
    this.el = document.createElement('div')
    this.el.className = 'hud'
    this.el.hidden = true
    this.el.innerHTML = `
      <div class="hud-damage" data-k="damage"></div>
      <div class="hud-lowtime" data-k="lowtime"></div>

      <div class="hud-vitals">
        <div class="bar hp"><span class="label">HP</span><div class="track"><div class="fill" data-k="hpFill"></div></div><span class="num" data-k="hpNum">100</span></div>
        <div class="bar st"><span class="label">STAMINA</span><div class="track"><div class="fill" data-k="stFill"></div></div><span class="num"></span></div>
      </div>

      <div class="hud-timer"><span class="label">TIME</span><span class="value" data-k="timer">60</span></div>

      <div class="hud-score">
        <div><span class="label">SCORE</span><span class="value" data-k="score">0</span></div>
        <div class="sub"><span class="label">BEST</span><span data-k="high">0</span></div>
        <div class="sub"><span class="label">DIST</span><span data-k="distance">0</span><span class="unit">m</span></div>
      </div>

      <div class="hud-wanted" data-k="wanted">
        <span class="label">WANTED</span>
        <div class="stars">
          <i></i><i></i><i></i><i></i><i></i>
        </div>
        <div class="level" data-k="wantedLevel">0</div>
        <div class="track heat"><div class="fill" data-k="heatFill"></div></div>
      </div>

      <div class="hud-combo" data-k="combo">
        <span class="mult" data-k="comboMult">x1</span>
        <div class="track"><div class="fill" data-k="comboFill"></div></div>
      </div>
      <div class="hud-cores"><span class="label">CORES</span><span class="value" data-k="cores">0</span></div>

      <div class="hud-banner" data-k="banner"></div>
      <div class="hud-zone" data-k="zone">RESTRICTED AREA &mdash; WANTED RISING</div>

      <div class="crosshair" data-k="crosshair"><i></i><i></i><i></i><i></i></div>

      <div class="hud-weapon">
        <span class="label" data-k="weaponName">NEON BLASTER</span>
        <div class="ammo"><span class="value" data-k="ammo">40</span><span class="max" data-k="ammoMax">/ 40</span></div>
        <div class="track reload"><div class="fill" data-k="reloadFill"></div></div>
        <span class="reload-text" data-k="reloadText">RELOADING</span>
      </div>

      <div class="hud-dash" data-k="dash">
        <span class="label">DASH</span>
        <div class="track"><div class="fill" data-k="dashFill"></div></div>
        <span class="key"><kbd>SPACE</kbd></span>
      </div>

      <div class="hud-portal" data-k="portal"><div class="arrow" data-k="portalArrow"></div><div class="diamond"></div><span data-k="portalDist">0m</span></div>
      <div class="hud-flash" data-k="flash"></div>

      <div class="hud-hint" data-k="hint">CLICK TO CAPTURE MOUSE</div>
      <div class="hud-controls" data-k="controls">
        <span><kbd>WASD</kbd> MOVE</span><span><kbd>SHIFT</kbd> SPRINT</span><span><kbd>SPACE</kbd> DASH</span>
        <span><kbd>CLICK</kbd> FIRE</span><span><kbd>R</kbd> RELOAD</span>
      </div>
      <pre class="hud-debug" data-k="debug" hidden></pre>`
    root.appendChild(this.el)

    this.refs = {}
    for (const n of this.el.querySelectorAll('[data-k]')) this.refs[n.dataset.k] = n
    this.cache = {}
    this.debugVisible = false
  }

  show() {
    this.el.hidden = false
  }

  hide() {
    this.el.hidden = true
  }

  _set(key, text) {
    if (this.cache[key] === text) return
    this.cache[key] = text
    this.refs[key].textContent = text
  }

  _width(key, frac) {
    const v = `${Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 10}%`
    if (this.cache[key] === v) return
    this.cache[key] = v
    this.refs[key].style.width = v
  }

  _class(key, cls, on) {
    const k = `${key}.${cls}`
    if (this.cache[k] === on) return
    this.cache[k] = on
    this.refs[key].classList.toggle(cls, on)
  }

  update(s) {
    const whole = Math.ceil(s.timeLeft)
    this._set('timer', String(whole))
    const timer = this.refs.timer.parentElement
    if (this.cache.tU !== whole <= 10) { this.cache.tU = whole <= 10; timer.classList.toggle('urgent', whole <= 10) }
    if (this.cache.tC !== whole <= 5) { this.cache.tC = whole <= 5; timer.classList.toggle('critical', whole <= 5) }
    this._set('score', s.score.toLocaleString())
    this._set('high', s.high.toLocaleString())
    this._set('distance', String(Math.round(s.distance)))
    this.refs.hint.style.opacity = s.locked ? '0' : '1'

    this._width('hpFill', s.hp / s.maxHp)
    this._set('hpNum', String(Math.ceil(s.hp)))
    this._class('hpFill', 'low', s.hp / s.maxHp < 0.3)
    this._width('stFill', s.stamina / s.maxStamina)
    this._class('stFill', 'exhausted', s.exhausted)

    this._set('ammo', String(s.ammo))
    this._set('ammoMax', `/ ${s.maxAmmo}`)
    this._class('ammo', 'empty', s.ammo === 0)
    this._width('reloadFill', s.reloadProgress)
    this._class('weaponName', 'reloading', s.reloading)
    this._class('reloadText', 'on', s.reloading)

    // wanted level
    if (this.cache.wl !== s.wantedLevel) {
      this.cache.wl = s.wantedLevel
      this.refs.wanted.dataset.level = String(s.wantedLevel)
      const stars = this.refs.wanted.querySelectorAll('.stars i')
      stars.forEach((el, i) => el.classList.toggle('on', i < s.wantedLevel))
      this.refs.wantedLevel.textContent = String(s.wantedLevel)
    }
    this._width('heatFill', s.wantedProgress)
    this._class('wanted', 'zone', s.inZone)
    this._class('zone', 'on', s.inZone)

    // combo + cores
    this._class('combo', 'on', s.comboMult > 1 || s.comboFraction > 0)
    this._set('comboMult', `x${s.comboMult}`)
    this._class('combo', 'hot', s.comboMult >= 3)
    this._width('comboFill', s.comboFraction)
    this._set('cores', String(s.cores))

    // low-time urgency overlay
    this._class('lowtime', 'on', whole <= 10)
    this._class('lowtime', 'crit', whole <= 5)

    const ready = s.dashCooldown <= 0
    this._width('dashFill', ready ? 1 : 1 - s.dashCooldown / s.dashCooldownMax)
    this._class('dash', 'ready', ready)
  }

  /** Red vignette flash. Re-triggerable (restarts the CSS animation). */
  flashDamage() {
    const el = this.refs.damage
    el.classList.remove('flash')
    void el.offsetWidth
    el.classList.add('flash')
  }

  /** Big centre-screen message (wanted level up, etc). */
  banner(text, cls = '') {
    const el = this.refs.banner
    el.textContent = text
    el.className = 'hud-banner'
    void el.offsetWidth
    el.className = `hud-banner show ${cls}`
  }

  resetTransient() {
    this.refs.banner.className = 'hud-banner'
    this.refs.damage.classList.remove('flash')
    this.cache.wl = -1
  }

  /**
   * Portal marker in normalised device coords. On screen: a diamond over the portal.
   * Off screen: an arrow glued to the screen edge pointing the way.
   */
  setPortalMarker(ndcX, ndcY, onScreen, metres) {
    const el = this.refs.portal
    el.style.left = `${(ndcX * 0.5 + 0.5) * 100}%`
    el.style.top = `${(-ndcY * 0.5 + 0.5) * 100}%`
    el.classList.toggle('off', !onScreen)
    if (!onScreen) this.refs.portalArrow.style.transform = `rotate(${Math.atan2(-ndcY, ndcX) + Math.PI / 2}rad)`
    this._set('portalDist', `${Math.round(metres)}m`)
  }

  setPortalVisible(v) {
    this.refs.portal.style.display = v ? '' : 'none'
  }

  /** White flash (escape sequence). strength 0..1 */
  setFlash(strength) {
    this.refs.flash.style.opacity = String(strength)
  }

  hitMarker() {
    const el = this.refs.crosshair
    el.classList.remove('hit')
    void el.offsetWidth
    el.classList.add('hit')
  }

  hideControlsHint() {
    this.refs.controls.classList.add('fade')
  }

  showControlsHint() {
    this.refs.controls.classList.remove('fade')
  }

  setDebug(text) {
    if (this.debugVisible) this.refs.debug.textContent = text
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible
    this.refs.debug.hidden = !this.debugVisible
  }
}
