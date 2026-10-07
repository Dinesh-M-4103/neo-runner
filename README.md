# NEON RUNNER

3D cyberpunk survival runner. Reach the extraction portal within 60 seconds while security drones hunt you.
Built with Vite + Three.js (vanilla JS), no backend, no external assets (everything is procedural, audio is synthesised).

## Run
    npm install
    npm run dev      # http://localhost:5173
    npm run build    # production build in dist/
    npm run lint

URL options: `?seed=1234` (different reproducible city) | `?touch=1` (force touch controls).
Press **F3** in-game for FPS / draw calls / triangles / enemies (F4 then hurts you, for testing damage feedback).

## Controls
WASD move | Mouse look | SHIFT sprint | SPACE dash | LEFT CLICK fire (hold) | R reload | ESC pause
Touch: left stick, right-side drag to look, FIRE / DASH / RUN / R / pause buttons.

## Features
- 20x20 seeded procedural city (instanced chunks, shader-drawn windows, holographic billboards, wet roads)
- Third-person camera: lag, dynamic FOV, banking, collision, shake
- Sprint + stamina, dash with i-frames, Neon Blaster (hitscan, tracers, recoil, reload)
- 3 drone types (scout / combat / heavy) with IDLE-SEARCH-CHASE-ATTACK-DAMAGED-DESTROYED AI, telegraphed shots
- Wanted level 0-5 + time pressure drive spawns; energy cores, health packs, restricted zones (risk/reward), combo multiplier
- Extraction portal, escape cinematic, victory + game-over screens, high score (LocalStorage)
- GPU rain, fog, bloom / vignette / grain / chromatic aberration (all optional), quality presets
- Procedural audio (SFX + music that intensifies with wanted level), volume + graphics + sensitivity settings

## Code layout
src/core (Game, state machine, input, touch, audio, music, assets, save) | src/player | src/enemies | src/world
src/pickups | src/effects (particles, rain, post) | src/systems | src/ui | src/utils (Constants.js = all balancing values)
