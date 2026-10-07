// All gameplay / world balancing values live here so they are easy to tune.

// Seed can be overridden from the URL: ?seed=1234
const urlSeed = new URLSearchParams(window.location.search).get('seed')
export const CITY_SEED = urlSeed !== null && urlSeed !== '' ? parseInt(urlSeed, 10) || 0 : 20770

export const GAME = {
  GAME_DURATION: 60, // seconds per run
}

export const PLAYER = {
  PLAYER_SPEED: 11, // m/s
  ACCELERATION: 70, // m/s^2 (high = responsive, not floaty)
  DECELERATION: 55,
  TURN_SPEED: 16, // rad/s-ish smoothing factor for facing direction
  RADIUS: 0.45,
  HEIGHT: 1.8,
  START_POSITION: { x: 0, z: 0 },
}

// Sprint / dash / health
PLAYER.SPRINT_SPEED = 17
PLAYER.MAX_HEALTH = 100
PLAYER.MAX_STAMINA = 100
PLAYER.STAMINA_DRAIN = 26 // per second while sprinting
PLAYER.STAMINA_REGEN = 30 // per second
PLAYER.STAMINA_REGEN_DELAY = 0.5 // seconds after sprint stops before regen starts
PLAYER.STAMINA_EXHAUST_RECOVER = 20 // after hitting 0 you must regain this much before sprinting again
PLAYER.DASH_DISTANCE = 10 // meters
PLAYER.DASH_DURATION = 0.14 // seconds
PLAYER.DASH_COOLDOWN = 2 // seconds
PLAYER.DAMAGE_INVULN = 0.35 // seconds of invulnerability after taking a hit

export const WEAPON = {
  NAME: 'NEON BLASTER',
  WEAPON_DAMAGE: 25,
  WEAPON_COOLDOWN: 0.13, // seconds between shots (hold to auto-fire)
  MAG_SIZE: 40, // energy cells
  RELOAD_TIME: 1.3,
  RANGE: 160,
  SPREAD: 0.004, // radians of random cone
  RECOIL_PITCH: 0.0065,
  RECOIL_SHAKE: 0.045,
  AIM_FACING_TIME: 0.35, // player turns to face the crosshair for this long after firing
}

export const DRONES = {
  MAX_ENEMIES: 14,
  DETECT_RANGE: 75,
  LOSE_RANGE: 130,
  DESPAWN_RANGE: 150,
  SPAWN_MIN: 42,
  SPAWN_MAX: 70,
  SEPARATION: 4.5, // drones push apart inside this distance
  TYPES: {
    scout: {
      name: 'SCOUT', health: 40, speed: 13, accel: 5, damage: 6, fireInterval: 1.5, windup: 0.3,
      burst: 1, burstGap: 0, projectileSpeed: 30, projectileSize: 0.7, accuracy: 0.07,
      preferredDistance: 11, attackRange: 40, radius: 0.75, altitude: 3.6, color: 0xffb347, score: 150, pool: 12,
    },
    combat: {
      name: 'COMBAT', health: 100, speed: 8.5, accel: 3.5, damage: 10, fireInterval: 1.2, windup: 0.25,
      burst: 3, burstGap: 0.13, projectileSpeed: 34, projectileSize: 0.8, accuracy: 0.045,
      preferredDistance: 15, attackRange: 48, radius: 1.0, altitude: 4.4, color: 0xff2bd6, score: 300, pool: 8,
    },
    heavy: {
      name: 'HEAVY', health: 300, speed: 4.6, accel: 2, damage: 25, fireInterval: 2.4, windup: 0.65,
      burst: 1, burstGap: 0, projectileSpeed: 22, projectileSize: 1.6, accuracy: 0.025,
      preferredDistance: 22, attackRange: 58, radius: 1.7, altitude: 5.6, color: 0xff3355, score: 750, pool: 4,
    },
  },
}

// ---- Wanted level (0-5). Heat accumulates; thresholds[i] = heat needed to reach level i. ----
export const WANTED_THRESHOLDS = [0, 14, 32, 56, 86, 125]
export const WANTED = {
  SURVIVE_PER_SEC: 0.55,
  ZONE_PER_SEC: 7, // standing in a restricted area
  CORE: 1.5,
  RICH_CORE: 4,
  KILL: { scout: 4, combat: 7, heavy: 14 },
}

// What each wanted level spawns. `interval` = seconds between spawns while below `max`.
export const WANTED_SPAWN = [
  { max: 1, interval: 3.0, types: { scout: 1 } }, // L0: almost nothing
  { max: 3, interval: 2.2, types: { scout: 1 } }, // L1: scouts
  { max: 5, interval: 1.8, types: { scout: 1 } }, // L2: more scouts
  { max: 7, interval: 1.5, types: { scout: 3, combat: 2 } }, // L3: combat drones
  { max: 9, interval: 1.3, types: { scout: 2, combat: 3, heavy: 1 } }, // L4: heavies
  { max: 12, interval: 1.0, types: { scout: 2, combat: 4, heavy: 2 } }, // L5: elite pursuit
]

// Time pressure on top of the wanted level (by seconds REMAINING). Matches the spec's difficulty curve.
export const TIME_PRESSURE = [
  { remaining: 45, extraMax: 1 }, // more drones
  { remaining: 30, extraMax: 2, minTypes: { combat: 2 } }, // combat drones
  { remaining: 15, extraMax: 3, minTypes: { combat: 2, heavy: 1 } }, // heavy drones
  { remaining: 10, extraMax: 5, minTypes: { combat: 3, heavy: 1 }, intervalMul: 0.6, aggression: 1.2 }, // extreme pursuit
]

export const COMBO = { WINDOW: 4, PER_STEP: 3, MAX_MULT: 5 }

export const PICKUPS = {
  CORE_COUNT: 70,
  CORE_VALUE: 100,
  RICH_VALUE: 250,
  ZONE_CORES: 4, // premium cores per restricted zone
  HEALTH_COUNT: 6,
  HEALTH_HEAL: 35,
  DROP_HEAL: 25,
  DROP_CHANCE: 0.18,
  MAGNET_RANGE: 5,
  COLLECT_RANGE: 1.25,
}

export const ZONES = { COUNT: 5, RADIUS: 12, MIN_FROM_START: 150, MIN_SPACING: 130 }

export const CAMERA = {
  DISTANCE: 6.5,
  HEIGHT_OFFSET: 1.55, // pivot above player feet
  SHOULDER_OFFSET: 0.75,
  FOLLOW_DAMPING: 11, // higher = tighter follow (lower = more lag)
  LOOK_DAMPING: 26,
  MIN_PITCH: -0.35,
  MAX_PITCH: 1.05,
  DEFAULT_PITCH: 0.28,
  BASE_FOV: 70,
  SPEED_FOV_BONUS: 7,
  MAX_ROLL: 0.05,
  NEAR: 0.1,
  FAR: 700,
}

export const SCORE = {
  SURVIVAL_PER_SECOND: 10,
}

export const CITY = {
  GRID: 20, // city blocks per side
  LOT_SIZE: 28, // building lot edge length
  ROAD_WIDTH: 16,
  CHUNK_BLOCKS: 5, // blocks per chunk edge (frustum-culling granularity)
  BORDER_THICKNESS: 30,
  BORDER_HEIGHT: 38,
  FOG_DENSITY: 0.0068,
}
CITY.PITCH = CITY.LOT_SIZE + CITY.ROAD_WIDTH
CITY.HALF_EXTENT = (CITY.GRID * CITY.PITCH) / 2 // edge of the outer road ring's centerline

export const PALETTE = {
  CYAN: 0x00f0ff,
  MAGENTA: 0xff2bd6,
  VIOLET: 0x8a4dff,
  BLUE: 0x2d7bff,
  AMBER: 0xffb347,
  PINK: 0xff5c8a,
}
export const NEON_COLORS = [
  PALETTE.CYAN,
  PALETTE.MAGENTA,
  PALETTE.VIOLET,
  PALETTE.BLUE,
  PALETTE.AMBER,
  PALETTE.PINK,
]

export const COLORS = {
  FOG: 0x0a0818,
  SKY: 0x0a0818,
}

export const STORAGE_KEYS = {
  HIGH_SCORE: 'neonrunner.highScore',
  SETTINGS: 'neonrunner.settings',
  SEEN_CONTROLS: 'neonrunner.seenControls',
}

export const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  quality: 'high', // low | medium | high
  mouseSensitivity: 1,
  screenShake: true,
  postProcessing: true,
}

// Graphics quality presets (applied live from the settings menu)
export const QUALITY = {
  low: { pixelRatio: 1, bloom: false, rain: 0.35, viewDistance: 300 },
  medium: { pixelRatio: 1.5, bloom: true, rain: 0.7, viewDistance: 380 },
  high: { pixelRatio: 2, bloom: true, rain: 1, viewDistance: 450 },
}

export const PORTAL = {
  RADIUS: 3.8, // trigger distance (m)
  MIN_DIST: 270, // from the start (m): far enough to need a real run, close enough to reach in 60s
  MAX_DIST: 380,
  EXTRACTION_BONUS: 2000,
  TIME_BONUS_PER_SEC: 40,
  ESCAPE_DURATION: 3.0, // seconds of escape cinematic before the result screen
}
