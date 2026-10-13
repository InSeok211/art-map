import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Map } from 'maplibre-gl'
import type { Geoman, LineDrawer, GeoJsonImportFeature } from '@geoman-io/maplibre-geoman-free'
import '@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.css'
import { geometryPoints, validateGeometry } from './geomanGeometry'
import type { GeometryPoint } from './geomanGeometry'
import { DEM_SOURCE_ID } from './mapStyle'

interface GeometryEditorOptions {
  active: boolean
  drawing: boolean
  shape: 'line' | 'polygon'
  feature: GeoJsonImportFeature | null
  onCreate: (points: GeometryPoint[]) => void
  onEdit: (points: GeometryPoint[]) => void
  onDraft: (points: GeometryPoint[]) => void
  onCancel: () => void
  onError: (message: string) => void
  terrainEnabled?: boolean
}

// One Geoman instance owns the active tool. Only the selected shape is editable.
export function useGeomanGeometry(mapRef: RefObject<Map | null>, options: GeometryEditorOptions) {
  const latest = useRef(options)
  latest.current = options
  const gmRef = useRef<Geoman | null>(null)
  const [ready, setReady] = useState(false)
  const queue = useRef(Promise.resolve())
  const run = (task: (gm: Geoman) => Promise<void>) => {
    const gm = gmRef.current
    if (!gm) return
    queue.current = queue.current.then(async () => { if (!gm.destroyed) await task(gm) }).catch(() => {
      if (!gm.destroyed) latest.current.onError('지도 편집 도구를 실행하지 못했습니다. 도구를 다시 선택해 주세요.')
    })
  }
  // Geoman 0.10.1 exposes LineDrawer on the native line/polygon action.
  // Keep this version-specific access here for the app's finish/undo buttons.
  const drawer = (gm: Geoman) => (gm.actionInstances[`draw__${latest.current.shape}`] as
    (typeof gm.actionInstances.draw__line & { lineDrawer?: LineDrawer }))?.lineDrawer

  useEffect(() => {
    if (!options.active) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    let owned: Geoman | null = null
    const initialize = async () => {
      if (disposed) return
      const map = mapRef.current
      if (!map) { timer = setTimeout(() => { void initialize() }, 50); return }
      try {
        const { Geoman } = await import('@geoman-io/maplibre-geoman-free')
        if (disposed) return
        owned = new Geoman(map, { settings: { useControlsUi: false, snapDistance: 12 } })
        gmRef.current = owned
        const gm = owned
        gm.setGlobalEventsListener(event => {
          if (disposed || !latest.current.drawing || event.actionType !== 'draw') return
          const points = drawer(gm)?.shapeLngLats ?? []
          latest.current.onDraft(points.map(p => [...p] as GeometryPoint))
        })
        gm.mapAdapter.on('gm:create', event => {
          if (disposed || !latest.current.drawing) return
          const points = geometryPoints(event.feature.getGeoJson().geometry)
          const error = points ? validateGeometry(points, latest.current.shape) : '지원하지 않는 도형입니다.'
          if (error) {
            latest.current.onError(error)
            latest.current.onDraft([])
            run(async () => { await event.feature.delete() })
          } else latest.current.onCreate(points!)
        })
        const saveEdit = (feature: NonNullable<typeof latest.current.feature> | null) => {
          if (!feature || disposed || latest.current.drawing) return
          const points = geometryPoints(feature.geometry)
          const error = points ? validateGeometry(points, latest.current.shape) : '지원하지 않는 도형입니다.'
          if (error) latest.current.onError(error)
          else if (JSON.stringify(feature.geometry) !== JSON.stringify(latest.current.feature?.geometry)) latest.current.onEdit(points!)
          return error
        }
        gm.mapAdapter.on('gm:edit', event => {
          // Midpoint insertion has an update event without a drag-end event.
          if (event.feature?.sourceName === 'gm_main') saveEdit(event.feature.getGeoJson())
        })
        gm.mapAdapter.on('gm:editend', event => {
          if (disposed || latest.current.drawing) return
          const error = saveEdit(event.feature.getGeoJson())
          if (error) {
            latest.current.onError(error)
            const geometry = latest.current.feature?.geometry
            if (geometry) run(async () => { await event.feature.updateGeometry(geometry) })
          }
        })
        gm.mapAdapter.on('gm:remove', () => {
          if (disposed || latest.current.drawing || !latest.current.feature) return
          latest.current.onError('도형의 최소 꼭짓점은 지울 수 없습니다. 전체 삭제는 편집 패널에서 해 주세요.')
          run(async () => { if (latest.current.feature) await gm.features.importGeoJsonFeature(latest.current.feature) })
        })
        await gm.waitForGeomanLoaded()
        if (!disposed) setReady(true)
      } catch {
        if (!disposed) latest.current.onError('지도 편집 도구를 불러오지 못했습니다. 화면을 새로고침해 주세요.')
      }
    }
    void initialize()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && latest.current.drawing) latest.current.onCancel()
    }
    window.addEventListener('keydown', key)
    return () => {
      disposed = true
      clearTimeout(timer)
      setReady(false)
      gmRef.current = null
      window.removeEventListener('keydown', key)
      if (owned) void owned.destroy({ removeSources: true })
    }
  }, [options.active])

  const featureKey = JSON.stringify(options.feature)
  const editingGeometry = options.active && (options.drawing || options.feature !== null)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !editingGeometry || !map) return
    // MapLibre drapes 2D geometry below our separate Three.js ground mesh.
    // Use a temporary plan view for precise editing, then restore the 3D view.
    const terrain = map.getTerrain()
    const pitch = map.getPitch()
    const streetId = 'gamcheon-photographed-street-3d'
    const visibility = map.getLayer(streetId) ? map.getLayoutProperty(streetId, 'visibility') ?? 'visible' : 'visible'
    const showPlan = () => {
      if (map.getTerrain()) map.setTerrain(null)
      if (map.getLayer(streetId) && map.getLayoutProperty(streetId, 'visibility') !== 'none') {
        map.setLayoutProperty(streetId, 'visibility', 'none')
      }
    }
    showPlan()
    map.easeTo({ pitch: 0, duration: 200 })
    map.on('styledata', showPlan)
    return () => {
      map.off('styledata', showPlan)
      if (map.getLayer(streetId)) map.setLayoutProperty(streetId, 'visibility', visibility)
      const restoreTerrain = latest.current.terrainEnabled === undefined ? terrain
        : latest.current.terrainEnabled ? { source: DEM_SOURCE_ID, exaggeration: 1 } : null
      if (!restoreTerrain || map.getSource(restoreTerrain.source)) map.setTerrain(restoreTerrain)
      map.easeTo({ pitch, duration: 200 })
    }
  }, [ready, editingGeometry])

  useEffect(() => {
    if (!ready) return
    const { drawing, shape, feature } = latest.current
    run(async gm => {
      await gm.disableAllModes()
      await gm.features.deleteAll()
      if (feature) await gm.features.importGeoJsonFeature(feature)
      await gm.enableMode('helper', 'snapping')
      if (drawing) await gm.enableDraw(shape)
      else if (feature) await gm.enableGlobalEditMode()
      await gm.enableMode('helper', 'shape_markers')
    })
  }, [ready, options.drawing, options.shape, featureKey])

  return {
    ready,
    finish: () => {
      const gm = gmRef.current
      const points = gm && drawer(gm)?.shapeLngLats.map(p => [...p] as GeometryPoint)
      if (!points) return
      const error = validateGeometry(points, latest.current.shape)
      if (error) latest.current.onError(error)
      else latest.current.onCreate(points)
    },
    undo: () => run(async gm => {
      const points = drawer(gm)?.shapeLngLats.slice(0, -1) ?? []
      await gm.disableDraw()
      await gm.enableDraw(latest.current.shape)
      const line = drawer(gm)
      if (line && points.length) {
        await line.startShape(points[0])
        for (const point of points.slice(1)) await line.handleNextVertex(point, { index: -1, path: null })
      }
      latest.current.onDraft(points.map(p => [...p] as GeometryPoint))
    }),
  }
}
