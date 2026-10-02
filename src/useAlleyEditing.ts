import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Marker } from 'maplibre-gl'
import type { GeoJSONSource, Map, MapMouseEvent } from 'maplibre-gl'
import { ALLEY_WIDTH_RANGE, alleysToGeoJSON, draftToGeoJSON } from './alleys'
import type { Alley, LngLat } from './alleys'
import { isInsideGamcheonMap } from './gamcheonBoundary'
import { ALLEY_DRAFT_SOURCE_ID, ALLEY_SOURCE_ID } from './mapStyle'
import { newId, replaceById } from './listUtils'

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

  useEffect(() => {
    const map = mapRef.current
    if (!map || !drawing) return
    const addPoint = (event: MapMouseEvent) => {
      const { lng, lat } = event.lngLat
      if (!isInsideGamcheonMap(lng, lat)) {
        setError('사각형 지도 안쪽을 클릭해 주세요.')
        return
      }
      setError('')
      setDraftPoints((current) => [...current, [lng, lat]])
    }
    map.on('click', addPoint)
    return () => { map.off('click', addPoint) }
  }, [drawing])

  // 선택한 골목길의 꼭짓점(드래그·더블클릭 삭제)과 구간 중간점(클릭 시 점 추가) 핸들입니다.
  useEffect(() => {
    const map = mapRef.current
    const alley = localAlleys.find((item) => item.id === selectedId)
    if (!map || !active || drawing || !alley) return
    const handles: Marker[] = []
    const withCoordinates = (coordinates: LngLat[]) => replaceById(localAlleys, alley.id, { coordinates })

    alley.coordinates.forEach((point, index) => {
      const element = document.createElement('div')
      element.className = 'gamcheon-map__alley-vertex'
      element.title = '드래그해 옮기기 · 더블클릭해 지우기'
      element.addEventListener('dblclick', (event) => {
        event.stopPropagation()
        if (alley.coordinates.length <= 2) return setError('골목길에는 점이 두 개 이상 필요합니다.')
        setError('')
        commit(withCoordinates(alley.coordinates.filter((_, other) => other !== index)))
      })
      const marker = new Marker({ element, draggable: true }).setLngLat(point).addTo(map)
      const moved = (): LngLat[] => {
        const { lng, lat } = marker.getLngLat()
        return alley.coordinates.map((current, other) => other === index ? [lng, lat] : current)
      }
      marker.on('drag', () => renderAlleys(map, { ...renderStateRef.current, alleys: withCoordinates(moved()) }))
      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat()
        if (!isInsideGamcheonMap(lng, lat)) {
          marker.setLngLat(point)
          renderAlleys(map, renderStateRef.current)
          return setError('사각형 지도 안쪽으로 옮겨 주세요.')
        }
        setError('')
        commit(withCoordinates(moved()))
      })
      handles.push(marker)
    })

    alley.coordinates.slice(1).forEach((point, index) => {
      const previous = alley.coordinates[index]
      const middle: LngLat = [(previous[0] + point[0]) / 2, (previous[1] + point[1]) / 2]
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'gamcheon-map__alley-midpoint'
      element.textContent = '+'
      element.setAttribute('aria-label', '이 구간에 점 추가')
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        commit(withCoordinates([...alley.coordinates.slice(0, index + 1), middle, ...alley.coordinates.slice(index + 1)]))
      })
      handles.push(new Marker({ element }).setLngLat(middle).addTo(map))
    })

    return () => handles.forEach((marker) => marker.remove())
  }, [active, drawing, localAlleys, selectedId])

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
    editorProps: {
      alleys: localAlleys,
      selectedId,
      drawing,
      draftCount: draftPoints.length,
      error,
      onStartDrawing: () => { setDrawing(true); setDraftPoints([]); setSelectedId(null); setError('') },
      onUndoPoint: () => setDraftPoints((current) => current.slice(0, -1)),
      onFinishDrawing: () => {
        if (draftPoints.length < 2) return
        const alley: Alley = { id: newId('alley'), coordinates: draftPoints, widthMeters: ALLEY_WIDTH_RANGE.default }
        commit([...localAlleys, alley])
        setSelectedId(alley.id)
        setDrawing(false)
        setDraftPoints([])
      },
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
