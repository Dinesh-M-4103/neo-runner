import { MusicEngine } from './MusicEngine.js'

/**
 * Web Audio manager with fully synthesised placeholder sounds (no files required).
 * - master / sfx / music gain stages (configurable, saved in settings)
 * - positional sfx: distance attenuation + stereo pan from the listener
 * - every public method is a safe no-op if audio is unavailable or not yet unlocked
 */
export class AudioManager {
  constructor(settings) {
    this.settings = settings
    this.ctx = null
    this.ok = false
    this.listener = { x: 0, z: 0, rx: 1, rz: 0 }
    this.music = null
    this.hum = null
  }

  /** Must be called from a user gesture (browser autoplay policy). Safe to call repeatedly. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this._paused) this.ctx.resume().catch(() => {})
      return
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      const ctx = (this.ctx = new AC())
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14
      comp.ratio.value = 6
      comp.connect(ctx.destination)
      this.master = ctx.createGain()
      this.sfxBus = ctx.createGain()
      this.musicBus = ctx.createGain()
      this.sfxBus.connect(this.master)
      this.musicBus.connect(this.master)
      this.master.connect(comp)

      // shared white-noise buffer
      const len = ctx.sampleRate
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = this.noise.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1

      this.music = new MusicEngine(ctx, this.musicBus, this.noise)
      this._buildPortalHum()
      this.ok = true
      this.applyVolumes()
      this.music.start()
    } catch (err) {
      console.warn('Audio unavailable, continuing silently', err)
      this.ok = false
    }
  }

  applyVolumes() {
    if (!this.ok) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.settings.masterVolume, t, 0.03)
    this.sfxBus.gain.setTargetAtTime(this.settings.sfxVolume, t, 0.03)
    this.musicBus.gain.setTargetAtTime(this.settings.musicVolume * 0.7, t, 0.03)
  }

  suspend() {
    this._paused = true
    if (this.ok && this.ctx.state === 'running') this.ctx.suspend().catch(() => {})
  }

  resume() {
    this._paused = false
    if (this.ok && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
  }

  setListener(x, z, rx, rz) {
    const l = this.listener
    l.x = x; l.z = z; l.rx = rx; l.rz = rz
  }

  setMusicIntensity(level) {
    if (this.ok) this.music.setIntensity(level)
  }

  // ---- building blocks -----------------------------------------------------------------------
  _out(opts) {
    // returns the node sounds should connect to (with optional positional gain + pan)
    const ctx = this.ctx
    let node = this.sfxBus
    if (opts && opts.x !== undefined) {
      const dx = opts.x - this.listener.x, dz = opts.z - this.listener.z
      const d = Math.hypot(dx, dz)
      const g = ctx.createGain()
      g.gain.value = (opts.volume ?? 1) / (1 + d / 22)
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
      if (pan) {
        pan.pan.value = Math.max(-1, Math.min(1, ((dx * this.listener.rx + dz * this.listener.rz) / (d || 1)) * 0.85))
        g.connect(pan).connect(this.sfxBus)
      } else {
        g.connect(this.sfxBus)
      }
      node = g
    } else if (opts && opts.volume !== undefined) {
      const g = ctx.createGain()
      g.gain.value = opts.volume
      g.connect(this.sfxBus)
      node = g
    }
    return node
  }

  _tone(out, { type = 'sine', f1, f2 = f1, dur = 0.15, vol = 0.3, attack = 0.004, delay = 0, detune = 0 }) {
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f1, t)
    if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur)
    o.detune.value = detune
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  _noise(out, { type = 'lowpass', f1 = 1000, f2 = f1, q = 1, dur = 0.2, vol = 0.3, attack = 0.002, delay = 0 }) {
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.Q.value = q
    f.frequency.setValueAtTime(f1, t)
    if (f2 !== f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(out)
    src.start(t, Math.random() * 0.4)
    src.stop(t + dur + 0.05)
  }

  // ---- sound library -------------------------------------------------------------------------
  /** play(name, opts?) opts: { x, z } for positional sounds, { volume }, { pitch } */
  play(name, opts) {
    if (!this.ok || this.ctx.state !== 'running') return
    const fn = SOUNDS[name]
    if (!fn) return
    try {
      fn(this, this._out(opts), opts || {})
    } catch (err) {
      console.warn('sfx failed', name, err)
    }
  }

  // Continuous hum that swells as you approach the portal (distance in metres)
  _buildPortalHum() {
    const ctx = this.ctx
    const g = ctx.createGain()
    g.gain.value = 0
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 600
    f.connect(g).connect(this.sfxBus)
    const oscs = [110, 165.5, 221].map((fr, i) => {
      const o = ctx.createOscillator()
      o.type = i === 0 ? 'sawtooth' : 'sine'
      o.frequency.value = fr
      o.connect(f)
      o.start()
      return o
    })
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.6
    const lg = ctx.createGain()
    lg.gain.value = 18
    lfo.connect(lg).connect(oscs[1].frequency)
    lfo.start()
    this.hum = { g }
  }

  setPortalProximity(distance) {
    if (!this.ok || !this.hum) return
    const near = Math.max(0, 1 - distance / 110)
    this.hum.g.gain.setTargetAtTime(near * near * 0.22, this.ctx.currentTime, 0.2)
  }

  silencePortal() {
    if (this.ok && this.hum) this.hum.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1)
  }
}

// name -> (audio, out, opts)
const SOUNDS = {
  weapon: (a, out) => {
    a._tone(out, { type: 'sawtooth', f1: 1100, f2: 180, dur: 0.1, vol: 0.2 })
    a._tone(out, { type: 'square', f1: 2200, f2: 700, dur: 0.045, vol: 0.08 })
    a._noise(out, { type: 'highpass', f1: 3500, dur: 0.05, vol: 0.12 })
  },
  hit: (a, out) => a._tone(out, { type: 'triangle', f1: 1500, f2: 900, dur: 0.05, vol: 0.18 }),
  reload: (a, out) => {
    a._noise(out, { type: 'bandpass', f1: 2500, q: 4, dur: 0.05, vol: 0.2 })
    a._tone(out, { type: 'square', f1: 500, f2: 800, dur: 0.12, vol: 0.08, delay: 0.5 })
    a._noise(out, { type: 'bandpass', f1: 3500, q: 4, dur: 0.06, vol: 0.25, delay: 1.1 })
  },
  dry: (a, out) => a._noise(out, { type: 'bandpass', f1: 1800, q: 6, dur: 0.04, vol: 0.18 }),
  shot_scout: (a, out) => a._tone(out, { type: 'square', f1: 760, f2: 320, dur: 0.12, vol: 0.13 }),
  shot_combat: (a, out) => {
    a._tone(out, { type: 'sawtooth', f1: 460, f2: 160, dur: 0.1, vol: 0.14 })
    a._noise(out, { type: 'highpass', f1: 2500, dur: 0.04, vol: 0.06 })
  },
  shot_heavy: (a, out) => {
    a._tone(out, { type: 'sawtooth', f1: 150, f2: 45, dur: 0.38, vol: 0.3 })
    a._noise(out, { type: 'lowpass', f1: 1200, f2: 150, dur: 0.3, vol: 0.2 })
  },
  explosion: (a, out, o) => {
    const s = o.scale || 1
    a._noise(out, { type: 'lowpass', f1: 2200, f2: 90, dur: 0.55 * s, vol: 0.45 })
    a._tone(out, { type: 'sine', f1: 130, f2: 32, dur: 0.55 * s, vol: 0.55 })
  },
  damage: (a, out) => {
    a._tone(out, { type: 'sine', f1: 170, f2: 40, dur: 0.3, vol: 0.5 })
    a._tone(out, { type: 'sawtooth', f1: 95, f2: 55, dur: 0.22, vol: 0.2 })
    a._noise(out, { type: 'bandpass', f1: 900, q: 1, dur: 0.18, vol: 0.25 })
  },
  dash: (a, out) => {
    a._noise(out, { type: 'bandpass', f1: 400, f2: 4200, q: 2, dur: 0.24, vol: 0.38 })
    a._tone(out, { type: 'sine', f1: 280, f2: 950, dur: 0.2, vol: 0.14 })
  },
  pickup: (a, out, o) => {
    const base = o.rich ? 880 : 660
    ;[1, 1.333, 2].forEach((m, i) => a._tone(out, { type: 'sine', f1: base * m, dur: 0.12, vol: 0.2, delay: i * 0.055 }))
  },
  heal: (a, out) => {
    ;[523, 659, 784].forEach((f, i) => a._tone(out, { type: 'triangle', f1: f, dur: 0.2, vol: 0.18, delay: i * 0.07 }))
  },
  click: (a, out) => a._tone(out, { type: 'square', f1: 1300, f2: 800, dur: 0.045, vol: 0.1 }),
  tick: (a, out, o) => a._tone(out, { type: 'sine', f1: o.pitch || 880, dur: 0.09, vol: 0.22 }),
  alarm: (a, out) => {
    a._tone(out, { type: 'sawtooth', f1: 640, dur: 0.16, vol: 0.18 })
    a._tone(out, { type: 'sawtooth', f1: 880, dur: 0.16, vol: 0.18, delay: 0.17 })
  },
  wanted: (a, out) => {
    for (let i = 0; i < 3; i++) a._tone(out, { type: 'square', f1: i % 2 ? 900 : 650, dur: 0.14, vol: 0.14, delay: i * 0.15 })
  },
  portal: (a, out) => {
    a._noise(out, { type: 'bandpass', f1: 200, f2: 6000, q: 3, dur: 1.6, vol: 0.45, attack: 0.5 })
    ;[220, 330, 440, 660].forEach((f, i) => a._tone(out, { type: 'sine', f1: f, f2: f * 2, dur: 1.8, vol: 0.14, attack: 0.5, delay: i * 0.05 }))
  },
  gameover: (a, out) => {
    ;[440, 349, 262, 196].forEach((f, i) => a._tone(out, { type: 'sawtooth', f1: f, f2: f * 0.8, dur: 0.5, vol: 0.2, delay: i * 0.22 }))
    a._noise(out, { type: 'lowpass', f1: 600, f2: 60, dur: 1.2, vol: 0.3 })
  },
  victory: (a, out) => {
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => {
      a._tone(out, { type: 'triangle', f1: f, dur: 0.6, vol: 0.2, delay: 0.1 + i * 0.12 })
      a._tone(out, { type: 'sine', f1: f * 2, dur: 0.5, vol: 0.07, delay: 0.1 + i * 0.12 })
    })
  },
}
