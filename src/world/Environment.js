import * as THREE from 'three'
import { CITY, COLORS, PALETTE } from '../utils/Constants.js'
import { damp } from '../utils/MathUtils.js'

const CALM_FOG = new THREE.Color(COLORS.FOG)
const ALERT_FOG = new THREE.Color(0x2a0714)

/** Scene-level atmosphere: background, fog, global lights, reflections and the wet ground plane. */
export class Environment {
  constructor(scene, renderer) {
    this.scene = scene
    scene.background = new THREE.Color(COLORS.SKY)
    scene.fog = new THREE.FogExp2(COLORS.FOG, CITY.FOG_DENSITY)
    this.threat = 0

    // Cold ambient fill + moonlight keep silhouettes readable without flattening the neon.
    this.hemi = new THREE.HemisphereLight(0x4a55b8, 0x1a0c2e, 1.1)
    scene.add(this.hemi)

    this.moon = new THREE.DirectionalLight(0x7f94ff, 1.25)
    this.moon.position.set(-120, 220, 80)
    scene.add(this.moon)

    // One dynamic light that rides with the player.
    this.playerLight = new THREE.PointLight(PALETTE.CYAN, 10, 22, 1.6)
    scene.add(this.playerLight)

    // Wet-looking asphalt: dark, glossy, picks up the fake neon environment below
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: 0x0b0d16, roughness: 0.22, metalness: 0.6 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.matrixAutoUpdate = false
    ground.updateMatrix()
    scene.add(ground)
    this.ground = ground

    if (renderer) this._buildReflections(scene, renderer)
  }

  /**
   * Fake neon reflections: render a tiny "sky" of coloured panels once into a PMREM environment map.
   * Costs nothing per frame, but makes glossy surfaces (wet road, armour) shimmer in cyan/magenta.
   */
  _buildReflections(scene, renderer) {
    try {
      const env = new THREE.Scene()
      env.background = new THREE.Color(0x05040c)
      const panel = (color, x, y, z, w, h) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))
        m.position.set(x, y, z)
        m.lookAt(0, 0, 0)
        env.add(m)
      }
      panel(new THREE.Color(PALETTE.CYAN).multiplyScalar(3), 30, 12, -20, 22, 8)
      panel(new THREE.Color(PALETTE.MAGENTA).multiplyScalar(3), -28, 10, 18, 24, 7)
      panel(new THREE.Color(PALETTE.AMBER).multiplyScalar(2), 8, 16, 30, 14, 5)
      panel(new THREE.Color(PALETTE.VIOLET).multiplyScalar(2), -10, 22, -30, 26, 6)
      panel(new THREE.Color(0x335577).multiplyScalar(1.2), 0, 40, 0, 60, 60)
      const pmrem = new THREE.PMREMGenerator(renderer)
      this.envMap = pmrem.fromScene(env, 0.04).texture
      pmrem.dispose()
      scene.environment = this.envMap
      scene.environmentIntensity = 0.55
    } catch (err) {
      console.warn('Reflection map unavailable, continuing without it', err)
    }
  }

  /** 0..1: how hostile the moment is (wanted level / time pressure). Reddens the fog. */
  setThreat(target, dt) {
    this.threat = damp(this.threat, target, 1.2, dt)
    this.scene.fog.color.copy(CALM_FOG).lerp(ALERT_FOG, this.threat)
    this.scene.background.copy(this.scene.fog.color)
  }

  update(playerPosition) {
    this.playerLight.position.set(playerPosition.x, 4.5, playerPosition.z)
  }
}
