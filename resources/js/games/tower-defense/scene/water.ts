import * as THREE from 'three'

import { COLS, type GameState, ROWS } from '../gameTypes'
import { cellIndex } from '../pathfinding'
import type { Theme } from './themes'

const VERTEX = /* glsl */`
varying vec2 vBoard;
void main() {
  vBoard = (modelMatrix * vec4(position, 1.0)).xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT = /* glsl */`
uniform float uTime;
uniform float uLava;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform sampler2D uMask;
uniform vec2 uBoard;
varying vec2 vBoard;

float swell(vec2 p) {
  return sin((p.x * 1.7) + (uTime * 0.6))
    + sin((p.y * 2.3) - (uTime * 0.45))
    + sin(((p.x + p.y) * 1.1) + (uTime * 0.8))
    + (sin(((p.x - p.y) * 3.1) - (uTime * 0.35)) * 0.5);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

/** Slow-breathing triangular facets, so the water matches the low-poly models around it. */
float facets(vec2 p) {
  vec2 cell = floor(p);
  vec2 inner = fract(p);
  float seed = hash(cell + (inner.x > inner.y ? vec2(0.37, 0.11) : vec2(0.0)));

  return sin((uTime * 0.9) + (seed * 6.283)) * (0.4 + (seed * 0.6));
}

void main() {
  // The mask blurs across cells when sampled, which gives every shore a soft distance to land.
  float depth = texture2D(uMask, vBoard / uBoard).r;
  float surface = swell(vBoard);
  vec3 color = mix(uShallow, uDeep, smoothstep(0.58, 0.98, depth + (surface * 0.04)));

  if (uLava > 0.5) {
    // Dark crust floats on bright lava, splits along the swell, and chars at the banks.
    float fine = swell((vBoard * 2.7) + vec2(surface * 0.3));
    float crust = smoothstep(0.25, 0.95, abs(fine) / 1.6);
    color = mix(color * 1.2, vec3(0.2, 0.06, 0.03), crust * 0.72);
    color = mix(vec3(0.1, 0.03, 0.02), color, smoothstep(0.5, 0.6, depth));
  } else {
    color *= 1.0 + (facets(vBoard * 2.4) * 0.07);
    float shoreLine = 0.6 + (sin((surface * 1.5) + (uTime * 0.7)) * 0.03);
    color = mix(color, uFoam, smoothstep(0.022, 0.0, abs(depth - shoreLine)) * 0.65);
  }

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export interface WaterView {
  update: (time: number) => void
}

/** Animated water drawn in one pass under the painted land, with shores from a blurred mask. */
export function createWater(scene: THREE.Scene, state: GameState, theme: Theme, lava: boolean): WaterView {
  const data = new Uint8Array(COLS * ROWS)
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      data[cellIndex(col, row)] = state.terrain[cellIndex(col, row)] === 'water' ? 255 : 0
    }
  }
  const mask = new THREE.DataTexture(data, COLS, ROWS, THREE.RedFormat, THREE.UnsignedByteType)
  mask.magFilter = THREE.LinearFilter
  mask.minFilter = THREE.LinearFilter
  mask.needsUpdate = true

  const uniforms = {
    uTime: { value: 0 },
    uLava: { value: lava ? 1 : 0 },
    uShallow: { value: new THREE.Color(theme.water) },
    uDeep: { value: new THREE.Color(theme.waterDeep) },
    uFoam: { value: new THREE.Color(theme.foam) },
    uMask: { value: mask },
    uBoard: { value: new THREE.Vector2(COLS, ROWS) },
  }
  const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms, toneMapped: !lava })
  const water = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), material)
  water.rotation.x = -Math.PI / 2
  water.position.set(COLS / 2, -0.16, ROWS / 2)
  water.visible = state.terrain.includes('water')
  scene.add(water)

  return {
    update(time) {
      uniforms.uTime.value = time
    },
  }
}
