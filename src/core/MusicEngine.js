// Procedural looping music (Web Audio step sequencer). No audio files needed; real tracks can replace it later.
// Layers fade in with intensity: ambient (L0-1) -> rhythmic (L2-3) -> intense (L4-5).

const BPM = 112
const STEP = 60 / BPM / 4 // one 16th note in seconds
const LOOKAHEAD = 0.18

// A minor progression: roots in Hz (low octave), minor/major triads as semitone offsets
const PROGRESSION = [
  { root: 55.0, third: 3 }, // Am
  { root: 43.65, third: 4 }, // F
  { root: 65.41, third: 4 }, // C
  { root: 49.0, third: 4 }, // G
]
const midi = (root, semis) => root * Math.pow(2, semis / 12)

const LAYER_TARGETS = [
  // level:  pad   bass  kick  hat   arp   lead
  /* 0 */ [0.9, 0.0, 0.0, 0.0, 0.0, 0.0],
  /* 1 */ [0.9, 0.25, 0.0, 0.0, 0.0, 0.0],
  /* 2 */ [0.7, 0.6, 0.7, 0.4, 0.0, 0.0],
  /* 3 */ [0.65, 0.7, 0.8, 0.5, 0.25, 0.0],
  /* 4 */ [0.55, 0.8, 0.9, 0.6, 0.5, 0.0],
  /* 5 */ [0.5, 0.85, 1.0, 0.7, 0.6, 0.45],
]
const LAYERS = ['pad', 'bass', 'kick', 'hat', 'arp', 'lead']

export class MusicEngine {
  constructor(ctx, output, noiseBuffer) {
    this.ctx = ctx
    this.noise = noiseBuffer
    this.layers = {}
    for (const name of LAYERS) {
      const g = ctx.createGain()
      g.gain.value = 0
      g.connect(output)
      this.layers[name] = g
    }
    this.level = 0
    this.step = 0
    this.nextTime = 0
    this.timer = null
    this.running = false
    this.setIntensity(0)
  }

  start() {
    if (this.running) return
    this.running = true
    this.step = 0
    this.nextTime = this.ctx.currentTime + 0.1
    this.timer = setInterval(() => this._schedule(), 30)
  }

  stop() {
    this.running = false
    clearInterval(this.timer)
    this.timer = null
  }

  /** level 0..5 (wanted level; the game passes a minimum when the timer is nearly out). */
  setIntensity(level) {
    this.level = Math.max(0, Math.min(5, Math.round(level)))
    const t = LAYER_TARGETS[this.level]
    const now = this.ctx.currentTime
    LAYERS.forEach((name, i) => this.layers[name].gain.setTargetAtTime(t[i], now, 0.6))
  }

  _schedule() {
    if (!this.running || this.ctx.state !== 'running') {
      // while the context is suspended (pause) just keep the clock from piling up
      if (this.ctx.state !== 'running') this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.05)
      return
    }
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this._playStep(this.step, this.nextTime)
      this.nextTime += STEP
      this.step = (this.step + 1) % 64 // 4 bars of 16 steps
    }
  }

  _playStep(step, t) {
    const bar = Math.floor(step / 16) % PROGRESSION.length
    const s = step % 16
    const chord = PROGRESSION[bar]

    if (s === 0) this._pad(chord, t)

    // bass: syncopated 8ths with octave jumps
    if (this.level >= 1 && [0, 3, 6, 8, 11, 14].includes(s)) {
      const note = midi(chord.root, s === 6 || s === 14 ? 12 : 0)
      this._bass(note, t, STEP * 1.8)
    }
    // kick: four on the floor, extra ghost kick on intense
    if (this.level >= 2 && (s % 4 === 0 || (this.level >= 4 && s === 14))) this._kick(t)
    // hats
    if (this.level >= 2) {
      const open = s % 4 === 2
      if (open || (this.level >= 4 && s % 2 === 1)) this._hat(t, open ? 0.5 : 0.25, open ? 0.09 : 0.03)
    }
    // arpeggio
    if (this.level >= 3 && s % 2 === 0) {
      const seq = [0, 7, 12, 7, chord.third, 12, 15, 12]
      const n = seq[(s / 2) % seq.length]
      this._arp(midi(chord.root * 4, n), t)
    }
    // lead stab on L5
    if (this.level >= 5 && (s === 0 || s === 6 || s === 10)) {
      this._lead(midi(chord.root * 4, s === 0 ? 12 : s === 6 ? 15 : 19), t)
    }
  }

  // ---- voices --------------------------------------------------------------------------------
  _env(gainNode, t, peak, attack, hold, release) {
    const g = gainNode.gain
    g.setValueAtTime(0.0001, t)
    g.linearRampToValueAtTime(peak, t + attack)
    g.setValueAtTime(peak, t + attack + hold)
    g.exponentialRampToValueAtTime(0.0001, t + attack + hold + release)
  }

  _pad(chord, t) {
    const ctx = this.ctx
    const dur = STEP * 16
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(500, t)
    filter.frequency.linearRampToValueAtTime(1100, t + dur * 0.5)
    filter.frequency.linearRampToValueAtTime(450, t + dur)
    const g = ctx.createGain()
    this._env(g, t, 0.14, dur * 0.35, dur * 0.35, dur * 0.3)
    filter.connect(g).connect(this.layers.pad)
    for (const semi of [0, chord.third, 7]) {
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = midi(chord.root * 2, semi)
        o.detune.value = detune
        o.connect(filter)
        o.start(t)
        o.stop(t + dur + 0.05)
      }
    }
  }

  _bass(freq, t, dur) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = freq
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(700, t)
    f.frequency.exponentialRampToValueAtTime(160, t + dur)
    const g = ctx.createGain()
    this._env(g, t, 0.34, 0.005, dur * 0.4, dur * 0.6)
    o.connect(f).connect(g).connect(this.layers.bass)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  _kick(t) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
    const g = ctx.createGain()
    this._env(g, t, 0.9, 0.002, 0.02, 0.2)
    o.connect(g).connect(this.layers.kick)
    o.start(t)
    o.stop(t + 0.3)
  }

  _hat(t, vol, dur) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7000
    const g = ctx.createGain()
    this._env(g, t, vol * 0.5, 0.001, 0.005, dur)
    src.connect(f).connect(g).connect(this.layers.hat)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.05)
  }

  _arp(freq, t) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = freq
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 2600
    const g = ctx.createGain()
    this._env(g, t, 0.11, 0.004, 0.02, STEP * 1.6)
    o.connect(f).connect(g).connect(this.layers.arp)
    o.start(t)
    o.stop(t + STEP * 2.2)
  }

  _lead(freq, t) {
    const ctx = this.ctx
    const g = ctx.createGain()
    this._env(g, t, 0.16, 0.01, STEP * 1.5, STEP * 2.5)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 3800
    f.connect(g).connect(this.layers.lead)
    for (const d of [-9, 9]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = freq
      o.detune.value = d
      o.connect(f)
      o.start(t)
      o.stop(t + STEP * 4.5)
    }
  }
}
