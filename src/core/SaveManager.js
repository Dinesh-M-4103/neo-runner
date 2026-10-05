import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../utils/Constants.js'

// LocalStorage wrapper. Every access is guarded: private mode / blocked storage must not break the game.

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable - continue without persistence */
  }
}

export class SaveManager {
  constructor() {
    this.highScore = Number(read(STORAGE_KEYS.HIGH_SCORE, 0)) || 0
    this.settings = { ...DEFAULT_SETTINGS, ...read(STORAGE_KEYS.SETTINGS, {}) }
  }

  /** @returns {boolean} true if this is a new record */
  submitScore(score) {
    if (score > this.highScore) {
      this.highScore = score
      write(STORAGE_KEYS.HIGH_SCORE, score)
      return true
    }
    return false
  }

  saveSettings() {
    write(STORAGE_KEYS.SETTINGS, this.settings)
  }

  hasSeenControls() {
    return read(STORAGE_KEYS.SEEN_CONTROLS, false) === true
  }

  markControlsSeen() {
    write(STORAGE_KEYS.SEEN_CONTROLS, true)
  }
}
