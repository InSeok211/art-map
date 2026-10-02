import { describe, expect, it } from 'vitest'
import roadGround from './generated/road-ground.json'
import { ribbonPolygons } from './roadGround'
import { roadGroundInputsHash } from '../scripts/road-ground-inputs.mjs'

describe('precomputed road ground', () => {
  it('is up to date with the map data and geometry code (run `npm run build:road-ground` if this fails)', () => {
    expect(roadGround.inputsHash).toBe(roadGroundInputsHash())
  })

  it('contains every drawn surface', () => {
    for (const key of ['roads', 'outer', 'footways', 'kerbStone', 'kerbLine', 'meeting'] as const) {
      expect(roadGround[key].length, key).toBeGreaterThan(0)
    }
  })

  it('offsets a ribbon to the side of its centreline', () => {
    const [ribbon] = ribbonPolygons([[0, 0], [10, 0]], 1, 3)
    const zs = ribbon[0].map(([, z]) => z)
    expect(Math.min(...zs)).toBeCloseTo(2.5)
    expect(Math.max(...zs)).toBeCloseTo(3.5)
  })
})
