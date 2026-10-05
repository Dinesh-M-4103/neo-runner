import * as THREE from 'three'
import { CITY, COLORS, PALETTE } from '../utils/Constants.js'

/** Scene-level atmosphere: background, fog, global lights and the ground plane. */
export class Environment {
  constructor(scene) {
    this.scene = scene
    scene.background = new THREE.Color(COLORS.SKY)
    scene.fog = new THREE.FogExp2(COLORS.FOG, CITY.FOG_DENSITY)

    // Cold ambient fill + moonlight keep silhouettes readable without flattening the neon.
    this.hemi = new THREE.HemisphereLight(0x4a55b8, 0x1a0c2e, 1.1)
    scene.add(this.hemi)

    this.moon = new THREE.DirectionalLight(0x7f94ff, 1.25)
    this.moon.position.set(-120, 220, 80)
    scene.add(this.moon)

    // One dynamic light that rides with the player (the only real point light in Phase 1).
    this.playerLight = new THREE.PointLight(PALETTE.CYAN, 10, 22, 1.6)
    scene.add(this.playerLight)

    // Wet-looking asphalt: dark, fairly glossy
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: 0x0b0d16, roughness: 0.3, metalness: 0.55 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.matrixAutoUpdate = false
    ground.updateMatrix()
    scene.add(ground)
    this.ground = ground
  }

  update(playerPosition) {
    this.playerLight.position.set(playerPosition.x, 4.5, playerPosition.z)
  }
}
