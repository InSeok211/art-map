import { describe, expect, it } from 'vitest'
import { dragFrame, handleLabel, handlePosition, snapAngle } from './transformHandles'

const frame = { center: [10, 20] as [number, number], angle: 0, reach: 5 }

describe('transform handles', () => {
  it('puts rotate in front and scale behind along the long side', () => {
    expect(handlePosition(frame, 'move')).toEqual([10, 20])
    expect(handlePosition(frame, 'rotate')).toEqual([15, 20])
    const scale = handlePosition({ ...frame, angle: 90 }, 'scale')
    expect(scale[0]).toBeCloseTo(10)
    expect(scale[1]).toBeCloseTo(15)
  })

  it('snaps near multiples of 15 degrees only', () => {
    expect(snapAngle(43)).toBe(45)
    expect(snapAngle(-2)).toBe(0)
    expect(snapAngle(359)).toBe(0)
    expect(snapAngle(52)).toBe(52)
  })

  it('moves, turns toward the pointer and clamps the size', () => {
    expect(dragFrame(frame, 'move', [12, 22], 0.5, 60).center).toEqual([12, 22])
    expect(dragFrame(frame, 'rotate', [10, 30], 0.5, 60).angle).toBe(90)
    expect(dragFrame(frame, 'rotate', [10, 20], 0.5, 60)).toBe(frame)
    expect(dragFrame(frame, 'scale', [13, 24], 0.5, 60).reach).toBe(5)
    expect(dragFrame(frame, 'scale', [500, 20], 0.5, 60).reach).toBe(60)
    expect(dragFrame(frame, 'scale', [10, 20.1], 0.5, 60).reach).toBe(0.5)
  })

  it('labels the value being changed', () => {
    const width = (reach: number) => `폭 ${(reach * 2).toFixed(1)}m`
    expect(handleLabel('move', frame, { ...frame, center: [13, 24] }, width)).toBe('5.0m')
    expect(handleLabel('rotate', frame, { ...frame, angle: 44.6 }, width)).toBe('45°')
    expect(handleLabel('scale', frame, { ...frame, reach: 6 }, width)).toBe('폭 12.0m')
  })
})
