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
  mouseSensitivity: 1,
}
