import * as THREE from 'three'
import { NEON_COLORS, PALETTE } from '../utils/Constants.js'

/**
 * One shared material for every building. Windows are drawn procedurally in the fragment shader from
 * world position, so any box size gets a correct, non-stretched window grid with zero textures.
 * The per-instance colour is used as the window/neon tint (the wall itself is always dark).
 */
export function createBuildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.35 })

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vWN = normal;`
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWN;
        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }`
      )
      // Replace the instance-colour multiply with a dark wall; keep the colour as a tint.
      .replace(
        '#include <color_fragment>',
        `vec3 tint = vColor.rgb;
        float wallVar = hash21(floor(vWPos.xz * 0.05) + 3.7);
        diffuseColor.rgb = vec3(0.05, 0.055, 0.085) * (0.75 + 0.6 * wallVar);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 an = abs(vWN);
        if (an.y < 0.5) {
          bool xFace = an.x > 0.5;
          float along = xFace ? vWPos.z : vWPos.x;
          float faceK = floor(xFace ? vWPos.x : vWPos.z);
          vec2 cell = vec2(along / 2.4, vWPos.y / 3.3);
          vec2 id = floor(cell);
          vec2 f = fract(cell);
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.75);
          float r = hash21(id + vec2(faceK * 0.731, faceK * 1.371));
          float lit = step(0.52, r);
          float bright = 0.55 + 0.9 * hash21(id * 1.7 + faceK);
          // faint vertical ribs so blank walls still read as architecture
          float rib = step(0.94, fract(along / 6.0)) * 0.05;
          totalEmissiveRadiance += tint * (win * lit * bright * 0.85 + rib);
        }`
      )
  }
  return mat
}

const TINT_POOL = [
  PALETTE.CYAN, PALETTE.CYAN, PALETTE.MAGENTA, PALETTE.MAGENTA,
  PALETTE.BLUE, PALETTE.VIOLET, PALETTE.AMBER, PALETTE.PINK,
]
const ROOF_GREY = [0x22252f, 0x2b2f3b, 0x1c1f29, 0x33384a]

/**
 * Emits all instances for one lot. `emit(layer, x, y, z, sx, sy, sz, color)` is provided by the chunk builder.
 * Returns colliders through `addCollider(cx, cz, w, d, height)`.
 */
export function generateLot(rng, lot, emit, addCollider) {
  const { cx, cz, size, centerFactor } = lot

  // Lot archetype
  const roll = rng.next()
  const kind = roll < 0.12 ? 'plaza' : roll < 0.38 ? 'low' : 'tower'

  // Sidewalk slab under every lot
  emit('slabs', cx, 0, cz, size, 0.06, size, 0x1d2030)

  if (kind === 'plaza') {
    generatePlaza(rng, lot, emit, addCollider)
    return
  }

  // Subdivide the lot: sometimes leave a 4m alley between buildings
  const splitRoll = rng.next()
  const rects = []
  const h = size / 2
  const alley = 4
  if (splitRoll < 0.4) {
    rects.push([cx - h, cx + h, cz - h, cz + h])
  } else if (splitRoll < 0.65) {
    const cut = rng.range(-5, 5)
    rects.push([cx - h, cx + cut - alley / 2, cz - h, cz + h], [cx + cut + alley / 2, cx + h, cz - h, cz + h])
  } else if (splitRoll < 0.9) {
    const cut = rng.range(-5, 5)
    rects.push([cx - h, cx + h, cz - h, cz + cut - alley / 2], [cx - h, cx + h, cz + cut + alley / 2, cz + h])
  } else {
    const cutX = rng.range(-4, 4), cutZ = rng.range(-4, 4)
    rects.push(
      [cx - h, cx + cutX - alley / 2, cz - h, cz + cutZ - alley / 2],
      [cx + cutX + alley / 2, cx + h, cz - h, cz + cutZ - alley / 2],
      [cx - h, cx + cutX - alley / 2, cz + cutZ + alley / 2, cz + h],
      [cx + cutX + alley / 2, cx + h, cz + cutZ + alley / 2, cz + h]
    )
  }

  for (const [x0, x1, z0, z1] of rects) {
    const m = rng.range(0.6, 1.8)
    const w = x1 - x0 - m * 2
    const d = z1 - z0 - m * 2
    if (w < 4 || d < 4) continue
    const bx = (x0 + x1) / 2, bz = (z0 + z1) / 2
    const height =
      kind === 'low'
        ? rng.range(8, 18)
        : 16 + Math.pow(rng.next(), 1.5) * 80 * (0.35 + 0.65 * centerFactor)
    buildBuilding(rng, bx, bz, w, d, height, emit, addCollider)
  }
}

function buildBuilding(rng, bx, bz, w, d, height, emit, addCollider) {
  const tint = rng.pick(TINT_POOL)
  emit('buildings', bx, 0, bz, w, height, d, tint)
  addCollider(bx, bz, w, d, height)

  // Setback upper tier
  let topY = height
  if (height > 38 && rng.chance(0.5)) {
    const tw = w * rng.range(0.5, 0.75), td = d * rng.range(0.5, 0.75), th = height * rng.range(0.15, 0.35)
    emit('buildings', bx, height, bz, tw, th, td, rng.pick(TINT_POOL))
    topY = height + th
  }

  // Neon roof trim
  if (height > 24 && rng.chance(0.55)) {
    const c = rng.pick(NEON_COLORS)
    const y = height - 0.25
    emit('neon', bx, y, bz - d / 2 + 0.1, w, 0.25, 0.25, c)
    emit('neon', bx, y, bz + d / 2 - 0.1, w, 0.25, 0.25, c)
    emit('neon', bx - w / 2 + 0.1, y, bz, 0.25, 0.25, d, c)
    emit('neon', bx + w / 2 - 0.1, y, bz, 0.25, 0.25, d, c)
  }

  // Vertical neon sign on a random face
  if (height > 18 && rng.chance(0.55)) {
    const c = rng.pick(NEON_COLORS)
    const sh = rng.range(5, Math.min(16, height * 0.5))
    const sw = rng.range(1.2, 2.2)
    const y = rng.range(3, Math.max(3.5, height - sh - 2))
    const face = rng.int(0, 3)
    const off = rng.range(-0.3, 0.3)
    if (face < 2) {
      const sx = (face === 0 ? 1 : -1) * (w / 2 + 0.45)
      emit('neon', bx + sx, y, bz + off * d, 0.7, sh, sw, c)
    } else {
      const sz = (face === 2 ? 1 : -1) * (d / 2 + 0.45)
      emit('neon', bx + off * w, y, bz + sz, sw, sh, 0.7, c)
    }
  }

  // Rooftop holographic billboard
  if (height > 26 && rng.chance(0.3)) {
    const c = rng.pick(NEON_COLORS)
    const alongX = rng.chance(0.5)
    const bw = Math.min(alongX ? w : d, 14) * 0.8
    emit('props', bx, topY, bz, alongX ? 0.4 : 0.4, 2.2, alongX ? 0.4 : 0.4, 0x15171f)
    emit('neon', bx, topY + 2.2, bz, alongX ? bw : 0.45, 4.2, alongX ? 0.45 : bw, c)
  }

  // Rooftop equipment (vents, AC units, tanks) + antennas
  const n = rng.int(2, 5)
  for (let i = 0; i < n; i++) {
    const pw = rng.range(1.4, 3.6), pd = rng.range(1.4, 3.6), ph = rng.range(0.8, 2.6)
    const px = bx + rng.range(-w / 2 + pw, w / 2 - pw) * 0.85
    const pz = bz + rng.range(-d / 2 + pd, d / 2 - pd) * 0.85
    emit('props', px, height, pz, pw, ph, pd, rng.pick(ROOF_GREY))
  }
  if (rng.chance(0.4)) {
    const ah = rng.range(5, 13)
    const ax = bx + rng.range(-w / 3, w / 3), az = bz + rng.range(-d / 3, d / 3)
    emit('props', ax, topY, az, 0.25, ah, 0.25, 0x2b2f3b)
    emit('neon', ax, topY + ah, az, 0.5, 0.5, 0.5, rng.chance(0.7) ? 0xff2020 : PALETTE.CYAN)
  }
}

function generatePlaza(rng, lot, emit, addCollider) {
  const { cx, cz } = lot
  // Open plaza: a few low props and one neon arch, leaves a wide-open area (good for fights).
  const c = rng.pick(NEON_COLORS)
  for (let i = 0; i < 3; i++) {
    const px = cx + rng.range(-9, 9), pz = cz + rng.range(-9, 9)
    const s = rng.range(1.8, 3)
    emit('props', px, 0.06, pz, s, rng.range(0.8, 1.6), s, 0x2b2f3b)
    addCollider(px, pz, s, s, 1.6)
  }
  // Arch made of two posts and a glowing beam
  const ax = cx + rng.range(-4, 4), az = cz + rng.range(-4, 4)
  emit('props', ax - 5, 0.06, az, 0.6, 7, 0.6, 0x1c1f29)
  emit('props', ax + 5, 0.06, az, 0.6, 7, 0.6, 0x1c1f29)
  emit('neon', ax, 7, az, 11, 0.5, 0.5, c)
  addCollider(ax - 5, az, 0.6, 0.6, 7)
  addCollider(ax + 5, az, 0.6, 0.6, 7)
}
