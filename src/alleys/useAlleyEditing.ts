import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { GeoJSONSource, Map } from 'maplibre-gl'
import { ALLEY_WIDTH_RANGE, alleysToGeoJSON, draftToGeoJSON } from './alleys'
import type { Alley, LngLat } from './alleys'
import { ALLEY_DRAFT_SOURCE_ID, ALLEY_SOURCE_ID } from '../map/mapStyle'
import { newId, replaceById } from '../map/listUtils'
import { useGeomanGeometry } from '../map/useGeomanGeometry'

interface AlleyRenderState {
  alleys: Alley[]
  selectedId: string | null
  draft: LngLat[]
}

function renderAlleys(map: Map, { alleys, selectedId, draft }: AlleyRenderState) {
  map.getSource<GeoJSONSource>(ALLEY_SOURCE_ID)?.setData(alleysToGeoJSON(alleys, selectedId))
  map.getSource<GeoJSONSource>(ALLEY_DRAFT_SOURCE_ID)?.setData(draftToGeoJSON(draft))
}

// 골목길 탭의 상태와 지도 상호작용(점 찍기, 꼭짓점 드래그·삭제, 중간점 추가)을 묶은 훅입니다.
export function useAlleyEditing(
  mapRef: RefObject<Map | null>,
  active: boolean,
  alleys: Alley[],
  onAlleysChange?: (alleys: Alley[]) => void,
  terrainEnabled = false,
) {
  const [localAlleys, setLocalAlleys] = useState<Alley[]>(alleys)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [draftPoints, setDraftPoints] = useState<LngLat[]>([])
  const [error, setError] = useState('')
  const renderStateRef = useRef<AlleyRenderState>({ alleys, selectedId: null, draft: [] })

  useEffect(() => setLocalAlleys(alleys), [alleys])

  function commit(next: Alley[]) {
    setLocalAlleys(next)
    onAlleysChange?.(next)
  }

  useEffect(() => {
    const state = {
      alleys: localAlleys,
      selectedId: active ? selectedId : null,
      draft: drawing ? draftPoints : [],
    }
    renderStateRef.current = state
    if (mapRef.current) renderAlleys(mapRef.current, state)
  }, [localAlleys, selectedId, active, drawing, draftPoints])

  const selected = localAlleys.find(item => item.id === selectedId)
  const geometry = useGeomanGeometry(mapRef, {
    active, drawing, shape: 'line', terrainEnabled,
    feature: !drawing && selected ? { type: 'Feature', id: selected.id, properties: {},
      geometry: { type: 'LineString', coordinates: selected.coordinates } } : null,
    onDraft: setDraftPoints,
    onError: setError,
    onCancel: stopDrawing,
    onCreate: coordinates => {
      const alley: Alley = { id: newId('alley'), coordinates, widthMeters: ALLEY_WIDTH_RANGE.default }
      commit([...localAlleys, alley])
      setSelectedId(alley.id)
      stopDrawing()
    },
    onEdit: coordinates => {
      if (selected) commit(replaceById(localAlleys, selected.id, { coordinates }))
      setError('')
    },
  })
  useEffect(() => { if (!active) stopDrawing() }, [active])

  function stopDrawing() {
    setDrawing(false)
    setDraftPoints([])
    setError('')
  }

  return {
    drawing,
    // 지도 스타일을 (다시) 불러온 뒤 골목길 소스를 현재 상태로 채웁니다.
    renderOnto: (map: Map) => renderAlleys(map, renderStateRef.current),
    stopDrawing,
    // GPS 기록에서 찾은 후보를 골목길로 추가합니다(useAlleyFinder).
    addAlley: (next: Alley) => commit([...localAlleys, next]),
    editorProps: {
      alleys: localAlleys,
      selectedId,
      drawing,
      draftCount: draftPoints.length,
      error,
      onStartDrawing: () => { setDrawing(true); setDraftPoints([]); setSelectedId(null); setError('') },
      onUndoPoint: geometry.undo,
      onFinishDrawing: geometry.finish,
      onCancelDrawing: stopDrawing,
      onSelect: (id: string) => {
        setSelectedId(id)
        setError('')
        const alley = localAlleys.find((item) => item.id === id)
        const map = mapRef.current
        if (alley && map) {
          const [lng, lat] = alley.coordinates[Math.floor(alley.coordinates.length / 2)]
          map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 17) })
        }
      },
      onUpdate: (id: string, patch: Partial<Alley>) => commit(replaceById(localAlleys, id, patch)),
      onDelete: (id: string) => { commit(localAlleys.filter((item) => item.id !== id)); setSelectedId(null) },
    },
  }
}
