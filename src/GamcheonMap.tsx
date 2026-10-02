import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Map, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import type { MapMouseEvent, StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './gamcheon-map.css'
import { filterPlaces } from './filterPlaces'
import { GAMCHEON_MAP_BOUNDS, isInsideGamcheon2, isInsideGamcheonMap } from './gamcheonBoundary'
import { BUILDING_FOOTPRINT_LAYER_IDS, createMinimalStyle, ROUTE_LAYER_IDS } from './mapStyle'
import { AlleyEditor } from './AlleyEditor'
import type { Alley } from './alleys'
import { useAlleyEditing } from './useAlleyEditing'
import { ModelLayer, SEE_THROUGH_OPACITY } from './ModelLayer'
import { StreetSceneLayer } from './StreetSceneLayer'
import { RoutePanel } from './RoutePanel'
import { useRouteFinder } from './useRouteFinder'
import { ModelEditor } from './ModelEditor'
import { PlaceBrowser, PlaceForm } from './PlacePanel'
import type { PlaceDraft } from './PlacePanel'
import { BUILTIN_MODELS } from './modelCatalog'
import { ARTIST_WORKSHOP_MODEL, ARTIST_WORKSHOP_PLACE } from './artistWorkshop'
import type { MapModel, ModelAsset, ModelStyle } from './modelCatalog'
import { loadCustomModels, saveCustomModel } from './modelAssetStore'
import { newId, replaceById } from './listUtils'
import baseStyle from './positron-style.json'
import type { CategoryFilter, Place } from './types'

const CENTER: [number, number] = [129.00905, 35.09512]
const ZOOM = 18.2
const PITCH = 61
const BEARING = -8
const EMPTY_PLACES: Place[] = []
const EMPTY_MODELS: MapModel[] = []
const EMPTY_ALLEYS: Alley[] = []
const MAP_STYLE = createMinimalStyle(baseStyle) as unknown as StyleSpecification

function mapPadding(element: HTMLElement) {
  return element.clientWidth <= 720
    ? { top: 0, right: 0, bottom: Math.min(element.clientHeight * 0.62, 480), left: 0 }
    : { top: 0, right: 0, bottom: 0, left: 420 }
}

setWorkerUrl(workerUrl)

type EditMode = 'places' | 'models' | 'alleys' | 'route'

function applyBuildingVisibility(map: Map, visible: boolean) {
  for (const id of BUILDING_FOOTPRINT_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
  }
}

export interface GamcheonMapProps {
  initialView?: { center: [number, number]; zoom?: number; pitch?: number; bearing?: number }
  places?: Place[]
  onPlaceSelect?: (place: Place) => void
  editable?: boolean
  onPlacesChange?: (places: Place[]) => void
  models?: MapModel[]
  onModelsChange?: (models: MapModel[]) => void
  alleys?: Alley[]
  onAlleysChange?: (alleys: Alley[]) => void
  className?: string
  style?: CSSProperties
}

export function GamcheonMap({
  places = EMPTY_PLACES,
  onPlaceSelect,
  editable = false,
  onPlacesChange,
  models = EMPTY_MODELS,
  onModelsChange,
  alleys = EMPTY_ALLEYS,
  onAlleysChange,
  className = '',
  style,
  initialView,
}: GamcheonMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markersRef = useRef<Marker[]>([])
  const modelMarkersRef = useRef<Marker[]>([])
  const modelLayerRef = useRef<ModelLayer | null>(null)
  const customAssetUrlsRef = useRef<string[]>([])
  const onPlaceSelectRef = useRef(onPlaceSelect)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [localPlaces, setLocalPlaces] = useState<Place[]>(places)
  const [editor, setEditor] = useState<PlaceDraft | null>(null)
  const [locationError, setLocationError] = useState('')
  const [mode, setMode] = useState<EditMode>('places')
  const sceneMode = mode === 'models'
  const [localModels, setLocalModels] = useState<MapModel[]>(models)
  const [customAssets, setCustomAssets] = useState<ModelAsset[]>([])
  const [styleFilter, setStyleFilter] = useState<ModelStyle>('rounded')
  const [chosenAssetId, setChosenAssetId] = useState<string | null>('rounded-house')
  const [placingAssetId, setPlacingAssetId] = useState<string | null>(null)
  const [movingModelId, setMovingModelId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [modelError, setModelError] = useState('')
  // 3D 거리 장면 상태: 만드는 중(loading), 그래픽 연결이 끊김(lost), 정상(ready)
  const [sceneStatus, setSceneStatus] = useState<'loading' | 'lost' | 'ready'>('loading')
  const [showBuildings, setShowBuildings] = useState(false)
  const showBuildingsRef = useRef(showBuildings)
  const [translucentModels, setTranslucentModels] = useState(false)
  // 작가님 공방만 남기고 나머지 3D 건물을 숨깁니다(도로·바닥·나무는 그대로).
  const [workshopOnly, setWorkshopOnly] = useState(false)
  const workshopOnlyRef = useRef(workshopOnly)
  const streetLayerRef = useRef<StreetSceneLayer | null>(null)
  const alley = useAlleyEditing(mapRef, mode === 'alleys', alleys, onAlleysChange)
  const routeFinder = useRouteFinder(mapRef, mode === 'route',
    localPlaces.filter((place) => isInsideGamcheonMap(place.longitude, place.latitude)),
    alley.editorProps.alleys, ARTIST_WORKSHOP_PLACE.id)
  const assets = useMemo(() => [...BUILTIN_MODELS, ...customAssets], [customAssets])
  const selectedPlace = localPlaces.find((place) => place.id === selectedId && isInsideGamcheonMap(place.longitude, place.latitude))

  const visiblePlaces = useMemo(
    () => filterPlaces(localPlaces.filter((place) => isInsideGamcheonMap(place.longitude, place.latitude)), { query, category })
      .sort((a, b) => Number(b.id === ARTIST_WORKSHOP_PLACE.id) - Number(a.id === ARTIST_WORKSHOP_PLACE.id)),
    [localPlaces, query, category],
  )

  useEffect(() => setLocalPlaces(places), [places])
  useEffect(() => setLocalModels(models), [models])

  useEffect(() => {
    let cancelled = false
    loadCustomModels().then((loaded) => {
      if (cancelled) loaded.forEach((asset) => URL.revokeObjectURL(asset.url))
      else {
        customAssetUrlsRef.current.push(...loaded.map((asset) => asset.url))
        setCustomAssets(loaded)
      }
    }).catch(() => { if (!cancelled) setModelError('저장된 사용자 에셋을 불러오지 못했습니다.') })
    return () => { cancelled = true }
  }, [])

  useEffect(() => () => customAssetUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), [])

  useEffect(() => {
    onPlaceSelectRef.current = onPlaceSelect
  }, [onPlaceSelect])

  useEffect(() => {
    const element = mapElementRef.current
    if (!element) return

    const map = new Map({
      container: element,
      style: MAP_STYLE,
      center: initialView?.center ?? CENTER,
      zoom: initialView?.zoom ?? ZOOM,
      pitch: initialView?.pitch ?? PITCH,
      bearing: initialView?.bearing ?? BEARING,
      minZoom: 12,
      maxZoom: 22,
      maxPitch: 80,
      maxBounds: GAMCHEON_MAP_BOUNDS,
      scrollZoom: true,
      dragRotate: true,
      pitchWithRotate: true,
      canvasContextAttributes: { antialias: true },
    })

    const modelLayer = new ModelLayer((name) => setModelError(`${name} 모델을 불러오지 못했습니다.`))
    modelLayerRef.current = modelLayer
    // 3D 거리 장면은 만드는 데 몇 초가 걸리므로, 바탕 지도를 먼저 그린 뒤에 만들어 빈 화면으로 기다리지 않게 합니다.
    let streetLayer: StreetSceneLayer | null = null
    let disposed = false
    const addStreetLayer = () => {
      if (!streetLayer || map.getLayer(streetLayer.id)) return
      // 거리 장면은 사용자 GLB 모델 아래에 그립니다.
      map.addLayer(streetLayer, map.getLayer(modelLayer.id) ? modelLayer.id : undefined)
      raiseRoute()
    }
    const buildStreetLayer = () => window.setTimeout(() => {
      if (disposed || streetLayer) return
      streetLayer = new StreetSceneLayer()
      streetLayer.setOtherBuildingsHidden(workshopOnlyRef.current, false)
      streetLayerRef.current = streetLayer
      addStreetLayer()
      setSceneStatus('ready')
    }, 0)
    // 길찾기 경로 선은 3D 건물에 가리지 않도록 3D 층보다 위에 둡니다.
    const raiseRoute = () => { for (const id of ROUTE_LAYER_IDS) if (map.getLayer(id)) map.moveLayer(id) }
    const addModelLayer = () => {
      if (!map.getLayer(modelLayer.id)) map.addLayer(modelLayer)
      addStreetLayer()
      raiseRoute()
      applyBuildingVisibility(map, showBuildingsRef.current)
      alley.renderOnto(map)
    }
    map.on('style.load', addModelLayer)
    map.once('idle', buildStreetLayer)
    // 휴대폰에서 메모리가 모자라면 그래픽(WebGL) 연결이 끊길 수 있습니다. 다시 연결되면 3D 층을 새로 붙입니다.
    const handleContextLost = () => setSceneStatus('lost')
    // MapLibre는 연결이 끊길 때 사용자 정의 3D 층을 스스로 떼어 내므로, 스타일이 다시 준비되면 붙입니다.
    const handleContextRestored = () => {
      if (disposed) return
      if (!map.isStyleLoaded()) {
        map.once('styledata', handleContextRestored)
        return
      }
      addModelLayer()
      setSceneStatus(streetLayer ? 'ready' : 'loading')
      map.triggerRepaint()
    }
    map.on('webglcontextlost', handleContextLost)
    map.on('webglcontextrestored', handleContextRestored)

    map.setPadding(mapPadding(element))
    map.addControl(new NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right')
    mapRef.current = map

    const observer = new ResizeObserver(() => {
      map.setPadding(mapPadding(element))
      map.resize()
    })
    observer.observe(element)
    const timer = window.setTimeout(() => map.resize(), 0)

    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      modelMarkersRef.current.forEach((marker) => marker.remove())
      modelMarkersRef.current = []
      disposed = true
      streetLayerRef.current = null
      map.off('style.load', addModelLayer)
      map.off('idle', buildStreetLayer)
      map.off('webglcontextlost', handleContextLost)
      map.off('webglcontextrestored', handleContextRestored)
      modelLayerRef.current = null
      mapRef.current = null
      map.remove()
    }
  }, [])

  useEffect(() => {
    workshopOnlyRef.current = workshopOnly
    streetLayerRef.current?.setOtherBuildingsHidden(workshopOnly)
  }, [workshopOnly])

  useEffect(() => {
    showBuildingsRef.current = showBuildings
    if (mapRef.current) applyBuildingVisibility(mapRef.current, showBuildings)
  }, [showBuildings])

  // 골목길을 그리거나 고칠 때는 3D 모델이 길을 가리지 않도록 자동으로 반투명하게 합니다.
  const modelsSeeThrough = translucentModels || mode === 'alleys'
  useEffect(() => {
    modelLayerRef.current?.setOpacity(modelsSeeThrough ? SEE_THROUGH_OPACITY : 1)
  }, [modelsSeeThrough])

  useEffect(() => {
    modelLayerRef.current?.setAssets(assets)
    modelLayerRef.current?.setItems(localModels.filter((item) => isInsideGamcheon2(item.longitude, item.latitude)))
  }, [assets, localModels])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !editor) return
    const chooseLocation = (event: MapMouseEvent) => {
      if (!isInsideGamcheonMap(event.lngLat.lng, event.lngLat.lat)) {
        setLocationError('표시된 사각형 지도 안쪽을 클릭해 주세요.')
        return
      }
      setLocationError('')
      setEditor((current) => current && ({
        ...current,
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
      }))
    }
    map.on('click', chooseLocation)
    return () => { map.off('click', chooseLocation) }
  }, [editor !== null])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    visiblePlaces.forEach((place) => {
      if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return

      const active = selectedId === place.id
      // 작가님 공방은 지도에서 바로 찾을 수 있도록 이름표가 달린 큰 표식으로 그립니다.
      const featured = place.id === ARTIST_WORKSHOP_PLACE.id
      const element = document.createElement('button')
      element.type = 'button'
      element.className = featured
        ? `gamcheon-map__featured-marker${active ? ' is-active' : ''}`
        : `gamcheon-map__marker gamcheon-map__marker--${place.category}${active ? ' is-active' : ''}`
      element.setAttribute('aria-label', place.name)
      element.title = place.name
      if (featured) {
        const label = document.createElement('span')
        label.className = 'gamcheon-map__featured-label'
        label.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.7-.7 1.7-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5h1.8A4.8 4.8 0 0 0 21 11c0-4.4-4-8-9-8Z" fill="currentColor"/><circle cx="7.5" cy="11" r="1.4" fill="#fff"/><circle cx="10.5" cy="7.2" r="1.4" fill="#fff"/><circle cx="15" cy="7.4" r="1.4" fill="#fff"/></svg>'
        label.append(place.name)
        const pin = document.createElement('span')
        pin.className = 'gamcheon-map__featured-pin'
        element.append(label, pin)
      }
      element.addEventListener('click', () => {
        setSelectedId(place.id)
        onPlaceSelectRef.current?.(place)
      })
      const marker = new Marker({ element, anchor: featured ? 'bottom' : 'center' })
        .setLngLat([place.longitude, place.latitude])
        .addTo(map)
      markersRef.current.push(marker)
    })
  }, [visiblePlaces, selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    modelMarkersRef.current.forEach((marker) => marker.remove())
    modelMarkersRef.current = []
    if (!sceneMode) return

    localModels.forEach((item, index) => {
      if (!isInsideGamcheon2(item.longitude, item.latitude)) return
      const asset = assets.find((candidate) => candidate.id === item.assetId)
      const element = document.createElement('button')
      element.type = 'button'
      element.className = `gamcheon-map__model-marker${selectedModelId === item.id ? ' is-selected' : ''}`
      element.textContent = String(index + 1)
      element.title = asset?.name ?? '3D 모델'
      element.setAttribute('aria-label', `${asset?.name ?? '3D 모델'} 선택`)
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        setSelectedModelId(item.id)
      })
      const marker = new Marker({ element, anchor: 'bottom', draggable: selectedModelId === item.id })
        .setLngLat([item.longitude, item.latitude]).addTo(map)
      if (selectedModelId === item.id) {
        marker.on('dragend', () => {
          const { lng, lat } = marker.getLngLat()
          if (!isInsideGamcheon2(lng, lat)) {
            marker.setLngLat([item.longitude, item.latitude])
            setModelError('감천2동 경계 안쪽으로 옮겨 주세요.')
            return
          }
          commitModels(replaceById(localModels, item.id, { longitude: lng, latitude: lat }))
        })
      }
      modelMarkersRef.current.push(marker)
    })
    return () => {
      modelMarkersRef.current.forEach((marker) => marker.remove())
      modelMarkersRef.current = []
    }
  }, [sceneMode, localModels, assets, selectedModelId, onModelsChange])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !sceneMode || (!placingAssetId && !movingModelId)) return
    const handleClick = (event: MapMouseEvent) => {
      const { lng, lat } = event.lngLat
      if (!isInsideGamcheon2(lng, lat)) {
        setModelError('감천2동 경계 안쪽을 클릭해 주세요.')
        return
      }
      setModelError('')
      if (movingModelId) {
        commitModels(replaceById(localModels, movingModelId, { longitude: lng, latitude: lat }))
        setMovingModelId(null)
      } else {
        const asset = assets.find((candidate) => candidate.id === placingAssetId)
        if (!asset) return
        const item: MapModel = {
          id: newId('model'),
          assetId: asset.id,
          longitude: lng,
          latitude: lat,
          widthMeters: asset.defaultWidth,
          rotation: 0,
          altitudeMeters: 0,
        }
        commitModels([...localModels, item])
        setSelectedModelId(item.id)
        setPlacingAssetId(null)
      }
    }
    map.on('click', handleClick)
    return () => { map.off('click', handleClick) }
  }, [sceneMode, placingAssetId, movingModelId, localModels, assets, onModelsChange])

  function switchMode(next: EditMode) {
    setMode(next)
    setEditor(null)
    setPlacingAssetId(null)
    setMovingModelId(null)
    alley.stopDrawing()
  }

  function commitModels(next: MapModel[]) {
    setLocalModels(next)
    onModelsChange?.(next)
  }

  function duplicateModel(id: string) {
    const original = localModels.find((item) => item.id === id)
    if (!original) return
    const copy = { ...original, id: newId('model'), longitude: original.longitude + 0.00018, latitude: original.latitude + 0.0001 }
    if (!isInsideGamcheon2(copy.longitude, copy.latitude)) return setModelError('경계에 가까워 복제할 공간이 없습니다.')
    commitModels([...localModels, copy])
    setSelectedModelId(copy.id)
  }

  async function importModels(files: FileList) {
    const selected = Array.from(files).filter((file) => file.name.toLowerCase().endsWith('.glb'))
    if (selected.length === 0) return setModelError('GLB 파일을 선택해 주세요.')
    if (selected.some((file) => file.size > 20_000_000)) return setModelError('한 파일은 20MB 이하로 선택해 주세요.')
    try {
      const imported = await Promise.all(selected.map(saveCustomModel))
      customAssetUrlsRef.current.push(...imported.map((asset) => asset.url))
      setCustomAssets((current) => [...current, ...imported])
      setStyleFilter('custom')
      setChosenAssetId(imported[0].id)
      setModelError('')
    } catch {
      setModelError('브라우저 저장소에 GLB를 저장하지 못했습니다.')
    }
  }

  function selectPlace(place: Place) {
    setSelectedId(place.id)
    if (Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
      const map = mapRef.current
      if (place.id === ARTIST_WORKSHOP_PLACE.id) {
        map?.flyTo({ center: [ARTIST_WORKSHOP_MODEL.longitude, ARTIST_WORKSHOP_MODEL.latitude], zoom: 19, pitch: 63, bearing: 35 })
      } else {
        map?.flyTo({ center: [place.longitude, place.latitude], zoom: Math.max(map.getZoom(), 17) })
      }
    }
    onPlaceSelectRef.current?.(place)
  }

  function resetMap() {
    mapRef.current?.flyTo({ center: CENTER, zoom: ZOOM, pitch: PITCH, bearing: BEARING })
    setSelectedId(null)
  }

  function showPhotographedStreet() {
    mapRef.current?.flyTo({ center: [129.00886, 35.09483], zoom: 19.25, pitch: 74, bearing: -4, duration: 1000 })
  }

  function showConceptBuildings() {
    mapRef.current?.flyTo({ center: [129.00905, 35.09549], zoom: 20.05, pitch: 48, bearing: -24, duration: 1000 })
  }

  function showWholeMap() {
    const map = mapRef.current
    if (!map) return
    map.fitBounds(GAMCHEON_MAP_BOUNDS, {
      padding: { top: 85, bottom: 40, left: map.getContainer().clientWidth > 800 ? 420 : 40, right: 40 },
      pitch: 38, bearing: 0, duration: 1000,
    })
  }

  function startEditingPlace(place?: Place) {
    setLocationError('')
    setEditor(place
      ? { ...place, address: place.address ?? '', description: place.description ?? '' }
      : { name: '', category: 'shop', latitude: null, longitude: null, address: '', description: '' })
  }

  function commitPlaces(next: Place[]) {
    setLocalPlaces(next)
    onPlacesChange?.(next)
  }

  function savePlace() {
    if (!editor?.name.trim() || editor.latitude === null || editor.longitude === null) return
    if (!isInsideGamcheonMap(editor.longitude, editor.latitude)) {
      setLocationError('표시된 사각형 지도 안쪽을 선택해 주세요.')
      return
    }
    const place: Place = {
      id: editor.id ?? newId('place'),
      name: editor.name.trim(),
      category: editor.category,
      latitude: editor.latitude,
      longitude: editor.longitude,
      address: editor.address.trim(),
      description: editor.description.trim(),
    }
    commitPlaces(editor.id ? localPlaces.map((item) => item.id === editor.id ? place : item) : [...localPlaces, place])
    setQuery('')
    setCategory('all')
    setSelectedId(place.id)
    setEditor(null)
  }

  function deletePlace() {
    if (!editor?.id || !window.confirm(`'${editor.name}' 장소를 삭제할까요?`)) return
    commitPlaces(localPlaces.filter((place) => place.id !== editor.id))
    setSelectedId(null)
    setEditor(null)
  }

  return (
    <section className={`gamcheon-map ${editor || alley.drawing ? 'is-editing' : ''} ${className}`.trim()} style={style} aria-label="감천2동 지도">
      <div ref={mapElementRef} className="gamcheon-map__canvas" aria-label="OpenStreetMap 지도" />
      {sceneStatus !== 'ready' && <p className="gamcheon-map__scene-status" role="status">
        {sceneStatus === 'lost' ? '그래픽 연결이 끊겨 3D 지도를 다시 불러오는 중입니다.' : '3D 거리를 불러오는 중입니다.'}
      </p>}

      <aside className={`gamcheon-map__panel${editor ? ' is-editing' : ''}`} aria-label={mode === 'route' ? '길찾기' : mode === 'alleys' ? '골목길 편집' : sceneMode ? '3D 모델 편집' : '장소 탐색'}>
        <div className="gamcheon-map__intro">
          <div className="gamcheon-map__eyebrow"><span className="gamcheon-map__eyebrow-dot" /> BUSAN · GAMCHEON 2-DONG</div>
          <h1>감천 골목지도<span className="gamcheon-map__title-dot">.</span></h1>
          <p>작가님 공방을 중심으로 골목의 가게와 명소를 찾아보세요.</p>
        </div>

        {/* 길찾기는 보기 전용 지도에서도 쓰므로 탭을 늘 보이고, 편집 탭(3D 배치·골목길)은 편집할 수 있을 때만 보입니다. */}
        <div className="gamcheon-map__mode-tabs" role="group" aria-label="지도 모드">
          <button type="button" className={mode === 'places' ? 'is-active' : ''} onClick={() => switchMode('places')}>장소</button>
          {editable && <button type="button" className={mode === 'models' ? 'is-active' : ''} onClick={() => switchMode('models')}>3D 배치</button>}
          {editable && <button type="button" className={mode === 'alleys' ? 'is-active' : ''} onClick={() => switchMode('alleys')}>골목길</button>}
          <button type="button" className={mode === 'route' ? 'is-active' : ''} onClick={() => switchMode('route')}>길찾기</button>
        </div>

        {mode === 'route' ? <RoutePanel {...routeFinder.panelProps} /> : mode === 'alleys' ? <AlleyEditor {...alley.editorProps} /> : sceneMode ? <ModelEditor
          assets={assets}
          models={localModels.filter((item) => isInsideGamcheon2(item.longitude, item.latitude))}
          selectedId={selectedModelId}
          chosenAssetId={chosenAssetId}
          movingId={movingModelId}
          styleFilter={styleFilter}
          error={modelError}
          onStyleFilter={(next) => { setStyleFilter(next); setChosenAssetId(assets.find((asset) => asset.style === next)?.id ?? null) }}
          onChooseAsset={setChosenAssetId}
          onPlace={() => { setPlacingAssetId(chosenAssetId); setMovingModelId(null); setModelError('지도를 클릭해 모델을 배치하세요.') }}
          onSelect={(id) => {
            setSelectedModelId(id)
            setPlacingAssetId(null)
            setMovingModelId(null)
            const item = localModels.find((model) => model.id === id)
            if (item) mapRef.current?.flyTo({ center: [item.longitude, item.latitude], zoom: Math.max(mapRef.current.getZoom(), item.assetId === ARTIST_WORKSHOP_MODEL.assetId ? 19 : 17.5) })
          }}
          onUpdate={(id, patch) => commitModels(replaceById(localModels, id, patch))}
          onMove={(id) => { setMovingModelId(id); setPlacingAssetId(null); setModelError('지도에서 새 위치를 클릭하거나 번호 표시를 드래그하세요.') }}
          onDuplicate={duplicateModel}
          onDelete={(id) => { commitModels(localModels.filter((item) => item.id !== id)); setSelectedModelId(null) }}
          onImport={importModels}
        /> : editor ? <PlaceForm
          draft={editor}
          onChange={setEditor}
          locationError={locationError}
          onSave={savePlace}
          onCancel={() => setEditor(null)}
          onDelete={deletePlace}
        /> : <PlaceBrowser
          query={query}
          onQueryChange={setQuery}
          category={category}
          onCategoryChange={setCategory}
          places={visiblePlaces}
          hasAnyPlace={localPlaces.length > 0}
          selectedId={selectedId}
          onSelect={selectPlace}
          editable={editable}
          onAdd={() => startEditingPlace()}
          onEditSelected={selectedPlace && (() => startEditingPlace(selectedPlace))}
        />}

        <div className="gamcheon-map__panel-footer">
          <span className="gamcheon-map__footer-mark">G</span>
          <span>{localModels.some((item) => BUILTIN_MODELS.some((asset) => asset.id === item.assetId)) ? '3D 에셋: dogfooter' : '감천2동을 천천히, 더 자세히.'}</span>
        </div>
      </aside>

      <div className="gamcheon-map__map-tools">
        <span className="gamcheon-map__area-badge"><span /> 부산 사하구 · 감천2동</span>
        <button type="button" className="gamcheon-map__street-focus" onClick={showWholeMap} title="지도 전체 보기">전체 지도 보기</button>
        <button type="button" className="gamcheon-map__street-focus" onClick={showPhotographedStreet} title="촬영한 거리 보기">촬영 거리 보기</button>
        <button type="button" className="gamcheon-map__street-focus" onClick={showConceptBuildings} title="시안 건물 보기">시안 건물 보기</button>
        <button
          type="button"
          className={modelsSeeThrough ? 'is-active' : ''}
          onClick={() => setTranslucentModels((current) => !current)}
          disabled={mode === 'alleys'}
          aria-pressed={modelsSeeThrough}
          aria-label={modelsSeeThrough ? '3D 건물 모두 반투명 끄기' : '3D 건물 모두 반투명하게'}
          title={mode === 'alleys' ? '골목길 편집 중에는 3D 건물이 자동으로 반투명해집니다' : modelsSeeThrough ? '3D 건물 모두 반투명 끄기' : '3D 건물 모두 반투명하게 (길을 가리는 건물은 항상 자동으로 반투명해집니다)'}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M4 7.5 12 12l8-4.5M12 12v9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeDasharray="2.4 2.2" />
          </svg>
        </button>
        <button
          type="button"
          className={showBuildings ? 'is-active' : ''}
          onClick={() => setShowBuildings((current) => !current)}
          aria-pressed={showBuildings}
          aria-label={showBuildings ? '실제 건물 윤곽 숨기기' : '실제 건물 윤곽 보기'}
          title={showBuildings ? '실제 건물 윤곽 숨기기' : '실제 건물 윤곽 보기'}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 20V9l6-4v15M10 20V11h6v9M16 20v-6h4v6M2.5 20h19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className={workshopOnly ? 'is-active' : ''}
          onClick={() => setWorkshopOnly((current) => !current)}
          aria-pressed={workshopOnly}
          aria-label={workshopOnly ? '다른 건물 다시 보기' : '작가님 공방만 보기'}
          title={workshopOnly ? '다른 건물 다시 보기' : '작가님 공방만 보기 (다른 3D 건물 숨기기)'}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8.5 20v-7.5L12 10l3.5 2.5V20" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M3 20v-5.5L5.5 13M21 20v-5.5L18.5 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1.8 2" />
            <path d="M2 20h20M12 4v2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" onClick={resetMap} aria-label="촬영 거리 중심으로 이동" title="촬영 거리 중심으로 이동">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
        </button>
      </div>
    </section>
  )
}
