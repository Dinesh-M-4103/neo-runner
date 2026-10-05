// Finite state machine for the whole game. No scattered booleans.

export const State = Object.freeze({
  BOOT: 'BOOT',
  LOADING: 'LOADING',
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  VICTORY: 'VICTORY',
  GAME_OVER: 'GAME_OVER',
})

const TRANSITIONS = {
  [State.BOOT]: [State.LOADING],
  [State.LOADING]: [State.MENU],
  [State.MENU]: [State.PLAYING],
  [State.PLAYING]: [State.PAUSED, State.VICTORY, State.GAME_OVER],
  [State.PAUSED]: [State.PLAYING, State.MENU],
  [State.VICTORY]: [State.PLAYING, State.MENU],
  [State.GAME_OVER]: [State.PLAYING, State.MENU],
}

export class GameStateMachine {
  constructor() {
    this.current = State.BOOT
    this.previous = null
    this.listeners = []
  }

  is(state) {
    return this.current === state
  }

  canGo(state) {
    return TRANSITIONS[this.current].includes(state)
  }

  /** Returns true if the transition happened. Illegal transitions are ignored. */
  go(state) {
    if (!this.canGo(state)) return false
    this.previous = this.current
    this.current = state
    for (const fn of this.listeners) fn(state, this.previous)
    return true
  }

  onChange(fn) {
    this.listeners.push(fn)
  }
}
