import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** One coloured piece of a low-poly model. */
export function part(geometry: THREE.BufferGeometry, color: number, position: readonly [number, number, number] = [0, 0, 0], rotation: readonly [number, number, number] = [0, 0, 0], scale: readonly [number, number, number] = [1, 1, 1]): THREE.BufferGeometry {
  // Boxes are indexed and cones are not, and merging needs them all alike.
  const piece = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  )
  piece.applyMatrix4(matrix)
  piece.computeVertexNormals()
  const tint = new THREE.Color(color)
  const count = piece.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let index = 0; index < count; index += 1) {
    colors.set([tint.r, tint.g, tint.b], index * 3)
  }
  piece.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  piece.deleteAttribute('uv')

  return piece
}

/** Merges parts into one geometry that draws in a single call. */
export function mergeParts(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries([...parts], false)
  for (const piece of parts) {
    piece.dispose()
  }
  if (!merged) {
    throw new Error('Tower Defense: model parts could not be merged')
  }
  merged.computeBoundingSphere()

  return merged
}

export const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d)
export const cylinder = (top: number, bottom: number, h: number, sides = 8): THREE.BufferGeometry => new THREE.CylinderGeometry(top, bottom, h, sides)
export const cone = (radius: number, h: number, sides = 8): THREE.BufferGeometry => new THREE.ConeGeometry(radius, h, sides)
export const ball = (radius: number, detail = 1): THREE.BufferGeometry => new THREE.IcosahedronGeometry(radius, detail)
export const crystal = (radius: number): THREE.BufferGeometry => new THREE.OctahedronGeometry(radius, 0)
