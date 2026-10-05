import './style.css'
import { Game } from './core/Game.js'

const game = new Game(document.getElementById('game'), document.getElementById('ui'))
game.init()

// Handy for debugging in the console
window.__game = game
