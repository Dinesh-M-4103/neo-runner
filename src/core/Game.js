import * as THREE from 'three'
import { CAMERA, CITY_SEED, GAME, PICKUPS, PLAYER, PORTAL, QUALITY, WANTED, WEAPON } from '../utils/Constants.js'
import { GameStateMachine, State } from './GameState.js'
import { InputManager } from './InputManager.js'
import { SaveManager } from './SaveManager.js'
import { AudioManager } from './AudioManager.js'
import { AssetManager } from './AssetManager.js'
import { TouchInput, touchSupported } from './TouchInput.js'
import { City } from '../world/CityGenerator.js'
import { Environment } from '../world/Environment.js'
import { RestrictedZones } from '../world/RestrictedZones.js'
import { ExtractionPortal } from '../world/ExtractionPortal.js'
import { Player } from '../player/Player.js'
import { PlayerController } from '../player/PlayerController.js'
import { CameraController } from '../player/CameraController.js'
import { Weapon } from '../player/Weapon.js'
import { EffectsManager } from '../effects/EffectsManager.js'
import { Rain } from '../effects/Rain.js'
import { PostProcessing } from '../effects/PostProcessing.js'
import { EnemyManager } from '../enemies/EnemyManager.js'
import { SpawnSystem } from '../systems/SpawnSystem.js'
import { WantedSystem } from '../systems/WantedSystem.js'
import { TimerSystem } from '../systems/TimerSystem.js'
import { ScoreSystem } from '../systems/ScoreSystem.js'
import { PickupManager } from '../pickups/PickupManager.js'
import { DamageNumbers } from '../ui/DamageNumbers.js'
import { Screen } from '../ui/Screen.js'
import { HUD } from '../ui/HUD.js'
import { MainMenu } from '../ui/MainMenu.js'
import { PauseMenu } from '../ui/PauseMenu.js'
import { GameOver } from '../ui/GameOver.js'
import { VictoryScreen } from '../ui/VictoryScreen.js'
import { Settings } from '../ui/Settings.js'

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()))

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas
    this.uiRoot = uiRoot
    this.sm = new GameStateMachine()
    this.save = new SaveManager()
    this.input = new InputManager(canvas)
    this.audio = new AudioManager(this.save.settings)
    this.assets = new AssetManager()
    this.clock = new THREE.Timer()
    this.fps = 60
    this.time = 0
    this.ready = false
    this.escape = null
    this._v = new THREE.Vector3()

    if (!this._initRenderer()) return

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(CAMERA.BASE_FOV, 1, CAMERA.NEAR, CAMERA.FAR)
    this._buildLoadingScreen()
    window.addEventListener('resize', () => this._resize())
    this._resize()

    // Browsers only allow audio after a user gesture: unlock on the first one.
    const unlock = () => this.audio.unlock()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
  }

  get quality() {
    return QUALITY[this.save.settings.quality] || QUALITY.high
  }

  _initRenderer() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' })
    } catch (err) {
      console.error('WebGL unavailable', err)
      const msg = document.createElement('div')
      msg.className = 'fatal'
      msg.innerHTML = '<h2>WEBGL UNAVAILABLE</h2><p>NEON RUNNER needs a browser with WebGL enabled.</p>'
      this.uiRoot.appendChild(msg)
      return false
    }
    const r = this.renderer
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio))
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.toneMappingExposure = 1.05
    return true
  }

  _buildLoadingScreen() {
    const el = document.createElement('div')
    el.className = 'screen loading visible'
    el.innerHTML = `
      <div class="loading-inner">
        <h1 class="title"><span>NEON</span> RUNNER</h1>
        <p class="loading-text">INITIALIZING SYSTEM...</p>
        <div class="bar"><div class="bar-fill"></div></div>
      </div>`
    this.uiRoot.appendChild(el)
    this.loadingEl = el
    this.loadingFill = el.querySelector('.bar-fill')
    this.loadingText = el.querySelector('.loading-text')
  }

  _progress(frac, text) {
    this.loadingFill.style.width = `${Math.round(frac * 100)}%`
    if (text) this.loadingText.textContent = text
  }

  /** Builds everything, yielding to the browser between steps so the loading bar actually paints. */
  async init() {
    if (!this.renderer) return
    this.sm.go(State.LOADING)
    try {
      await nextFrame()
      this._progress(0.1, 'INITIALIZING SYSTEM...')
      await nextFrame()

      this.environment = new Environment(this.scene, this.renderer)
      this._progress(0.3, 'GENERATING CITY...')
      await nextFrame()

      this.city = new City(CITY_SEED)
      this.scene.add(this.city.group)
      this._progress(0.6, 'CALIBRATING RUNNER...')
      await nextFrame()

      const collision = this.city.collision
      const start = this.city.getStartPosition()
      this.player = new Player()
      this.player.root.visible = false
      this.scene.add(this.player.root)
      this.controller = new PlayerController(this.player, this.input, collision)
      this.cameraCtl = new CameraController(this.camera, this.input, collision, this.save.settings)
      this.effects = new EffectsManager(this.scene)
      this.rain = new Rain(this.scene)
      this.weapon = new Weapon({ camera: this.camera, cameraCtl: this.cameraCtl, collision, effects: this.effects, player: this.player })
      this.enemies = new EnemyManager(this.scene, { collision, effects: this.effects })
      this.weapon.targets = this.enemies.all
      this.spawner = new SpawnSystem(this.enemies)
      this.wanted = new WantedSystem()
      this.zones = new RestrictedZones(this.scene, CITY_SEED, start)
      this.portal = new ExtractionPortal(this.scene, CITY_SEED, start, this.zones)
      this._progress(0.85, 'LOCATING EXTRACTION POINT...')
      await nextFrame()

      this.pickups = new PickupManager(this.scene, { collision, effects: this.effects, zones: this.zones, seed: CITY_SEED, startPos: start })
      this.timer = new TimerSystem(GAME.GAME_DURATION)
      this.score = new ScoreSystem(this.save)
      this.timer.onExpire = () => this._endRun()
      this.timer.onSecond = (s) => this._onSecond(s)

      // Post-processing is optional: if the composer can't be built the game renders directly.
      try {
        this.post = new PostProcessing(this.renderer, this.scene, this.camera)
      } catch (err) {
        console.warn('Post-processing unavailable, continuing without it', err)
        this.post = null
      }

      this._buildUI()
      this._wireEvents()
      this._bindEvents()
      this.applySettings()
      this._progress(1, 'READY')
      await nextFrame()
    } catch (err) {
      // Something failed during setup: surface it instead of a silent black screen.
      console.error(err)
      this.loadingText.textContent = 'INITIALIZATION FAILED - SEE CONSOLE'
      return
    }

    this.ready = true
    this.sm.go(State.MENU)
    this.loadingEl.classList.add('fade-out')
    setTimeout(() => this.loadingEl.remove(), 600)
    this.renderer.setAnimationLoop(() => this._frame())
  }

  // ---- settings -----------------------------------------------------------------------------

  /** Applies saved settings: graphics quality, post-processing, audio levels. Safe to call any time. */
  applySettings() {
    const q = this.quality
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio))
    if (this.post) {
      this.post.enabled = this.save.settings.postProcessing !== false
      this.post.setBloom(q.bloom)
    }
    this.audio.applyVolumes()
    this._resize()
    this.save.saveSettings()
  }

  // ---- event wiring -------------------------------------------------------------------------

  /** Gameplay -> feedback glue (effects, camera, HUD, audio). */
  _wireEvents() {
    const p = this.player
    const audio = this.audio
    const post = () => this.post

    p.health.onDamage = () => {
      this.cameraCtl.addShake(0.6)
      this.hud.flashDamage()
      this.score.breakCombo()
      audio.play('damage')
      if (post()) post().kickAberration(0.012)
    }
    p.health.onDeath = () => this._endRun()

    this.controller.onDash = (x, z) => {
      this.cameraCtl.fovKick = 14
      this.cameraCtl.addShake(0.25)
      this.effects.dashBurst(x, z)
      audio.play('dash')
      if (post()) post().kickAberration(0.009)
    }
    this.controller.onDashTick = (x, z) => this.effects.dashTrail(x, z)

    this.weapon.onFire = () => audio.play('weapon')
    this.weapon.onHitTarget = () => {
      this.hud.hitMarker()
      audio.play('hit')
    }
    this.weapon.onReloadStart = () => audio.play('reload')
    this.weapon.onDryFire = () => audio.play('dry')

    // Enemies -> score / feedback
    this.enemies.ctx.onShot = (d) => audio.play(`shot_${d.type}`, { x: d.position.x, z: d.position.z })
    this.enemies.onDamaged = (d, amount, point) => {
      if (point) this.damageNumbers.show(point.x, point.y + 0.4, point.z, String(amount))
    }
    this.enemies.onKilled = (d) => {
      const pos = d.position
      const { points, mult } = this.score.award(d.cfg.score)
      this.wanted.addHeat(WANTED.KILL[d.type])
      if (Math.random() < PICKUPS.DROP_CHANCE) this.pickups.spawnHealth(pos.x, pos.z)
      const scale = d.type === 'heavy' ? 2.2 : d.type === 'combat' ? 1.4 : 1
      this.effects.explosion(pos.x, pos.y, pos.z, scale)
      audio.play('explosion', { x: pos.x, z: pos.z, scale, volume: 1.2 })
      const dist = Math.hypot(pos.x - this.player.position.x, pos.z - this.player.position.z)
      this.cameraCtl.addShake(Math.max(0, 1 - dist / 45) * (d.type === 'heavy' ? 0.7 : 0.35))
      this.damageNumbers.show(pos.x, pos.y + 1, pos.z, `+${points}${mult > 1 ? ` x${mult}` : ''}`, 'kill')
    }
    this.enemies.onPlayerHit = (damage) => {
      if (this.damagePlayer(damage)) {
        this.damageNumbers.show(this.player.position.x, 2.4, this.player.position.z, `-${damage}`, 'player')
      }
    }

    // Pickups
    this.pickups.onCollect = (e) => {
      if (e.kind === 1) {
        this.player.health.heal(e.value)
        this.damageNumbers.show(e.x, 2.0, e.z, `+${e.value} HP`, 'heal')
        audio.play('heal')
        return
      }
      const { points, mult } = this.score.award(e.value)
      this.score.cores++
      this.wanted.addHeat(e.rich ? WANTED.RICH_CORE : WANTED.CORE)
      this.damageNumbers.show(e.x, 2.0, e.z, `+${points}${mult > 1 ? ` x${mult}` : ''}`, e.rich ? 'rich' : 'pickup')
      audio.play('pickup', { rich: e.rich })
    }

    // Wanted level up: banner + shake + siren. Drones react through SpawnSystem.
    this.wanted.onLevelUp = (level) => {
      this.hud.banner(`WANTED LEVEL ${level}`, level >= 4 ? 'danger' : '')
      this.cameraCtl.addShake(0.35)
      audio.play('wanted')
    }
  }

  /** Public damage entry point. Returns true if it landed. */
  damagePlayer(amount) {
    if (!this.sm.is(State.PLAYING)) return false
    return this.player.health.damage(amount)
  }

  _onSecond(whole) {
    if (!this.sm.is(State.PLAYING)) return
    if (whole === 10) this.hud.banner('10 SECONDS', 'danger')
    if (whole === 5) this.hud.banner('5', 'danger')
    if (whole <= 3 && whole > 0) {
      this.audio.play('alarm')
      this.cameraCtl.addShake(0.15)
    } else if (whole <= 5 && whole > 3) this.audio.play('tick', { pitch: 1250 })
    else if (whole <= 10 && whole > 5) this.audio.play('tick', { pitch: 880 })
  }

  _buildUI() {
    Screen.onClick = () => this.audio.play('click')
    this.hud = new HUD(this.uiRoot)
    this.damageNumbers = new DamageNumbers(this.uiRoot, this.camera)
    this.menu = new MainMenu(this.uiRoot, { onStart: () => this.startRun(), onSettings: () => this.settingsScreen.show() })
    this.pauseMenu = new PauseMenu(this.uiRoot, {
      onResume: () => this.resume(),
      onSettings: () => this.settingsScreen.show(),
      onRestart: () => this.startRun(),
      onQuit: () => this.quitToMenu(),
    })
    this.gameOver = new GameOver(this.uiRoot, { onRetry: () => this.startRun(), onMenu: () => this.quitToMenu() })
    this.victory = new VictoryScreen(this.uiRoot, { onRetry: () => this.startRun(), onMenu: () => this.quitToMenu() })
    this.settingsScreen = new Settings(this.uiRoot, this.save.settings, {
      onChange: () => this.applySettings(),
      onBack: () => this.settingsScreen.hide(),
    })
    this.touch = touchSupported() ? new TouchInput(this.uiRoot, this.input, { onPause: () => this.pause() }) : null
  }

  _bindEvents() {
    this.input.onEscape = () => {
      if (this.sm.is(State.PLAYING)) this.pause()
    }
    this.input.onLockChange = (locked) => {
      if (!locked && this.sm.is(State.PLAYING)) this.pause()
    }
    this.canvas.addEventListener('mousedown', () => {
      if (this.sm.is(State.PLAYING) && !this.input.locked) this.input.requestLock()
    })
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault()
        this.hud.toggleDebug()
      }
      // Debug helper: hurt yourself to test damage feedback (only while the debug overlay is on)
      if (e.code === 'F4' && this.hud.debugVisible) {
        e.preventDefault()
        this.damagePlayer(15)
      }
    })
    this.sm.onChange((state) => this._onState(state))
    this._onState(State.MENU)
  }

  _onState(state) {
    const playing = state === State.PLAYING
    const show = (screen, on) => (on ? screen.show() : screen.hide())
    show(this.menu, state === State.MENU)
    show(this.pauseMenu, state === State.PAUSED)
    show(this.gameOver, state === State.GAME_OVER)
    if (state !== State.VICTORY) this.victory.hide()
    if (state !== State.PAUSED && state !== State.MENU) this.settingsScreen.hide()

    if (state === State.MENU) this.hud.hide()
    else this.hud.show()
    this.player.root.visible = state !== State.MENU
    this.hud.el.classList.toggle('dim', !playing)
    this.hud.setPortalVisible(playing)
    if (this.touch) this.touch.setVisible(playing)

    if (state === State.MENU) {
      this.audio.resume()
      this.audio.setMusicIntensity(0)
      this.audio.silencePortal()
    }
    if (state === State.PAUSED) this.audio.suspend()
    else if (this.audio.ctx) this.audio.resume()
  }

  // ---- run lifecycle ------------------------------------------------------------------------

  startRun() {
    this.audio.unlock()
    const start = this.city.getStartPosition()
    this.player.reset()
    this.player.position.x = start.x
    this.player.position.z = start.z
    this.player.root.scale.setScalar(1)
    this.player.syncTransform()
    this.timer.reset()
    this.score.reset()
    this.weapon.reset()
    this.enemies.reset()
    this.spawner.reset()
    this.wanted.reset()
    this.pickups.reset()
    this.portal.pulse = 1
    this.escape = null
    this.hud.resetTransient()
    this.hud.setFlash(0)
    this.damageNumbers.clear()
    this.cameraCtl.reset(this.player)
    this.input.reset()
    this._musicLevel = -1

    // MENU / PAUSED / GAME_OVER / VICTORY -> PLAYING are all legal transitions
    this.sm.go(State.PLAYING)
    this.input.requestLock()

    if (!this.save.hasSeenControls()) {
      this.hud.showControlsHint()
      this.save.markControlsSeen()
      clearTimeout(this._hintTimer)
      this._hintTimer = setTimeout(() => this.hud.hideControlsHint(), 5000)
    } else {
      this.hud.hideControlsHint()
    }
  }

  pause() {
    if (this.sm.go(State.PAUSED)) this.input.releaseLock()
  }

  resume() {
    if (this.sm.go(State.PLAYING)) {
      this.input.reset()
      this.input.requestLock()
    }
  }

  quitToMenu() {
    this.input.releaseLock()
    this.escape = null
    this.hud.setFlash(0)
    this.sm.go(State.MENU)
  }

  _endRun() {
    if (!this.sm.is(State.PLAYING)) return
    const record = this.score.commit()
    this.gameOver.setStats({
      time: this.timer.elapsed,
      distance: this.player.distance,
      kills: this.enemies.kills,
      cores: this.score.cores,
      score: this.score.score,
      high: this.save.highScore,
      record,
    })
    this.input.releaseLock()
    this.audio.silencePortal()
    this.audio.setMusicIntensity(0)
    this.audio.play('gameover')
    this.sm.go(State.GAME_OVER)
  }

  /** Player touched the portal: slow-mo, drones detonate, camera orbits the gate, flash, then results. */
  _beginEscape() {
    if (!this.sm.go(State.VICTORY)) return
    const p = this.player
    this.input.releaseLock()
    p.health.invuln = 999
    p.sprinting = false
    p.dashing = false

    // every drone detonates in the shockwave
    for (const d of this.enemies.all) {
      if (!d.active) continue
      const pos = d.position
      this.effects.explosion(pos.x, pos.y, pos.z, 1.2)
      d.deactivate()
    }
    this.enemies.projectiles.clear()

    const timeLeft = this.timer.remaining
    const bonus = PORTAL.EXTRACTION_BONUS + Math.floor(timeLeft) * PORTAL.TIME_BONUS_PER_SEC
    this.score.score += bonus
    const record = this.score.commit()
    this.escape = { t: 0, shown: false, burst: false, timeLeft, bonus, record }
    this.portal.pulse = 2.4
    this.cameraCtl.addShake(0.6)
    this.audio.silencePortal()
    this.audio.play('portal')
    this.audio.setMusicIntensity(1)
  }

  _updateEscape(dt) {
    const e = this.escape
    if (!e) return
    e.t += dt
    const slow = e.t < 0.45 ? 0.4 : 1 // brief slow-motion hit
    const sdt = dt * slow
    const p = this.player
    const pp = this.portal.position

    // the runner dives into the gate, shrinks and vanishes in a burst
    const dx = pp.x - p.position.x, dz = pp.z - p.position.z
    const d = Math.hypot(dx, dz)
    if (d > 0.6 && e.t < 1.4) {
      p.velocity.x = (dx / d) * 9
      p.velocity.z = (dz / d) * 9
      p.position.x += p.velocity.x * sdt
      p.position.z += p.velocity.z * sdt
      p.facing = Math.atan2(dx, dz)
    } else {
      p.velocity.x = p.velocity.z = 0
    }
    if (e.t > 1.0) p.root.scale.setScalar(Math.max(0.001, 1 - (e.t - 1.0) / 0.5))
    p.syncTransform()
    p.animate(sdt)
    if (e.t > 1.45 && !e.burst) {
      e.burst = true
      p.root.visible = false
      this.effects.explosion(pp.x, 4.2, pp.z, 2.4, 0x00f0ff)
      this.effects.explosion(pp.x, 4.2, pp.z, 1.6, 0xff2bd6)
      this.cameraCtl.addShake(0.8)
    }

    // white flash peak around 1.45s
    const f = e.t < 1.3 ? 0 : e.t < 1.45 ? (e.t - 1.3) / 0.15 : Math.max(0, 1 - (e.t - 1.45) / 0.9)
    this.hud.setFlash(f)

    this.portal.update(sdt, this.effects, p.position.x, p.position.z)
    this.cameraCtl.updateEscape(dt, e.t, pp.x, pp.z)
    this.effects.update(sdt)

    if (e.t >= PORTAL.ESCAPE_DURATION && !e.shown) {
      e.shown = true
      this.victory.setStats({
        timeLeft: e.timeLeft, distance: p.distance, kills: this.enemies.kills, cores: this.score.cores,
        bonus: e.bonus, score: this.score.score, high: this.save.highScore, record: e.record,
      })
      this.victory.show()
      this.audio.play('victory')
    }
  }

  // ---- main loop ----------------------------------------------------------------------------

  _frame() {
    this.clock.update()
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.time += dt
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.05
    const st = this.sm.current
    const p = this.player
    let effectsDt = dt

    if (st === State.PLAYING) {
      this._updatePlaying(dt)
    } else if (st === State.VICTORY) {
      this._updateEscape(dt)
      effectsDt = 0 // _updateEscape advances effects itself (slow-mo aware)
    } else if (st === State.MENU) {
      this.cameraCtl.updateMenu(dt)
      this.audio.setListener(this.camera.position.x, this.camera.position.z, 1, 0)
    } else if (st === State.PAUSED) {
      effectsDt = 0 // world frozen
    }

    // always-on atmosphere (frozen while paused)
    if (st !== State.PAUSED) {
      const intense = st === State.PLAYING ? 0.12 * this.wanted.level + (this.timer.remaining <= 15 ? 0.2 : 0) : 0
      this.rain.setTarget(0.55 + intense)
      this.rain.update(dt, this.camera, p.velocity.x, p.velocity.z, this.quality.rain)
      this.city.update(this.time)
      const threat = st === State.PLAYING ? Math.max(this.wanted.level / 5 * 0.85, this.timer.remaining <= 10 ? 1 : 0) : 0
      this.environment.setThreat(threat, dt)
    }
    if (effectsDt > 0) this.effects.update(effectsDt)
    this.effects.setViewport(this.renderer.domElement.height, this.camera.fov)
    this.city.updateVisibility(this.camera.position, this.quality.viewDistance)

    this._render(dt)

    if (this.hud.debugVisible) {
      const info = this.renderer.info
      this.hud.setDebug(
        `FPS        ${this.fps.toFixed(0)}\nDRAW CALLS ${info.render.calls}\nTRIANGLES  ${info.render.triangles}\nENEMIES    ${this.enemies.activeCount}\n` +
          `WANTED     ${this.wanted.level} (heat ${this.wanted.heat.toFixed(1)})\nPRESSURE   ${this.spawner.difficulty.pressure}\nQUALITY    ${this.save.settings.quality}`
      )
    }
    this.input.endFrame()
  }

  _render(dt) {
    if (this.post && this.post.enabled) {
      const post = this.post
      // vignette / alert reacts to danger: low time and low health
      const playing = this.sm.is(State.PLAYING)
      let alert = 0
      if (playing) {
        const tl = this.timer.remaining
        if (tl <= 10) alert = 0.35 + 0.25 * Math.sin(this.time * (tl <= 5 ? 12 : 6))
        if (this.player.health.fraction < 0.3) alert = Math.max(alert, 0.3 + 0.15 * Math.sin(this.time * 7))
      }
      post.alert += (alert - post.alert) * Math.min(1, 8 * dt)
      post.render(dt, this.time)
    } else {
      this.renderer.render(this.scene, this.camera)
    }
  }

  _updatePlaying(dt) {
    const p = this.player
    this.timer.update(dt)
    if (!this.sm.is(State.PLAYING)) return // timer expiry ended the run
    this.score.update(dt)
    p.health.update(dt)
    const aim = this.weapon.isAiming ? Math.atan2(-Math.sin(this.cameraCtl.yaw), -Math.cos(this.cameraCtl.yaw)) : null
    this.controller.update(dt, this.cameraCtl.yaw, aim)
    this.cameraCtl.update(dt, p)
    // weapon reads the camera that was just updated so the shot matches the crosshair
    this.camera.updateMatrixWorld()
    const fire = this.input.locked && this.input.mouseDown(0) && !p.dashing
    this.weapon.update(dt, fire, this.input.wasPressed('KeyR'))

    const inZone = this.zones.contains(p.position.x, p.position.z)
    this.wanted.update(dt, inZone)
    this.zones.update(dt, inZone)
    this.spawner.update(dt, this.wanted.level, this.timer.remaining, p)
    this.enemies.update(dt, p)
    this.pickups.update(dt, p)
    this.portal.update(dt, this.effects, p.position.x, p.position.z)
    if (p.sprinting) this.effects.sprintDust(dt, p.position.x, p.position.z)
    this.environment.update(p.position)

    // audio listener + proximity hum + music intensity
    const yaw = this.cameraCtl.yaw
    this.audio.setListener(p.position.x, p.position.z, Math.cos(yaw), -Math.sin(yaw))
    const portalDist = this.portal.distanceTo(p.position.x, p.position.z)
    this.audio.setPortalProximity(portalDist)
    const level = this.timer.remaining <= 10 ? Math.max(4, this.wanted.level) : this.wanted.level
    if (level !== this._musicLevel) {
      this._musicLevel = level
      this.audio.setMusicIntensity(level)
    }

    // reached the extraction portal?
    if (this.portal.reached(p.position.x, p.position.z)) {
      this._beginEscape()
      return
    }

    this._updatePortalMarker(portalDist)
    const w = this.weapon
    this.hud.update({
      timeLeft: this.timer.remaining,
      score: this.score.score,
      high: this.score.highScore,
      distance: p.distance,
      locked: this.input.locked,
      hp: p.health.hp, maxHp: p.health.max,
      stamina: p.stamina, maxStamina: PLAYER.MAX_STAMINA, exhausted: p.exhausted,
      ammo: w.ammo, maxAmmo: WEAPON.MAG_SIZE, reloading: w.reloading, reloadProgress: w.reloadProgress,
      dashCooldown: Math.max(0, p.dashCooldown), dashCooldownMax: PLAYER.DASH_COOLDOWN,
      wantedLevel: this.wanted.level, wantedProgress: this.wanted.progress, inZone,
      comboMult: this.score.multiplier, comboFraction: this.score.comboFraction, cores: this.score.cores,
    })
  }

  /** Projects the portal to the screen: a diamond when visible, an edge arrow otherwise. */
  _updatePortalMarker(distance) {
    const pp = this.portal.position
    const v = this._v.set(pp.x, 6, pp.z).project(this.camera)
    let nx = v.x, ny = v.y
    const behind = v.z > 1
    if (behind) { nx = -nx; ny = -ny }
    const onScreen = !behind && Math.abs(nx) < 0.92 && Math.abs(ny) < 0.82
    if (!onScreen) {
      if (Math.abs(nx) < 0.02 && Math.abs(ny) < 0.02) ny = -1
      const m = Math.max(Math.abs(nx) / 0.9, Math.abs(ny) / 0.78, 1e-4)
      nx /= m
      ny /= m
    }
    this.hud.setPortalMarker(nx, ny, onScreen, distance)
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.post) this.post.setSize(w, h, this.renderer.getPixelRatio())
    if (this.effects) this.effects.setViewport(h * this.renderer.getPixelRatio(), this.camera.fov)
  }
}
