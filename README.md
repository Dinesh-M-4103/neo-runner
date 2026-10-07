# NEON RUNNER

3D cyberpunk survival runner built with Vite + Three.js (vanilla JS).

## Run
    npm install
    npm run dev      # http://localhost:5173
    npm run build    # production build in dist/

Add `?seed=1234` to the URL to generate a different (reproducible) city. Press F3 in-game for the FPS/draw-call overlay.

## Status
Phases 1-3 complete: engine, city, movement, camera, timer, HUD, sprint, dash, health, Neon Blaster, and 3 drone types (scout/combat/heavy) with AI, projectiles, explosions and a time-based spawner.

## Controls
WASD move | Mouse look | ESC pause | F3 debug stats

## Layout
src/core (Game, state machine, input, save) | src/player | src/world (city generator, collision, environment)
src/systems (timer, score) | src/ui | src/utils (Constants.js holds all balancing values)
