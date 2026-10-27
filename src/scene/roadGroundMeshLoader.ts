import { decodeRoadGroundMesh } from './roadGroundMesh'
import type { RoadGroundMesh } from './roadGroundMesh'
import roadGroundMeshUrl from '../generated/road-ground-mesh.bin?url'

// 미리 삼각분할한 도로·보도 면(road-ground-mesh.bin)을 한 번만 받아 둡니다. 지도를 만들 때 미리 받기 시작하고
// (prefetch), 3D 거리를 만들 때 기다립니다. 번들과 따로 받으므로 자바스크립트 파싱을 막지 않고 캐시도 따로 됩니다.
let loading: Promise<RoadGroundMesh> | null = null

export function loadRoadGroundMesh() {
  loading ??= fetch(roadGroundMeshUrl).then(async (response) => {
    if (!response.ok) throw new Error(`${response.status} ${roadGroundMeshUrl}`)
    return decodeRoadGroundMesh(await response.arrayBuffer())
  }).catch((cause) => { loading = null; throw cause })
  return loading
}

/** 결과를 기다리지 않고 받기만 시작합니다(실패는 나중에 loadRoadGroundMesh를 기다리는 쪽에서 처리). */
export function prefetchRoadGroundMesh() {
  loadRoadGroundMesh().catch(() => undefined)
}
