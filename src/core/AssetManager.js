import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Optional external assets. The game ships with procedural geometry and synthesised audio, so every
 * load here is allowed to fail: `loadModel()` / `loadTexture()` resolve to null and callers fall back.
 * To use real assets later, call e.g. `assets.loadModel('/models/drone.glb')` and swap the result in.
 */
export class AssetManager {
  constructor() {
    this.gltf = new GLTFLoader()
    this.textures = new THREE.TextureLoader()
    this.cache = new Map()
  }

  loadModel(url) {
    if (this.cache.has(url)) return this.cache.get(url)
    const p = new Promise((resolve) => {
      this.gltf.load(
        url,
        (g) => resolve(g.scene),
        undefined,
        (err) => {
          console.warn(`Model failed to load (${url}) - using procedural fallback`, err)
          resolve(null)
        }
      )
    })
    this.cache.set(url, p)
    return p
  }

  loadTexture(url) {
    return new Promise((resolve) => {
      this.textures.load(
        url,
        (t) => resolve(t),
        undefined,
        () => {
          console.warn(`Texture missing (${url}) - using fallback material`)
          resolve(null)
        }
      )
    })
  }
}
