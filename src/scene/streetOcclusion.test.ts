import { describe, expect, it } from 'vitest'
import { findPointOccluders } from './streetOcclusion'

// 10m 높이 건물(z 0~10). 북쪽이 -z 방향입니다.
const building = { outline: [[-5, 0], [5, 0], [5, 10], [-5, 10]] as [number, number][], height: 10 }

describe('street building occlusion', () => {
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
