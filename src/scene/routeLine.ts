import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { STREET_ORIGIN, streetMeters } from '../map/streetCoordinates'
import type { TerrainSampler } from '../map/terrain'
import { drapeOnTerrain, flatPolygonGeometry, isDrawablePolygon, TERRAIN_GROUND_LIFT } from './groundGeometry'
import { roadOutlines, unionRoadAreas } from './roadCorridors'

// 3D 지형에서 길찾기 경로 선을 땅 위에 띠로 그립니다. 바탕 지도의 경로 선은 지형 면에 붙어 3D 거리에 가려
// 보이지 않으므로, 지형을 켠 동안에는 GamcheonMap이 그 선을 숨기고 이 띠를 씁니다. 평지의 경로 선처럼 건물에
// 가리지 않고 늘 위에 보입니다.
// 바탕 지도의 경로 선(mapStyle의 route-casing·route-line)과 같은 화면 굵기(px)를 지금 줌의 미터로 바꿔 그립니다.
export function routeLineMeshes(coordinates: [number, number][], terrain: Pick<TerrainSampler, 'height'>, zoom: number) {
  const points = coordinates.map(streetMeters)
  const metersPerPixel = 40_075_016.686 * Math.cos(STREET_ORIGIN[1] * Math.PI / 180) / (512 * 2 ** zoom)
  const pixels = (stops: [number, number][]) => {
    if (zoom <= stops[0][0]) return stops[0][1]
    for (let i = 1; i < stops.length; i++) if (zoom <= stops[i][0]) {
      const [z0, w0] = stops[i - 1], [z1, w1] = stops[i]
      return w0 + (w1 - w0) * (zoom - z0) / (z1 - z0)
    }
    return stops[stops.length - 1][1]
  }
  const casing = Math.max(3.4, pixels([[14, 5], [18, 11], [21, 18]]) * metersPerPixel)
  const line = Math.max(2.2, pixels([[14, 3], [18, 7], [21, 12]]) * metersPerPixel)
  const meshes: THREE.Mesh[] = []
  // 흰 테두리 위에 파란 선(바탕 지도의 경로 선과 같은 색)
  for (const [width, color, order] of [[casing, 0xffffff, 7], [line, 0x2f6fd6, 8]] as const) {
    const geometries = unionRoadAreas(roadOutlines([{ points, width, type: 'route', gaps: [] }]))
      .filter(isDrawablePolygon)
      .map((polygon) => drapeOnTerrain(flatPolygonGeometry(polygon), terrain, TERRAIN_GROUND_LIFT + 0.6, Math.max(3, width / 2)))
    if (!geometries.length) continue
    const mesh = new THREE.Mesh(mergeGeometries(geometries), new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false }))
    geometries.forEach((geometry) => geometry.dispose())
    mesh.frustumCulled = false
    mesh.renderOrder = order
    meshes.push(mesh)
  }
  return meshes
}
