import * as THREE from 'three'
import { CAMERA, CITY_SEED, GAME, PLAYER, WEAPON } from '../utils/Constants.js'
import { GameStateMachine, State } from './GameState.js'
import { InputManager } from './InputManager.js'
import { SaveManager } from './SaveManager.js'
import { City } from '../world/CityGenerator.js'
import { Environment } from '../world/Environment.js'
import { Player } from '../player/Player.js'
import { PlayerController } from '../player/PlayerController.js'
import { CameraController } from '../player/CameraController.js'
import { Weapon } from '../player/Weapon.js'
import { EffectsManager } from '../effects/EffectsManager.js'
import { TimerSystem } from '../systems/TimerSystem.js'
import { ScoreSystem } from '../systems/ScoreSystem.js'
import { HUD } from '../ui/HUD.js'
import { MainMenu } from '../ui/MainMenu.js'
import { PauseMenu } from '../ui/PauseMenu.js'
import { GameOver } from '../ui/GameOver.js'

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()))

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas
    this.uiRoot = uiRoot
    this.sm = new GameStateMachine()
    this.save = new SaveManager()
    this.input = new InputManager(canvas)
    this.clock = new THREE.Timer()
    this.fps = 60
    this.ready = false

    if (!this._initRenderer()) return

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(CAMERA.BASE_FOV, 1, CAMERA.NEAR, CAMERA.FAR)
    this._buildLoadingScreen()
    window.addEventListener('resize', () => this._resize())
    this._resize()
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
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2))
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

      this.environment = new Environment(this.scene)
      this._progress(0.3, 'GENERATING CITY...')
      await nextFrame()

      this.city = new City(CITY_SEED)
      this.scene.add(this.city.group)
      this._progress(0.7, 'CALIBRATING RUNNER...')
      await nextFrame()

      this.player = new Player()
      this.player.root.visible = false
      this.scene.add(this.player.root)
      this.controller = new PlayerController(this.player, this.input, this.city.collision)
      this.cameraCtl = new CameraController(this.camera, this.input, this.city.collision, this.save.settings)
      this.effects = new EffectsManager(this.scene)
      this.weapon = new Weapon({
        camera: this.camera, cameraCtl: this.cameraCtl, collision: this.city.collision,
        effects: this.effects, player: this.player,
      })
      this._wirePlayerEvents()
      this.timer = new TimerSystem(GAME.GAME_DURATION)
      this.score = new ScoreSystem(this.save)
      this.timer.onExpire = () => this._endRun()
      this._buildUI()
      this._bindEvents()
      this._progress(1, 'READY')
      await nextFrame()
    } catch (err) {
      // Something in city/player setup failed: surface it instead of a silent black screen.
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

  /** Gameplay -> feedback glue (effects, camera, HUD). Audio hooks slot in here in a later phase. */
  _wirePlayerEvents() {
    const p = this.player
    p.health.onDamage = () => {
      this.cameraCtl.addShake(0.6)
      this.hud.flashDamage()
    }
    p.health.onDeath = () => this._endRun()

    this.controller.onDash = (x, z) => {
      this.cameraCtl.fovKick = 14
      this.cameraCtl.addShake(0.25)
      this.effects.dashBurst(x, z)
    }
    this.controller.onDashTick = (x, z) => this.effects.dashTrail(x, z)

    this.weapon.onHitTarget = () => this.hud.hitMarker()
  }

  /** Public damage entry point (drones will call this in Phase 3). Returns true if it landed. */
  damagePlayer(amount) {
    if (!this.sm.is(State.PLAYING)) return false
    return this.player.health.damage(amount)
  }

  _buildUI() {
    this.hud = new HUD(this.uiRoot)
    this.menu = new MainMenu(this.uiRoot, { onStart: () => this.startRun() })
    this.pauseMenu = new PauseMenu(this.uiRoot, {
      onResume: () => this.resume(),
      onRestart: () => this.startRun(),
      onQuit: () => this.quitToMenu(),
    })
    this.gameOver = new GameOver(this.uiRoot, {
      onRetry: () => this.startRun(),
      onMenu: () => this.quitToMenu(),
    })
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
    this.menu.el.hidden = state !== State.MENU
    if (state === State.MENU) this.menu.show()
    else this.menu.hide()
    if (state === State.PAUSED) this.pauseMenu.show()
    else this.pauseMenu.hide()
    if (state === State.GAME_OVER) this.gameOver.show()
    else this.gameOver.hide()

    if (state === State.MENU) this.hud.hide()
    else this.hud.show()
    this.player.root.visible = state !== State.MENU
    if (playing) this.hud.el.classList.remove('dim')
    else this.hud.el.classList.add('dim')
  }

  // ---- run lifecycle ----------------------------------------------------------------------

  startRun() {
    const start = this.city.getStartPosition()
    this.player.position.x = start.x
    this.player.position.z = start.z
    this.player.reset()
    this.player.position.x = start.x
    this.player.position.z = start.z
    this.player.syncTransform()
    this.timer.reset()
    this.score.reset()
    this.weapon.reset()
    this.cameraCtl.reset(this.player)
    this.input.reset()

    // Transition (MENU / PAUSED / GAME_OVER -> PLAYING are all legal)
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
    this.sm.go(State.MENU)
  }

  _endRun() {
    const record = this.score.commit()
    this.gameOver.setStats({
      time: this.timer.elapsed,
      distance: this.player.distance,
      score: this.score.score,
      high: this.save.highScore,
      record,
    })
    this.input.releaseLock()
    this.sm.go(State.GAME_OVER)
  }

  // ---- main loop --------------------------------------------------------------------------

  _frame() {
    this.clock.update()
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.05

    if (this.sm.is(State.PLAYING)) {
      this.timer.update(dt)
      this.score.update(dt)
      const p = this.player
      p.health.update(dt)
      const aim = this.weapon.isAiming ? Math.atan2(-Math.sin(this.cameraCtl.yaw), -Math.cos(this.cameraCtl.yaw)) : null
      this.controller.update(dt, this.cameraCtl.yaw, aim)
      this.cameraCtl.update(dt, p)
      // weapon reads the camera that was just updated so the shot matches the crosshair
      this.camera.updateMatrixWorld()
      const fire = this.input.locked && this.input.mouseDown(0) && !p.dashing
      this.weapon.update(dt, fire, this.input.wasPressed('KeyR'))
      if (p.sprinting) this.effects.sprintDust(dt, p.position.x, p.position.z)
      this.environment.update(p.position)
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
      })
    } else if (this.sm.is(State.MENU)) {
      this.cameraCtl.updateMenu(dt)
    }

    this.effects.update(dt)
    this.effects.setViewport(this.renderer.domElement.height, this.camera.fov)
    this.city.updateVisibility(this.camera.position)
    this.renderer.render(this.scene, this.camera)

    if (this.hud.debugVisible) {
      const info = this.renderer.info
      this.hud.setDebug(
        `FPS        ${this.fps.toFixed(0)}\nDRAW CALLS ${info.render.calls}\nTRIANGLES  ${info.render.triangles}\nENEMIES    0`
      )
    }
    this.input.endFrame()
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.effects) this.effects.setViewport(h * this.renderer.getPixelRatio(), this.camera.fov)
  }
}
