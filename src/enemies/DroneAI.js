import { DRONES } from '../utils/Constants.js'
import { dampAngle } from '../utils/MathUtils.js'
import { DroneState as S } from './Drone.js'

const FLY_CLEARANCE = 6 // drones only collide with buildings taller than this (they fly over low props)
const LOS_PLAYER_Y = 1.3

/**
 * Cheap per-drone brain. No pathfinding: steer toward a goal, slide along walls, and when a wall
 * keeps us stuck, sidestep for a moment ("detour"). Line of sight is sampled ~4x/second per drone.
 *
 * ctx = { playerX, playerZ, playerVX, playerVZ, collision, projectiles, drones (active list) }
 */
export function updateDrone(d, dt, ctx) {
  const cfg = d.cfg
  d.stateTime += dt
  d.age += dt

  const p = d.position
  const toPX = ctx.playerX - p.x, toPZ = ctx.playerZ - p.z
  const dist = Math.hypot(toPX, toPZ)

  // ---- perception (staggered) --------------------------------------------------------------
  d.losTimer -= dt
  if (d.losTimer <= 0) {
    d.losTimer = 0.2 + Math.random() * 0.1
    d.hasLOS =
      dist < DRONES.LOSE_RANGE &&
      ctx.collision.segmentHit(p.x, p.y, p.z, ctx.playerX, LOS_PLAYER_Y, ctx.playerZ) >= 1
  }
  if (d.hasLOS) {
    d.noLosTime = 0
    d.lastKnownX = ctx.playerX
    d.lastKnownZ = ctx.playerZ
  } else {
    d.noLosTime += dt
  }
  const sees = d.hasLOS && dist < DRONES.DETECT_RANGE

  // ---- state machine ---------------------------------------------------------------------
  let goalX = 0, goalZ = 0, goalSpeed = 0, facePlayer = false

  switch (d.state) {
    case S.IDLE:
      // hover in place; wake up when the player is spotted
      if (sees || dist < 18) d.setState(S.SEARCH)
      break

    case S.SEARCH: {
      // head to where we last saw the player; after arriving, wander around there
      if (sees && d.stateTime > 0.35) { d.setState(S.CHASE); break }
      const lx = d.lastKnownX - p.x, lz = d.lastKnownZ - p.z
      const ld = Math.hypot(lx, lz)
      if (ld > 6) {
        goalX = lx / ld; goalZ = lz / ld; goalSpeed = cfg.speed * 0.75
      } else {
        d.wanderTimer -= dt
        if (d.wanderTimer <= 0) {
          d.wanderTimer = 1.5 + Math.random()
          const a = Math.random() * Math.PI * 2
          d.wanderX = Math.sin(a); d.wanderZ = Math.cos(a)
        }
        goalX = d.wanderX; goalZ = d.wanderZ; goalSpeed = cfg.speed * 0.35
      }
      if (d.stateTime > 9) d.setState(S.IDLE)
      break
    }

    case S.CHASE: {
      facePlayer = true
      if (dist > DRONES.LOSE_RANGE) { d.setState(S.SEARCH); break }
      if (d.hasLOS && dist < cfg.attackRange) { d.setState(S.ATTACK); break }
      if (d.noLosTime > 4) { d.setState(S.SEARCH); break }
      // chase the player when visible, otherwise the last place we saw them
      const tx = d.hasLOS ? toPX : d.lastKnownX - p.x
      const tz = d.hasLOS ? toPZ : d.lastKnownZ - p.z
      const td = Math.hypot(tx, tz) || 1
      goalX = tx / td; goalZ = tz / td; goalSpeed = cfg.speed
      break
    }

    case S.ATTACK: {
      facePlayer = true
      if (d.noLosTime > 1.2 || dist > cfg.attackRange * 1.35) { d.setState(S.CHASE); break }
      const nx = toPX / (dist || 1), nz = toPZ / (dist || 1)
      // hold a preferred distance, circle-strafe around the player
      const band = cfg.preferredDistance
      let radial = 0
      if (dist < band * 0.85) radial = -1
      else if (dist > band * 1.15) radial = 1
      d.strafeTimer -= dt
      if (d.strafeTimer <= 0) {
        d.strafeTimer = 1.2 + Math.random() * 2
        if (Math.random() < 0.7) d.strafeDir = -d.strafeDir
      }
      const sx = -nz * d.strafeDir, sz = nx * d.strafeDir
      const strafe = d.windup > 0 ? 0.15 : 0.6 // hold still-ish while charging a shot
      goalX = nx * radial + sx * strafe
      goalZ = nz * radial + sz * strafe
      const gl = Math.hypot(goalX, goalZ)
      if (gl > 1e-3) { goalX /= gl; goalZ /= gl; goalSpeed = cfg.speed * (radial !== 0 ? 0.85 : 0.6) }
      updateFiring(d, dt, ctx, dist)
      break
    }

    case S.DAMAGED:
      facePlayer = true
      if (d.stateTime > 0.22) d.setState(d.hasLOS && dist < cfg.attackRange ? S.ATTACK : S.CHASE)
      // being shot tells the drone where you are
      d.lastKnownX = ctx.playerX
      d.lastKnownZ = ctx.playerZ
      break

    default:
      break
  }

  // ---- steering: detour, separation, knockback --------------------------------------------
  let dx = goalX, dz = goalZ
  if (d.detour > 0 && goalSpeed > 0) {
    d.detour -= dt
    // blend toward a sideways direction to slide around the obstacle
    dx = goalX * 0.3 - goalZ * d.detourDir
    dz = goalZ * 0.3 + goalX * d.detourDir
    const l = Math.hypot(dx, dz) || 1
    dx /= l; dz /= l
  }

  let sepX = 0, sepZ = 0
  const others = ctx.drones
  for (let i = 0; i < others.length; i++) {
    const o = others[i]
    if (o === d) continue
    const ox = p.x - o.position.x, oz = p.z - o.position.z
    const od = Math.hypot(ox, oz)
    if (od < DRONES.SEPARATION && od > 1e-3) {
      const w = (DRONES.SEPARATION - od) / DRONES.SEPARATION
      sepX += (ox / od) * w
      sepZ += (oz / od) * w
    }
  }
  // don't hover on top of the player either
  if (dist < 5 && dist > 1e-3) { sepX -= (toPX / dist) * 1.2; sepZ -= (toPZ / dist) * 1.2 }

  const wantX = dx * goalSpeed + sepX * cfg.speed * 0.9 + d.knockX
  const wantZ = dz * goalSpeed + sepZ * cfg.speed * 0.9 + d.knockZ
  d.knockX *= Math.max(0, 1 - 9 * dt)
  d.knockZ *= Math.max(0, 1 - 9 * dt)

  // smooth acceleration so movement feels weighty (heavy drones turn slowest)
  const k = Math.min(1, cfg.accel * dt)
  d.velocity.x += (wantX - d.velocity.x) * k
  d.velocity.z += (wantZ - d.velocity.z) * k

  // ---- move + collide (drones only collide with tall buildings) ---------------------------
  const ox = p.x, oz = p.z
  p.x += d.velocity.x * dt
  p.z += d.velocity.z * dt
  ctx.collision.resolveCircle(p, cfg.radius, FLY_CLEARANCE)

  const expected = Math.hypot(d.velocity.x, d.velocity.z) * dt
  const moved = Math.hypot(p.x - ox, p.z - oz)
  if (goalSpeed > 0 && expected > 0.01 && moved < expected * 0.4) d.stuck += dt
  else d.stuck = Math.max(0, d.stuck - dt * 2)
  if (d.stuck > 0.3) {
    d.stuck = 0
    d.detour = 1.2
    d.detourDir = Math.random() < 0.5 ? -1 : 1
  }

  // hover height eases toward the type's altitude
  p.y += (cfg.altitude - p.y) * Math.min(1, 3 * dt)

  // ---- facing -----------------------------------------------------------------------------
  let yawTarget = d.yaw
  if (facePlayer) yawTarget = Math.atan2(toPX, toPZ)
  else if (Math.hypot(d.velocity.x, d.velocity.z) > 0.8) yawTarget = Math.atan2(d.velocity.x, d.velocity.z)
  d.yaw = dampAngle(d.yaw, yawTarget, d.type === 'heavy' ? 4 : 9, dt)

  d.syncMesh(dt)
}

/** Windup -> (burst of) shots. A visible charge-up makes every attack readable and dodgeable. */
function updateFiring(d, dt, ctx, dist) {
  const cfg = d.cfg

  if (d.burstLeft > 0) {
    d.burstTimer -= dt
    if (d.burstTimer <= 0) {
      shoot(d, ctx, dist)
      d.burstLeft--
      d.burstTimer = cfg.burstGap
    }
    return
  }

  if (d.windup > 0) {
    d.windup -= dt
    if (d.windup <= 0) {
      d.windup = 0
      d.burstLeft = cfg.burst
      d.burstTimer = 0
      d.fireTimer = cfg.fireInterval * (0.85 + Math.random() * 0.4)
    }
    return
  }

  d.fireTimer -= dt
  if (d.fireTimer <= 0 && d.hasLOS) d.windup = cfg.windup
}

function shoot(d, ctx, dist) {
  const cfg = d.cfg
  // lead the target a little (not perfectly - strafing still works)
  const t = dist / cfg.projectileSpeed
  const tx = ctx.playerX + ctx.playerVX * t * 0.6
  const tz = ctx.playerZ + ctx.playerVZ * t * 0.6
  const ty = 1.1
  let dx = tx - d.position.x, dy = ty - d.position.y, dz = tz - d.position.z
  const l = Math.hypot(dx, dy, dz) || 1
  dx /= l; dy /= l; dz /= l
  // inaccuracy cone
  dx += (Math.random() - 0.5) * 2 * cfg.accuracy
  dy += (Math.random() - 0.5) * 2 * cfg.accuracy
  dz += (Math.random() - 0.5) * 2 * cfg.accuracy
  const mx = d.position.x + dx * (cfg.radius + 0.3)
  const my = d.position.y + dy * (cfg.radius + 0.3) - 0.1
  const mz = d.position.z + dz * (cfg.radius + 0.3)
  ctx.projectiles.fire(mx, my, mz, dx, dy, dz, cfg)
  if (ctx.onShot) ctx.onShot(d)
}
