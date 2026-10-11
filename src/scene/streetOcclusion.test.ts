import { describe, expect, it } from 'vitest'
import { findPointOccluders, findRoadOccluders, RoadIndex } from './streetOcclusion'

// 동서로 지나는 폭 6m 길(z = -20)과 그 남쪽의 10m 높이 건물(z 0~10)
const road = new RoadIndex([{ points: [[-50, -20], [50, -20]], width: 6 }])
const building = { outline: [[-5, 0], [5, 0], [5, 10], [-5, 10]] as [number, number][], height: 10 }

describe('street building occlusion', () => {
  it('finds a road inside the cell index by distance to its centreline', () => {
    expect(road.contains(0, -20)).toBe(true)
    expect(road.contains(0, -17.5)).toBe(true)
    expect(road.contains(0, -12)).toBe(false)
  })

  it('treats a building as hiding the road behind it when looking toward the road at an angle', () => {
    // 북쪽(길 쪽)을 보며 60° 기울이면 10m 건물이 뒤로 약 17m 땅을 가려 길에 닿습니다.
    expect(findRoadOccluders([building], road, 0, 60).has(0)).toBe(true)
    // 길을 등지고(남쪽) 보거나, 위에서 거의 바로 내려다보면 길을 가리지 않습니다.
    expect(findRoadOccluders([building], road, 180, 60).size).toBe(0)
    expect(findRoadOccluders([building], road, 0, 10).size).toBe(0)
    // 낮은 건물은 가려지는 거리가 짧아 길까지 닿지 않습니다.
    expect(findRoadOccluders([{ ...building, height: 3 }], road, 0, 60).size).toBe(0)
  })

  it('skips buildings outside the area the camera is looking at', () => {
    expect(findRoadOccluders([building], road, 0, 60, { x: 0, z: 0, radius: 50 }).has(0)).toBe(true)
    expect(findRoadOccluders([building], road, 0, 60, { x: 300, z: 0, radius: 50 }).size).toBe(0)
  })

  it('finds the nearby building that hides my position from the camera', () => {
    // 건물(z 0~10) 북쪽 바로 뒤(z -5)에 서 있고, 남쪽에서 북쪽을 바라보며 60° 기울였습니다.
    expect(findPointOccluders([building], [0, -5], 0, 60).has(0)).toBe(true)
    // 건물 남쪽 앞(카메라와 건물 사이)에 서 있으면 가리지 않습니다.
    expect(findPointOccluders([building], [0, 15], 0, 60).size).toBe(0)
    // 반대 방향에서 보거나, 거의 바로 위에서 보거나, 멀리 떨어져 있으면 가리지 않습니다.
    expect(findPointOccluders([building], [0, -5], 180, 60).size).toBe(0)
    expect(findPointOccluders([building], [0, -5], 0, 10).size).toBe(0)
    expect(findPointOccluders([building], [0, -40], 0, 60).size).toBe(0)
    // GPS 오차로 건물 안에 찍혀도 그 건물을 비치게 합니다.
    expect(findPointOccluders([building], [0, 5], 0, 0).has(0)).toBe(true)
  })
})
