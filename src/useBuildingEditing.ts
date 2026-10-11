import { useEffect, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import type { GeoJSONSource, Map, MapMouseEvent } from 'maplibre-gl'
import { editedBuildingCount, setOverride } from './buildingEdits'
import type { BuildingOverride } from './buildingEdits'
import type { BuildingEditStore } from './buildingEditStore'
import { BUILDING_EDIT_SOURCE_ID } from './mapStyle'
import { getPhotographedStreetBuildings } from './streetSceneData'
import type { StreetBuilding } from './streetSceneData'
import { MODEL_BUILDING_IDS } from './modelBuildings'

// 작업실 '건물' 탭: 바닥의 건물 윤곽을 눌러 고르고, 고른 건물과 고친 건물을 지도에 표시합니다.
// 따로 만든 모델 건물(공방·그린하우스·아름다운한글)은 고칠 수 없습니다.
const EMPTY = { type: 'FeatureCollection' as const, features: [] }

let buildingIndex: globalThis.Map<number, StreetBuilding> | null = null
function streetBuilding(id: number) {
  buildingIndex ??= new globalThis.Map(getPhotographedStreetBuildings().map((building) => [building.id, building]))
  return buildingIndex.get(id)
}

export function useBuildingEditing(mapRef: RefObject<Map | null>, active: boolean, store: BuildingEditStore | undefined) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const draft = store?.draft

  // 지도에서 건물 윤곽을 누르면 고릅니다.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !active || !store) return
    const pick = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ['building-footprint-fill'] })[0]
      const id = Number(feature?.properties?.id)
      if (!feature || !Number.isFinite(id)) return
      if (MODEL_BUILDING_IDS.has(id)) {
        setNotice('따로 만든 모델 건물(공방·그린하우스·아름다운한글)은 여기서 고칠 수 없습니다.')
        return
      }
      if (!streetBuilding(id)) {
        setNotice('너무 작거나 작업 범위 밖이라 3D로 그리지 않는 건물입니다.')
        return
      }
      setNotice('')
      setSelectedId(id)
    }
    map.on('click', pick)
    return () => { map.off('click', pick) }
  }, [active, store])

  // 고른 건물(주황)과 고친 건물(보라, 숨긴 건물은 회색 점선)을 표시합니다.
  const features = useMemo(() => {
    if (!draft) return []
    const ids = new Set([...Object.keys(draft.overrides).map(Number), ...(selectedId !== null ? [selectedId] : [])])
    return [...ids].flatMap((id) => {
      const building = streetBuilding(id)
      if (!building) return []
      const state = id === selectedId ? 'selected' : draft.overrides[id]?.hidden ? 'hidden' : 'edited'
      return [{
        type: 'Feature' as const,
        properties: { id, state },
        geometry: { type: 'Polygon' as const, coordinates: [[...building.outline, building.outline[0]]] },
      }]
    })
  }, [draft, selectedId])
  useEffect(() => {
    mapRef.current?.getSource<GeoJSONSource>(BUILDING_EDIT_SOURCE_ID)?.setData(active ? { type: 'FeatureCollection', features } : EMPTY)
  }, [active, features])

  const selected = selectedId !== null ? streetBuilding(selectedId) : undefined
  return {
    panelProps: store ? {
      selected: selected ? { building: selected, override: draft?.overrides[selected.id] ?? {} } : null,
      notice,
      editedIds: Object.keys(store.draft.overrides).map(Number),
      editedCount: editedBuildingCount(store.draft),
      publishedCount: editedBuildingCount(store.published),
      dirty: store.dirty,
      busy: store.busy,
      status: store.status,
      onChange: (override: BuildingOverride | null) => {
        if (selected) store.onChange(setOverride(store.draft, selected.id, override))
      },
      onSelect: (id: number) => {
        setSelectedId(id)
        const building = streetBuilding(id)
        const map = mapRef.current
        if (building && map) {
          const center = building.outline.reduce(([x, z], [lng, lat]) => [x + lng / building.outline.length, z + lat / building.outline.length], [0, 0])
          map.easeTo({ center: center as [number, number], zoom: Math.max(map.getZoom(), 18.5), duration: 600 })
        }
      },
      onClose: () => setSelectedId(null),
      onPublish: store.onPublish,
      onDiscard: store.onDiscard,
    } : null,
  }
}
