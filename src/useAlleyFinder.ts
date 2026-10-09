import { useEffect, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import type { GeoJSONSource, Map, MapLayerMouseEvent } from 'maplibre-gl'
import { ALLEY_WIDTH_RANGE } from './alleys'
import type { Alley, LngLat } from './alleys'
import { candidatesToGeoJSON, findAlleyCandidates, PASS_THRESHOLD_RANGE, trailsToGeoJSON } from './gpsTrails'
import type { GpsTrail } from './gpsTrails'
import { CANDIDATE_SOURCE_ID, TRAIL_SOURCE_ID } from './mapStyle'
import { newId } from './listUtils'
import { roadWidth } from './roadCorridors'
import { STREET_SURFACE_WAYS } from './streetSurfaceData'
import { useTrailRecorder } from './useTrailRecorder'

// 관리자 화면에서 GPS 기록을 저장·불러오는 곳(예: 홈페이지 데이터베이스)입니다.
export interface GpsTrailStore {
  trails: GpsTrail[]
  // 버린 후보의 선. 이 근처의 흔적은 다시 후보로 보이지 않습니다.
  dismissed: LngLat[][]
  onRecord: (trail: GpsTrail) => Promise<void> | void
  onDeleteTrail: (id: string) => void
  onDismiss: (line: LngLat[]) => void
  // 관리자로 로그인해 있으면 걸은 길을 버튼 없이 자동으로 기록합니다(useAutoTrailRecorder). 켜져 있으면 수동
  // 기록 버튼 대신 이 상태를 보여 줍니다(같은 걸음이 두 번 세어지지 않게).
  auto?: AutoTrailStatus
}

export interface AutoTrailStatus {
  recording: boolean
  paused: boolean
  pointCount: number
  lastSaved: Date | null
  pause: () => void
  resume: () => void
}

const THRESHOLD_KEY = 'gamcheon-trail-threshold-v1'
const EMPTY = { type: 'FeatureCollection' as const, features: [] }

function loadThreshold() {
  try {
    const value = Number(localStorage.getItem(THRESHOLD_KEY))
    return value >= PASS_THRESHOLD_RANGE.min && value <= PASS_THRESHOLD_RANGE.max ? value : PASS_THRESHOLD_RANGE.default
  } catch {
    return PASS_THRESHOLD_RANGE.default
  }
}

// 지도에 이미 있는 길(OSM 도로·골목·계단)의 중심선과 폭
const MAP_WAYS = STREET_SURFACE_WAYS.roads.map((way) => ({ points: way.points as LngLat[], width: roadWidth(way) }))

export function useAlleyFinder(
  mapRef: RefObject<Map | null>,
  active: boolean,
  store: GpsTrailStore | undefined,
  alleys: Alley[],
  addAlley: (alley: Alley) => void,
) {
  const [threshold, setThreshold] = useState(loadThreshold)
  const [showTrails, setShowTrails] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const recorder = useTrailRecorder(store?.onRecord)
  const trails = store?.trails ?? []

  const candidates = useMemo(() => store ? findAlleyCandidates(trails, {
    threshold,
    known: [...MAP_WAYS, ...alleys.map((alley) => ({ points: alley.coordinates, width: alley.widthMeters }))],
    dismissed: store.dismissed,
  }) : [], [store?.trails, store?.dismissed, threshold, alleys])
  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? null

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const shown = active && store
    const drawnTrails = recorder.draft ? [...trails, recorder.draft] : trails
    map.getSource<GeoJSONSource>(TRAIL_SOURCE_ID)?.setData(shown && showTrails ? trailsToGeoJSON(drawnTrails) : EMPTY)
    map.getSource<GeoJSONSource>(CANDIDATE_SOURCE_ID)?.setData(shown ? candidatesToGeoJSON(candidates, selectedId) : EMPTY)
  }, [active, store, trails, recorder.draft, showTrails, candidates, selectedId])

  // 지도에서 후보 선을 누르면 그 후보를 고릅니다.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !active || !store) return
    const pick = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id
      if (typeof id === 'string') setSelectedId(id)
    }
    map.on('click', 'alley-candidates-line', pick)
    return () => { map.off('click', 'alley-candidates-line', pick) }
  }, [active, store])

  function focus(coordinates: LngLat[]) {
    const map = mapRef.current
    if (!map) return
    const lngs = coordinates.map(([lng]) => lng), lats = coordinates.map(([, lat]) => lat)
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 80, maxZoom: 19.5, duration: 600 })
  }

  return {
    enabled: Boolean(store),
    panelProps: {
      recorder,
      auto: store?.auto,
      trails,
      candidates,
      selectedId,
      threshold,
      showTrails,
      onThresholdChange: (value: number) => {
        setThreshold(value)
        try { localStorage.setItem(THRESHOLD_KEY, String(value)) } catch { /* 이 기기에만 기억합니다. */ }
      },
      onShowTrailsChange: setShowTrails,
      onSelect: (id: string) => {
        setSelectedId(id)
        const candidate = candidates.find((item) => item.id === id)
        if (candidate) focus(candidate.coordinates)
      },
      onApprove: () => {
        if (!selected) return
        addAlley({ id: newId('alley'), coordinates: selected.coordinates, widthMeters: ALLEY_WIDTH_RANGE.default })
        setSelectedId(null)
      },
      onDismiss: () => {
        if (!selected) return
        store?.onDismiss(selected.coordinates)
        setSelectedId(null)
      },
      onDeleteTrail: (id: string) => store?.onDeleteTrail(id),
    },
  }
}
