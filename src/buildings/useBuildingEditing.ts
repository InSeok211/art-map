import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { GeoJSONSource, Map, MapMouseEvent } from 'maplibre-gl'
import { ADDED_OUTLINE_POINTS, editedBuildingCount, NEW_BUILDING_DEFAULTS, setAdded, setModel, setOverride } from './buildingEdits'
import type { AddedBuilding, BuildingOverride, PlacedModel } from './buildingEdits'
import type { BuildingEditStore } from './buildingEditStore'
import type { ModelTools } from './BuildingModelPanel'
import { useModelLibrary } from './modelLibrary'
import type { ModelFile } from './modelLibrary'
import { isInsideGamcheonMap } from '../map/gamcheonBoundary'
import { BUILDING_EDIT_SOURCE_ID } from '../map/mapStyle'
import { clearOfCarriageways, getPhotographedStreetBuildings } from '../scene/streetSceneData'
import type { StreetBuilding } from '../scene/streetSceneData'
import { streetMeters } from '../map/streetCoordinates'
import { LANDMARK_BUILDING_IDS } from '../scene/landmarkBuildings'

// 작업실 '건물' 탭: 바닥의 건물 윤곽을 눌러 고르고, 고른 건물과 고친 건물을 지도에 표시합니다.
// '새 건물 그리기'를 누르면 지도에 꼭짓점을 찍어 새 건물 윤곽을 그립니다(첫 점을 다시 누르거나 '완성').
// 건물을 고른 뒤 올린 3D 모델(GLB)로 바꾸거나, 모델을 빈 땅에 둘 수 있습니다(모델 위치는 지도에 점으로 표시).
// 따로 만든 모델 건물(공방·그린하우스·아름다운한글)은 고칠 수 없습니다.
const EMPTY = { type: 'FeatureCollection' as const, features: [] }
// 첫 점을 이만큼(화면 픽셀) 가까이 누르면 윤곽을 닫습니다.
const CLOSE_PIXELS = 14
// 이보다 작은 윤곽(제곱미터)은 실수로 찍은 것으로 봅니다.
const MIN_AREA = 4

type Selection = { kind: 'osm'; id: number } | { kind: 'added'; id: string } | { kind: 'model'; id: string }
type Point = [number, number]
// 지도를 눌러 모델을 둘 곳을 고르는 중(새로 두기 / 옮기기)
type Placing = { kind: 'new'; file: ModelFile } | { kind: 'move'; id: string }
// 빈 땅에 처음 둘 때의 모델 크기(m)
const NEW_MODEL_WIDTH = 10
const MODEL_PICK_PIXELS = 10

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
const newPlacementId = () => `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// 건물 윤곽의 가장 긴 변 방향(도)과 그 방향의 길이(m). 모델을 건물 자리에 맞춰 둘 때 씁니다.
function outlineFit(outline: Point[]) {
  const meters = outline.map(streetMeters)
  let best = { length: 0, dx: 1, dz: 0 }
  for (let index = 0; index < meters.length; index++) {
    const [ax, az] = meters[index], [bx, bz] = meters[(index + 1) % meters.length]
    const length = Math.hypot(bx - ax, bz - az)
    if (length > best.length) best = { length, dx: (bx - ax) / length, dz: (bz - az) / length }
  }
  const along = meters.map(([x, z]) => x * best.dx + z * best.dz)
  const rotation = ((Math.atan2(best.dz, best.dx) * 180 / Math.PI) % 360 + 360) % 360
  return { rotation: Math.round(rotation * 10) / 10, widthMeters: Math.round((Math.max(...along) - Math.min(...along)) * 10) / 10 }
}
export function useBuildingEditing(mapRef: RefObject<Map | null>, active: boolean, store: BuildingEditStore | undefined) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [notice, setNotice] = useState('')
  const [drawing, setDrawing] = useState<Point[] | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [placing, setPlacing] = useState<Placing | null>(null)
  const draft = store?.draft
  const storeRef = useRef(store)
  storeRef.current = store
  const drawingRef = useRef(drawing)
  drawingRef.current = drawing
  const placingRef = useRef(placing)
  placingRef.current = placing
  const library = useModelLibrary(store ? store.server : null)

  // 탭을 떠나면 그리던 윤곽과 모델 두기를 그만둡니다.
  useEffect(() => { if (!active) { setDrawing(null); setPlacing(null) } }, [active])

  function placeAt(point: Point, current: Placing) {
    const edits = storeRef.current
    if (!edits) return
    if (current.kind === 'new') {
      const id = newPlacementId()
      edits.onChange(setModel(edits.draft, id, {
        id, modelId: current.file.id, name: current.file.name, longitude: point[0], latitude: point[1],
        rotation: 0, widthMeters: NEW_MODEL_WIDTH, replaces: [],
      }))
      setSelection({ kind: 'model', id })
    } else {
      const model = edits.draft.models.find((item) => item.id === current.id)
      if (model) edits.onChange(setModel(edits.draft, model.id, { ...model, longitude: point[0], latitude: point[1] }))
    }
    setPlacing(null)
    setNotice('')
  }
  const placeRef = useRef(placeAt)
  placeRef.current = placeAt

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
      const currentPlacing = placingRef.current
      if (currentPlacing) {
        const point: Point = [event.lngLat.lng, event.lngLat.lat]
        if (!isInsideGamcheonMap(point[0], point[1])) setNotice('지도 범위 밖에는 모델을 둘 수 없습니다.')
        else placeRef.current(point, currentPlacing)
        return
      }
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
      const { x, y } = event.point
      const model = map.queryRenderedFeatures([[x - MODEL_PICK_PIXELS, y - MODEL_PICK_PIXELS], [x + MODEL_PICK_PIXELS, y + MODEL_PICK_PIXELS]], { layers: ['building-edit-model-points'] })
        .find((feature) => typeof feature.properties?.modelPlacement === 'string')
      if (model) {
        setNotice('')
        setSelection({ kind: 'model', id: model.properties.modelPlacement as string })
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
      if (LANDMARK_BUILDING_IDS.has(id)) {
        setNotice('따로 만든 모델 건물(공방·그린하우스·아름다운한글)은 여기서 고칠 수 없습니다.')
        return
      }
      if (!streetBuilding(id)) {
        setNotice('너무 작거나 작업 범위 밖이라 3D로 그리지 않는 건물입니다.')
        return
      }
      setNotice('')
      // 모델로 바꾼 건물을 누르면 그 모델을 고릅니다.
      const replacing = storeRef.current?.draft.models.find((item) => item.replaces.includes(id))
      setSelection(replacing ? { kind: 'model', id: replacing.id } : { kind: 'osm', id })
    }
    map.on('click', click)
    return () => { map.off('click', click) }
  }, [active, store])

  // 모델 둘 곳을 고르는 동안: 십자 커서, Esc로 취소.
  const isPlacing = active && placing !== null
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isPlacing) return
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setPlacing(null) }
    map.getCanvas().style.cursor = 'crosshair'
    window.addEventListener('keydown', key)
    return () => {
      map.getCanvas().style.cursor = ''
      window.removeEventListener('keydown', key)
    }
  }, [isPlacing])

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
  const modelById = useMemo(() => new globalThis.Map((draft?.models ?? []).map((model) => [model.id, model])), [draft])

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
    // 모델 자리(점)와 모델이 대신하는 건물(회색 점선)
    const models = draft.models.flatMap((model) => [
      {
        type: 'Feature' as const,
        properties: { modelPlacement: model.id, state: selection?.kind === 'model' && selection.id === model.id ? 'model-selected' : 'model' },
        geometry: { type: 'Point' as const, coordinates: [model.longitude, model.latitude] },
      },
      ...model.replaces.flatMap((id) => {
        const building = streetBuilding(id)
        return building ? [{ type: 'Feature' as const, properties: { id, state: 'replaced' }, geometry: polygon(building.outline) }] : []
      }),
    ])
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
    return [...edited, ...added, ...models, ...sketch]
  }, [draft, selection, drawing, cursor])
  useEffect(() => {
    mapRef.current?.getSource<GeoJSONSource>(BUILDING_EDIT_SOURCE_ID)?.setData(active ? { type: 'FeatureCollection', features } : EMPTY)
  }, [active, features])

  const selectedOsm = selection?.kind === 'osm' ? streetBuilding(selection.id) : undefined
  const selectedAdded = selection?.kind === 'added' ? addedById.get(selection.id) : undefined
  const selectedModel = selection?.kind === 'model' ? modelById.get(selection.id) : undefined
  // 모델 파일을 지울 수 있는지(초안·공개본 어디에도 쓰이지 않을 때만)
  const published = store?.published
  const usedModelIds = useMemo(() => new Set([...(draft?.models ?? []), ...(published?.models ?? [])].map((model) => model.modelId)), [draft, published])
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
      models: {
        selected: selectedModel ?? null,
        placed: store.draft.models,
        placing: placing ? (placing.kind === 'new' ? `'${placing.file.name}'을(를) 둘 곳을 지도에서 누르세요.` : '모델을 옮길 곳을 지도에서 누르세요.') : '',
        files: library.files,
        usedIds: usedModelIds,
        uploading: library.uploading,
        error: library.error,
        onUpload: (file: File) => { void library.upload(file) },
        onDeleteFile: (id: string) => { void library.remove(id) },
        // 고른 건물(자동으로 만든 건물이나 새로 그린 건물)을 모델로 바꿉니다. 모델은 건물 자리 가운데에 긴 변 방향으로 둡니다.
        onReplace: (file: ModelFile) => {
          const outline = selectedOsm?.outline ?? selectedAdded?.outline
          if (!outline) return
          const id = newPlacementId()
          let next = store.draft
          if (selectedAdded) next = setAdded(next, selectedAdded.id, null)
          const [longitude, latitude] = centerOf(outline)
          next = setModel(next, id, {
            id, modelId: file.id, name: file.name, longitude, latitude, ...outlineFit(outline),
            replaces: selectedOsm ? [selectedOsm.id] : [],
          })
          store.onChange(next)
          setSelection({ kind: 'model', id })
        },
        onPlace: (file: ModelFile) => {
          setDrawing(null)
          setSelection(null)
          setPlacing({ kind: 'new', file })
        },
        onCancelPlacing: () => setPlacing(null),
        onChange: (patch: Partial<PlacedModel>) => {
          if (selectedModel) store.onChange(setModel(store.draft, selectedModel.id, { ...selectedModel, ...patch, id: selectedModel.id }))
        },
        onMove: () => { if (selectedModel) setPlacing({ kind: 'move', id: selectedModel.id }) },
        onRemove: () => {
          if (!selectedModel) return
          store.onChange(setModel(store.draft, selectedModel.id, null))
          setSelection(null)
        },
        onSelect: (id: string) => {
          setDrawing(null)
          setPlacing(null)
          setSelection({ kind: 'model', id })
          const model = modelById.get(id)
          const map = mapRef.current
          if (model && map) map.easeTo({ center: [model.longitude, model.latitude], zoom: Math.max(map.getZoom(), 18.5), duration: 600 })
        },
      } satisfies ModelTools,
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
        setPlacing(null)
        setSelection({ kind: 'osm', id })
        const building = streetBuilding(id)
        if (building) easeTo(building.outline)
      },
      onSelectAdded: (id: string) => {
        setDrawing(null)
        setPlacing(null)
        setSelection({ kind: 'added', id })
        const building = addedById.get(id)
        if (building) easeTo(building.outline)
      },
      onStartDrawing: () => {
        setSelection(null)
        setPlacing(null)
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
