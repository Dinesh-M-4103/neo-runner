import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// One lightweight full-screen pass: chromatic aberration + vignette + film grain + red alert tint.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.018 },
    uAlert: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberration, uVignette, uGrain, uAlert;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float d = length(c);
      vec2 off = c * (uAberration * (0.4 + d * 1.6));
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // vignette (stronger when alert)
      float vig = smoothstep(0.85, 0.2, d * (1.0 + uVignette));
      col *= mix(1.0, vig, clamp(uVignette + uAlert * 0.5, 0.0, 1.0));
      // red alert wash at the edges
      col += vec3(0.5, 0.0, 0.05) * uAlert * smoothstep(0.25, 0.8, d);
      // film grain
      col += (hash(vUv * 900.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
}

/**
 * Optional post stack: bloom -> grade -> output (tone mapping). `enabled=false` renders straight to screen,
 * so the game looks fine without it. Dash / damage kick the chromatic aberration.
 */
export class PostProcessing {
  constructor(renderer, scene, camera) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.enabled = true
    this.bloomEnabled = true
    this.aberration = 0
    this.alert = 0
    this.vignette = 0.35

    const size = renderer.getSize(new THREE.Vector2())
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(renderer, rt)
    this.renderPass = new RenderPass(scene, camera)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.65, 0.88)
    this.grade = new ShaderPass(GradeShader)
    this.output = new OutputPass()
    this.composer.addPass(this.renderPass)
    this.composer.addPass(this.bloom)
    this.composer.addPass(this.grade)
    this.composer.addPass(this.output)
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(w, h)
    this.bloom.setSize((w * pixelRatio) / 2, (h * pixelRatio) / 2)
  }

  /** One-shot kick (dash, damage): decays automatically. */
  kickAberration(amount) {
    this.aberration = Math.max(this.aberration, amount)
  }

  setBloom(on) {
    this.bloomEnabled = on
    this.bloom.enabled = on
  }

  render(dt, time) {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera)
      return
    }
    const u = this.grade.uniforms
    u.uTime.value = time % 100
    u.uAberration.value = this.aberration
    u.uAlert.value = this.alert
    u.uVignette.value = this.vignette
    this.aberration = Math.max(0, this.aberration - dt * 0.05)
    this.composer.render(dt)
  }
}
