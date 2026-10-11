import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { GeoJSONSource, Map, MapMouseEvent } from 'maplibre-gl'
import { ADDED_OUTLINE_POINTS, editedBuildingCount, NEW_BUILDING_DEFAULTS, setAdded, setOverride } from './buildingEdits'
import type { AddedBuilding, BuildingOverride } from './buildingEdits'
import type { BuildingEditStore } from './buildingEditStore'
import { isInsideGamcheonMap } from './gamcheonBoundary'
import { BUILDING_EDIT_SOURCE_ID } from './mapStyle'
import { clearOfCarriageways, getPhotographedStreetBuildings } from './streetSceneData'
import type { StreetBuilding } from './streetSceneData'
import { streetMeters } from './streetCoordinates'
import { MODEL_BUILDING_IDS } from './modelBuildings'

// 작업실 '건물' 탭: 바닥의 건물 윤곽을 눌러 고르고, 고른 건물과 고친 건물을 지도에 표시합니다.
// '새 건물 그리기'를 누르면 지도에 꼭짓점을 찍어 새 건물 윤곽을 그립니다(첫 점을 다시 누르거나 '완성').
// 따로 만든 모델 건물(공방·그린하우스·아름다운한글)은 고칠 수 없습니다.
const EMPTY = { type: 'FeatureCollection' as const, features: [] }
// 첫 점을 이만큼(화면 픽셀) 가까이 누르면 윤곽을 닫습니다.
const CLOSE_PIXELS = 14
// 이보다 작은 윤곽(제곱미터)은 실수로 찍은 것으로 봅니다.
const MIN_AREA = 4

type Selection = { kind: 'osm'; id: number } | { kind: 'added'; id: string }
type Point = [number, number]

let buildingIndex: globalThis.Map<number, StreetBuilding> | null = null
function streetBuilding(id: number) {
  buildingIndex ??= new globalThis.Map(getPhotographedStreetBuildings().map((building) => [building.id, building]))
  return buildingIndex.get(id)
}

function areaMeters(outline: Point[]) {
  const meters = outline.map(streetMeters)
  let area = 0
  for (let index = 0; index < meters.length; index++) {
    const [ax, az] = meters[index], [bx, bz] = meters[(index + 1) % meters.length]
    area += ax * bz - bx * az
  }
  return Math.abs(area) / 2
}

const centerOf = (outline: Point[]) =>
  outline.reduce(([x, z], [lng, lat]) => [x + lng / outline.length, z + lat / outline.length], [0, 0]) as Point
const newBuildingId = () => `b-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function useBuildingEditing(mapRef: RefObject<Map | null>, active: boolean, store: BuildingEditStore | undefined) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [notice, setNotice] = useState('')
  const [drawing, setDrawing] = useState<Point[] | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const draft = store?.draft
  const storeRef = useRef(store)
  storeRef.current = store
  const drawingRef = useRef(drawing)
  drawingRef.current = drawing

  // 탭을 떠나면 그리던 윤곽을 버립니다.
  useEffect(() => { if (!active) setDrawing(null) }, [active])

  function finishDrawing(points: Point[]) {
    const current = storeRef.current
    if (!current) return
    if (points.length < ADDED_OUTLINE_POINTS.min || areaMeters(points) < MIN_AREA) {
      setNotice('점을 3개 이상, 너무 작지 않게 찍어 주세요.')
      return
    }
    const id = newBuildingId()
    current.onChange(setAdded(current.draft, id, { id, outline: points, ...NEW_BUILDING_DEFAULTS }))
    setDrawing(null)
    setCursor(null)
    setNotice('')
    setSelection({ kind: 'added', id })
  }
  const finishRef = useRef(finishDrawing)
  finishRef.current = finishDrawing

  // 지도를 누르면: 그리는 중이면 꼭짓점을 찍고, 아니면 건물을 고릅니다.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !active || !store) return
    const click = (event: MapMouseEvent) => {
      const points = drawingRef.current
      if (points) {
        const first = points[0] && map.project(points[0])
        if (first && points.length >= ADDED_OUTLINE_POINTS.min && Math.hypot(first.x - event.point.x, first.y - event.point.y) <= CLOSE_PIXELS) {
          finishRef.current(points)
          return
        }
        const point: Point = [event.lngLat.lng, event.lngLat.lat]
        if (!isInsideGamcheonMap(point[0], point[1])) {
          setNotice('지도 범위 밖에는 건물을 그릴 수 없습니다.')
          return
        }
        if (points.length >= ADDED_OUTLINE_POINTS.max) {
          setNotice(`꼭짓점은 ${ADDED_OUTLINE_POINTS.max}개까지 찍을 수 있습니다.`)
          return
        }
        setNotice('')
        setDrawing([...points, point])
        return
      }
      const added = map.queryRenderedFeatures(event.point, { layers: ['building-edit-fill'] })
        .find((feature) => typeof feature.properties?.addedId === 'string')
      if (added) {
        setNotice('')
        setSelection({ kind: 'added', id: added.properties.addedId as string })
        return
      }
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
      setSelection({ kind: 'osm', id })
    }
    map.on('click', click)
    return () => { map.off('click', click) }
  }, [active, store])

  // 그리는 동안: 십자 커서, 마지막 점에서 커서까지 선 미리 보기, 두 번 눌러 확대 끄기, Esc로 취소.
  const isDrawing = active && drawing !== null
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isDrawing) return
    const move = (event: MapMouseEvent) => setCursor([event.lngLat.lng, event.lngLat.lat])
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawing(null) }
    map.getCanvas().style.cursor = 'crosshair'
    map.doubleClickZoom.disable()
    map.on('mousemove', move)
    window.addEventListener('keydown', key)
    return () => {
      map.getCanvas().style.cursor = ''
      map.doubleClickZoom.enable()
      map.off('mousemove', move)
      window.removeEventListener('keydown', key)
      setCursor(null)
    }
  }, [isDrawing])

  const addedById = useMemo(() => new globalThis.Map((draft?.added ?? []).map((building) => [building.id, building])), [draft])

  // 고른 건물(주황), 고친 건물(보라, 숨긴 건물은 회색 점선), 새 건물(초록), 그리는 윤곽(주황 점선)을 표시합니다.
  const features = useMemo(() => {
    if (!draft) return []
    const polygon = (outline: Point[]) => ({ type: 'Polygon' as const, coordinates: [[...outline, outline[0]]] })
    const ids = new Set([...Object.keys(draft.overrides).map(Number), ...(selection?.kind === 'osm' ? [selection.id] : [])])
    const edited = [...ids].flatMap((id) => {
      const building = streetBuilding(id)
      if (!building) return []
      const state = selection?.kind === 'osm' && id === selection.id ? 'selected' : draft.overrides[id]?.hidden ? 'hidden' : 'edited'
      return [{ type: 'Feature' as const, properties: { id, state }, geometry: polygon(building.outline) }]
    })
    const added = draft.added.map((building) => ({
      type: 'Feature' as const,
      properties: { addedId: building.id, state: selection?.kind === 'added' && selection.id === building.id ? 'selected' : 'added' },
      geometry: polygon(building.outline),
    }))
    const sketch = drawing ? [
      ...(drawing.length >= 3 ? [{ type: 'Feature' as const, properties: { state: 'drawing' }, geometry: polygon(drawing) }] : []),
      ...(drawing.length && (cursor || drawing.length >= 2) ? [{
        type: 'Feature' as const, properties: { state: 'drawing' },
        geometry: { type: 'LineString' as const, coordinates: cursor ? [...drawing, cursor] : drawing },
      }] : []),
      ...drawing.map((point, index) => ({
        type: 'Feature' as const, properties: { state: index === 0 ? 'first' : 'vertex' },
        geometry: { type: 'Point' as const, coordinates: point },
      })),
    ] : []
    return [...edited, ...added, ...sketch]
  }, [draft, selection, drawing, cursor])
  useEffect(() => {
    mapRef.current?.getSource<GeoJSONSource>(BUILDING_EDIT_SOURCE_ID)?.setData(active ? { type: 'FeatureCollection', features } : EMPTY)
  }, [active, features])

  const selectedOsm = selection?.kind === 'osm' ? streetBuilding(selection.id) : undefined
  const selectedAdded = selection?.kind === 'added' ? addedById.get(selection.id) : undefined
  // 새 건물이 차도·보행로와 겹치는지(겹치면 '길 밖으로 깎기'로 겹친 부분을 잘라 낼 수 있음)
  const trimmed = useMemo(() => {
    if (!selectedAdded) return undefined
    const clear = clearOfCarriageways(selectedAdded.outline)
    return clear === selectedAdded.outline ? undefined : clear
  }, [selectedAdded])

  const easeTo = (outline: Point[]) => {
    const map = mapRef.current
    if (map) map.easeTo({ center: centerOf(outline), zoom: Math.max(map.getZoom(), 18.5), duration: 600 })
  }

  return {
    panelProps: store ? {
      selected: selectedOsm ? { building: selectedOsm, override: draft?.overrides[selectedOsm.id] ?? {} } : null,
      added: selectedAdded ?? null,
      onRoad: trimmed !== undefined,
      drawingPoints: drawing ? drawing.length : null,
      notice,
      editedIds: Object.keys(store.draft.overrides).map(Number),
      addedIds: store.draft.added.map((building) => building.id),
      editedCount: editedBuildingCount(store.draft),
      publishedCount: editedBuildingCount(store.published),
      dirty: store.dirty,
      busy: store.busy,
      status: store.status,
      onChange: (override: BuildingOverride | null) => {
        if (selectedOsm) store.onChange(setOverride(store.draft, selectedOsm.id, override))
      },
      onChangeAdded: (patch: Partial<AddedBuilding>) => {
        if (selectedAdded) store.onChange(setAdded(store.draft, selectedAdded.id, { ...selectedAdded, ...patch, id: selectedAdded.id }))
      },
      onRemoveAdded: () => {
        if (!selectedAdded) return
        store.onChange(setAdded(store.draft, selectedAdded.id, null))
        setSelection(null)
      },
      onTrimRoad: () => {
        if (!selectedAdded) return
        if (!trimmed) {
          setNotice('윤곽 전체가 길 위에 있어 깎으면 남는 부분이 없습니다. 지우고 다시 그려 주세요.')
          return
        }
        setNotice('')
        store.onChange(setAdded(store.draft, selectedAdded.id, { ...selectedAdded, outline: trimmed }))
      },
      onSelect: (id: number) => {
        setDrawing(null)
        setSelection({ kind: 'osm', id })
        const building = streetBuilding(id)
        if (building) easeTo(building.outline)
      },
      onSelectAdded: (id: string) => {
        setDrawing(null)
        setSelection({ kind: 'added', id })
        const building = addedById.get(id)
        if (building) easeTo(building.outline)
      },
      onStartDrawing: () => {
        setSelection(null)
        setNotice('')
        setDrawing([])
      },
      onUndoPoint: () => setDrawing((points) => points ? points.slice(0, -1) : points),
      onFinishDrawing: () => { if (drawing) finishDrawing(drawing) },
      onCancelDrawing: () => { setDrawing(null); setNotice('') },
      onClose: () => setSelection(null),
      onPublish: store.onPublish,
      onDiscard: store.onDiscard,
    } : null,
  }
}
