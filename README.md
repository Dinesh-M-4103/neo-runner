# NEON RUNNER

3D cyberpunk survival runner built with Vite + Three.js (vanilla JS).

## Run
    npm install
    npm run dev      # http://localhost:5173
    npm run build    # production build in dist/

Add `?seed=1234` to the URL to generate a different (reproducible) city. Press F3 in-game for the FPS/draw-call overlay.

## Status
Phase 1 complete: engine setup, state machine, procedural 20x20 city, collision, third-person camera, player movement, 60s timer, HUD, menu/pause/game-over.

## Controls
WASD move | Mouse look | ESC pause | F3 debug stats

## Layout
src/core (Game, state machine, input, save) | src/player | src/world (city generator, collision, environment)
src/systems (timer, score) | src/ui | src/utils (Constants.js holds all balancing values)
