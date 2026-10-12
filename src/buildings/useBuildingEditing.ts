import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { GeoJSONSource, Map, MapMouseEvent } from 'maplibre-gl'
import { Marker } from 'maplibre-gl'
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
import { outlinePlacement, placedOutline } from './buildingSettings'
import type { BuildingPlacement, BuildingSettings } from './buildingSettings'
import type { BuildingSelection } from './buildingSelection'
import { streetLngLat } from '../map/streetCoordinates'
import { loadTerrain } from '../map/terrain'
import { terrainBuildingPlan } from '../scene/terrain/terrainBuildingGeometry'
import { distanceToRoad } from '../scene/streetRoadGeometry'
import { TERRAIN_GROUND_LIFT } from '../scene/groundGeometry'

// 작업실 '건물' 탭: 바닥의 건물 윤곽을 눌러 고르고, 고른 건물과 고친 건물을 지도에 표시합니다.
// '새 건물 그리기'를 누르면 지도에 꼭짓점을 찍어 새 건물 윤곽을 그립니다(첫 점을 다시 누르거나 '완성').
// 건물을 고른 뒤 올린 3D 모델(GLB)로 바꾸거나, 모델을 빈 땅에 둘 수 있습니다(모델 위치는 지도에 점으로 표시).
// 따로 만든 모델 건물(공방·그린하우스·아름다운한글)은 고칠 수 없습니다.
const EMPTY = { type: 'FeatureCollection' as const, features: [] }
// 첫 점을 이만큼(화면 픽셀) 가까이 누르면 윤곽을 닫습니다.
const CLOSE_PIXELS = 14
// 이보다 작은 윤곽(제곱미터)은 실수로 찍은 것으로 봅니다.
const MIN_AREA = 4

type Selection = BuildingSelection
type Point = [number, number]
// 지도를 눌러 모델을 둘 곳을 고르는 중(새로 두기 / 옮기기)
type Placing = { kind: 'new'; file: ModelFile } | { kind: 'move'; id: string }
  | { kind: 'building' | 'entrance'; selection: Selection }
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
export function useBuildingEditing(mapRef: RefObject<Map | null>, active: boolean, store: BuildingEditStore | undefined,
  options?: { pick: (point: { x: number; y: number }) => Selection | null; terrainMode: boolean }) {
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
  const optionsRef = useRef(options)
  optionsRef.current = options

  function changeSettings(target: Selection, patch: Partial<BuildingSettings>) {
    const current = storeRef.current
    if (!current) return
    if (target.kind === 'osm') current.onChange(setOverride(current.draft, target.id, { ...current.draft.overrides[target.id], ...patch }))
    else if (target.kind === 'added') {
      const item = current.draft.added.find((item) => item.id === target.id)
      if (item) current.onChange(setAdded(current.draft, item.id, { ...item, ...patch }))
    } else {
      const item = current.draft.models.find((item) => item.id === target.id)
      if (item) current.onChange(setModel(current.draft, item.id, { ...item, ...patch }))
    }
  }

  function select(target: Selection) {
    if (target.kind === 'osm' && LANDMARK_BUILDING_IDS.has(target.id)) {
      setNotice('공방·그린하우스·아름다운한글은 전용 모델입니다. 일반 건물 편집에서는 변경하지 않습니다.')
      return
    }
    if (target.kind === 'osm' && !streetBuilding(target.id)) { setNotice('해당 번호의 편집 가능한 건물이 없습니다.'); return }
    const replacing = target.kind === 'osm' && storeRef.current?.draft.models.find((item) => item.replaces.includes(target.id))
    setSelection(replacing ? { kind: 'model', id: replacing.id } : target)
    setNotice('')
  }

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
    } else if (current.kind === 'move') {
      const model = edits.draft.models.find((item) => item.id === current.id)
      if (model) edits.onChange(setModel(edits.draft, model.id, { ...model, longitude: point[0], latitude: point[1] }))
    } else {
      const target = current.selection
      const item = target.kind === 'osm' ? edits.draft.overrides[target.id] : target.kind === 'added'
        ? edits.draft.added.find((item) => item.id === target.id) : edits.draft.models.find((item) => item.id === target.id)
      if (current.kind === 'entrance') changeSettings(target, { terrain: { ...item?.terrain, entrance: point } })
      else {
        const shape = target.kind === 'osm' ? streetBuilding(target.id)?.outline : target.kind === 'added' ? (item as AddedBuilding)?.outline : undefined
        if (shape) {
          const placement = item?.placement ?? outlinePlacement(shape)
          const next = { ...placement, longitude: point[0], latitude: point[1] }
          if (!placedOutline(shape, next).every(([lng, lat]) => isInsideGamcheonMap(lng, lat))) { setNotice('건물 윤곽이 지도 범위를 벗어납니다.'); return }
          changeSettings(target, { placement: next, terrain: item?.terrain ? { ...item.terrain, entrance: undefined } : undefined })
        }
      }
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
      const picked = optionsRef.current?.pick(event.point)
      if (picked) { select(picked); return }
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

  useEffect(() => {
    if (!active || !store) return
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input,textarea,select,[contenteditable="true"]') || !(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (drawingRef.current && !event.shiftKey) setDrawing((points) => points ? points.slice(0, -1) : points)
        else if (event.shiftKey) storeRef.current?.onRedo?.()
        else storeRef.current?.onUndo?.()
      } else if (event.key.toLowerCase() === 'y') { event.preventDefault(); storeRef.current?.onRedo?.() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [active, !!store])

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
      return [{ type: 'Feature' as const, properties: { id, state }, geometry: polygon(placedOutline(building.outline, draft.overrides[id]?.placement)) }]
    })
    const added = draft.added.map((building) => ({
      type: 'Feature' as const,
      properties: { addedId: building.id, state: selection?.kind === 'added' && selection.id === building.id ? 'selected' : 'added' },
      geometry: polygon(placedOutline(building.outline, building.placement)),
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
    const selectedSettings = selection?.kind === 'osm' ? draft.overrides[selection.id] : selection?.kind === 'added'
      ? draft.added.find((item) => item.id === selection.id) : draft.models.find((item) => selection?.kind === 'model' && item.id === selection.id)
    const entrance = selectedSettings?.terrain?.entrance ? [{ type: 'Feature' as const, properties: { state: 'first' },
      geometry: { type: 'Point' as const, coordinates: selectedSettings.terrain.entrance } }] : []
    return [...edited, ...added, ...models, ...sketch, ...entrance]
  }, [draft, selection, drawing, cursor])
  useEffect(() => {
    mapRef.current?.getSource<GeoJSONSource>(BUILDING_EDIT_SOURCE_ID)?.setData(active ? { type: 'FeatureCollection', features } : EMPTY)
  }, [active, features])

  const selectedOsm = selection?.kind === 'osm' ? streetBuilding(selection.id) : undefined
  const selectedAdded = selection?.kind === 'added' ? addedById.get(selection.id) : undefined
  const selectedModel = selection?.kind === 'model' ? modelById.get(selection.id) : undefined
  const settings: BuildingSettings = selectedOsm ? draft?.overrides[selectedOsm.id] ?? {} : selectedAdded ?? selectedModel ?? {}
  const sourceOutline = selectedOsm?.outline ?? selectedAdded?.outline
  const placement = sourceOutline ? settings.placement ?? outlinePlacement(sourceOutline) : undefined
  const [elevationInfo, setElevationInfo] = useState('')
  const elevationKey = JSON.stringify({ selection, terrain: settings.terrain, placement: settings.placement,
    height: (settings as BuildingOverride).heightMeters, model: selectedModel })
  useEffect(() => {
    if (!selection || !options?.terrainMode) { setElevationInfo(''); return }
    let cancelled = false
    loadTerrain().then((terrain) => {
      if (cancelled) return
      if (selectedModel) {
        const [x, z] = streetMeters([selectedModel.longitude, selectedModel.latitude])
        setElevationInfo(`모델 중심 지면: 해발 ${terrain.height(x, z).toFixed(1)}m`)
      } else if (sourceOutline) {
        const outline = placedOutline(sourceOutline, settings.placement).map(streetMeters)
        const plan = terrainBuildingPlan(outline, terrain, distanceToRoad, selectedOsm?.sharedEdges,
          (settings as BuildingOverride).heightMeters ?? selectedOsm?.heightMeters ?? selectedAdded?.heightMeters, settings.terrain)
        const heights = outline.flatMap((a, index) => {
          const b = outline[(index + 1) % outline.length], count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2))
          return Array.from({ length: count + 1 }, (_, step) => terrain.height(a[0] + (b[0] - a[0]) * step / count, a[1] + (b[1] - a[1]) * step / count))
        })
        setElevationInfo(`기준 층: 해발 ${(plan.base - TERRAIN_GROUND_LIFT).toFixed(1)}m · 외곽 지면 ${Math.min(...heights).toFixed(1)}~${Math.max(...heights).toFixed(1)}m`)
      }
    }).catch(() => { if (!cancelled) setElevationInfo('지형 높이를 읽지 못했습니다.') })
    return () => { cancelled = true }
  }, [elevationKey, options?.terrainMode])
  const setPlacement = (next: BuildingPlacement) => {
    if (!selection || !sourceOutline) return
    if (!placedOutline(sourceOutline, next).every(([lng, lat]) => isInsideGamcheonMap(lng, lat))) { setNotice('건물 윤곽이 지도 범위를 벗어납니다.'); return }
    changeSettings(selection, { placement: next, terrain: settings.terrain ? { ...settings.terrain, entrance: undefined } : undefined })
    setNotice('')
  }

  // 이동·회전·크기 손잡이는 드래그가 끝났을 때 한 번 저장합니다.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !active || !selection || drawing || placing || (!placement && !selectedModel)) return
    const center: Point = selectedModel ? [selectedModel.longitude, selectedModel.latitude] : [placement!.longitude, placement!.latitude]
    const [cx, cz] = streetMeters(center)
    const radius = selectedModel ? 5 : Math.max(3, ...sourceOutline!.map((p) => {
      const base = outlinePlacement(sourceOutline!), [bx, bz] = streetMeters([base.longitude, base.latitude]), [x, z] = streetMeters(p)
      return Math.hypot(x - bx, z - bz)
    }))
    const angle = (selectedModel?.rotation ?? placement!.rotation) * Math.PI / 180
    const reach = selectedModel ? selectedModel.widthMeters / 2 : radius * placement!.scale
    const markers = (['이동', '회전', '크기'] as const).map((label, index) => {
      const element = document.createElement('button')
      element.type = 'button'; element.className = `gamcheon-map__editor-handle is-${index}`; element.textContent = label
      element.setAttribute('aria-label', `선택 건물 ${label} 손잡이`)
      element.addEventListener('click', (event) => event.stopPropagation())
      const direction = index === 1 ? 1 : index === 2 ? -1 : 0
      const point = streetLngLat([cx + Math.cos(angle) * reach * direction, cz + Math.sin(angle) * reach * direction])
      const marker = new Marker({ element, draggable: true }).setLngLat(point).addTo(map)
      marker.on('dragend', () => {
        const end = marker.getLngLat(), [x, z] = streetMeters([end.lng, end.lat])
        if (!isInsideGamcheonMap(end.lng, end.lat)) { setNotice('지도 범위 밖으로 옮길 수 없습니다.'); marker.setLngLat(point); return }
        const rotation = ((Math.atan2(z - cz, x - cx) * 180 / Math.PI) + 360) % 360
        if (selectedModel) {
          const patch = index === 0 ? { longitude: end.lng, latitude: end.lat } : index === 1 ? { rotation }
            : { widthMeters: Math.max(1, Math.min(120, Math.hypot(x - cx, z - cz) * 2)) }
          const current = storeRef.current
          if (current) current.onChange(setModel(current.draft, selectedModel.id, { ...selectedModel, ...patch }))
        } else if (placement) setPlacement(index === 0 ? { ...placement, longitude: end.lng, latitude: end.lat }
          : index === 1 ? { ...placement, rotation } : { ...placement, scale: Math.max(0.1, Math.min(5, Math.hypot(x - cx, z - cz) / radius)) })
      })
      return marker
    })
    return () => markers.forEach((marker) => marker.remove())
  }, [active, selection, draft, drawing, placing])
  // 모델 파일을 지울 수 있는지(초안·공개본 어디에도 쓰이지 않을 때만)
  const published = store?.published
  const usedModelIds = useMemo(() => new Set([...[...(draft?.models ?? []), ...(published?.models ?? [])].map((model) => model.modelId),
    ...(store?.retainedModelIds ?? [])]), [draft, published, store?.retainedModelIds])
  // 새 건물이 차도·보행로와 겹치는지(겹치면 '길 밖으로 깎기'로 겹친 부분을 잘라 낼 수 있음)
  const trimmed = useMemo(() => {
    if (!selectedAdded) return undefined
    const outline = placedOutline(selectedAdded.outline, selectedAdded.placement)
    const clear = clearOfCarriageways(outline)
    return clear === outline ? undefined : clear
  }, [selectedAdded])

  const easeTo = (outline: Point[]) => {
    const map = mapRef.current
    if (map) map.easeTo({ center: centerOf(outline), zoom: Math.max(map.getZoom(), 18.5), duration: 600 })
  }

  return {
    panelProps: store ? {
      local: store.server === false,
      canUndo: store.canUndo ?? false,
      canRedo: store.canRedo ?? false,
      onUndo: () => store.onUndo?.(),
      onRedo: () => store.onRedo?.(),
      terrainMode: options?.terrainMode ?? false,
      settings,
      elevationInfo,
      placement,
      onChangeSettings: (patch: Partial<BuildingSettings>) => { if (selection) changeSettings(selection, patch) },
      onPlacement: setPlacement,
      onMoveBuilding: () => { if (selection) setPlacing({ kind: 'building', selection }) },
      onPickEntrance: () => { if (selection) setPlacing({ kind: 'entrance', selection }) },
      onDuplicate: () => {
        if (!sourceOutline) return
        const outline = placedOutline(sourceOutline, settings.placement).map((p) => { const [x, z] = streetMeters(p); return streetLngLat([x + 2, z + 2]) })
        if (!outline.every(([lng, lat]) => isInsideGamcheonMap(lng, lat))) { setNotice('복제할 공간이 지도 범위를 벗어납니다.'); return }
        const id = newBuildingId(), source = selectedAdded ?? selectedOsm!
        store.onChange(setAdded(store.draft, id, { id, outline, heightMeters: (settings as BuildingOverride).heightMeters ?? source.heightMeters,
          wallColor: (settings as BuildingOverride).wallColor ?? source.wallColor, roofColor: (settings as BuildingOverride).roofColor ?? source.roofColor,
          roofStyle: (settings as BuildingOverride).roofStyle ?? source.roofStyle, name: `${settings.name || '건물'} 복제`,
          flatBaseMeters: settings.flatBaseMeters, terrain: settings.terrain ? { ...settings.terrain, entrance: undefined } : undefined }))
        setSelection({ kind: 'added', id })
      },
      selected: selectedOsm ? { building: selectedOsm, override: draft?.overrides[selectedOsm.id] ?? {} } : null,
      added: selectedAdded ?? null,
      models: {
        selected: selectedModel ?? null,
        placed: store.draft.models,
        placing: placing ? (placing.kind === 'new' ? `'${placing.file.name}'을(를) 둘 곳을 지도에서 누르세요.`
          : placing.kind === 'entrance' ? '출입구가 닿는 지면을 지도에서 누르세요.' : '건물을 옮길 곳을 지도에서 누르세요.') : '',
        files: library.files,
        usedIds: usedModelIds,
        uploading: library.uploading,
        error: library.error,
        onUpload: (file: File) => { void library.upload(file) },
        onDeleteFile: (id: string) => { void library.remove(id) },
        // 고른 건물(자동으로 만든 건물이나 새로 그린 건물)을 모델로 바꿉니다. 모델은 건물 자리 가운데에 긴 변 방향으로 둡니다.
        onReplace: (file: ModelFile) => {
          if (!sourceOutline) return
          const outline = placedOutline(sourceOutline, settings.placement)
          const id = newPlacementId()
          let next = store.draft
          if (selectedAdded) next = setAdded(next, selectedAdded.id, null)
          const [longitude, latitude] = centerOf(outline)
          next = setModel(next, id, {
            id, modelId: file.id, name: file.name, longitude, latitude, ...outlineFit(outline),
            terrain: settings.terrain, flatBaseMeters: settings.flatBaseMeters,
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
          if (!selectedModel) return
          const next = { ...selectedModel, ...patch, id: selectedModel.id }
          if (!isInsideGamcheonMap(next.longitude, next.latitude)) { setNotice('지도 범위 밖으로 옮길 수 없습니다.'); return }
          store.onChange(setModel(store.draft, selectedModel.id, next)); setNotice('')
        },
        onDuplicate: () => {
          if (!selectedModel) return
          const [x, z] = streetMeters([selectedModel.longitude, selectedModel.latitude]), [longitude, latitude] = streetLngLat([x + 2, z + 2])
          if (!isInsideGamcheonMap(longitude, latitude)) { setNotice('복제할 위치가 지도 범위를 벗어납니다.'); return }
          const id = newPlacementId()
          store.onChange(setModel(store.draft, id, { ...selectedModel, id, longitude, latitude, replaces: [], name: `${selectedModel.name} 복제` }))
          setSelection({ kind: 'model', id })
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
        store.onChange(setAdded(store.draft, selectedAdded.id, { ...selectedAdded, outline: trimmed, placement: undefined }))
      },
      onSelect: (id: number) => {
        setDrawing(null)
        setPlacing(null)
        select({ kind: 'osm', id })
        const building = streetBuilding(id)
        if (building) easeTo(placedOutline(building.outline, store.draft.overrides[id]?.placement))
      },
      onSelectAdded: (id: string) => {
        setDrawing(null)
        setPlacing(null)
        setSelection({ kind: 'added', id })
        const building = addedById.get(id)
        if (building) easeTo(placedOutline(building.outline, building.placement))
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
