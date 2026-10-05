import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { LngLatBounds, Marker } from 'maplibre-gl'
import type { GeoJSONSource, Map, MapMouseEvent } from 'maplibre-gl'
import type { Alley, LngLat } from './alleys'
import { isInsideGamcheonMap } from './gamcheonBoundary'
import { ROUTE_SOURCE_ID } from './mapStyle'
import { distanceFromRoute, findRoute, walkGraphFor } from './routing'
import type { Route, RouteError } from './routing'
import { streetMeters } from './streetSceneData'
import type { Place } from './types'
import type { GpsState } from './useMyLocation'

// 길찾기 탭의 상태와 지도 상호작용(지도에서 고르기, 경로 그리기, 내 위치 따라가기)을 묶은 훅입니다.
// 내 위치와 방향 화살표는 지도 전체가 쓰는 useMyLocation이 맡고, 여기서는 그 위치를 받아 씁니다.

export type RouteEndpoint = { kind: 'gps' } | { kind: 'place'; id: string } | { kind: 'point'; point: LngLat }
export type { GpsState, GpsStatus } from './useMyLocation'

// 이 거리(m)보다 경로에서 벗어나면 현재 위치에서 다시 찾습니다.
export const OFF_ROUTE_DISTANCE = 25
// 목적지에 이만큼(m) 가까워지면 도착으로 봅니다.
export const ARRIVAL_DISTANCE = 15
// 내 위치를 따라갈 때 최소 확대 단계
export const FOLLOW_ZOOM = 18

const ERROR_TEXT: Record<RouteError, string> = {
  'origin-off-network': '출발지 근처(80m 안)에 지도에 표시된 길이 없습니다.',
  'destination-off-network': '도착지 근처(80m 안)에 지도에 표시된 길이 없습니다.',
  'no-route': '이어지는 길을 찾지 못했습니다.',
}

const EMPTY_COLLECTION = { type: 'FeatureCollection' as const, features: [] }

function meters(a: LngLat, b: LngLat) {
  const [ax, az] = streetMeters(a), [bx, bz] = streetMeters(b)
  return Math.hypot(bx - ax, bz - az)
}

function markerElement(className: string, label: string) {
  const element = document.createElement('div')
  element.className = className
  element.setAttribute('aria-label', label)
  element.title = label
  return element
}

export function useRouteFinder(
  mapRef: RefObject<Map | null>,
  active: boolean,
  places: Place[],
  alleys: Alley[],
  gps: GpsState,
  defaultDestinationId?: string,
) {
  const [origin, setOrigin] = useState<RouteEndpoint>({ kind: 'gps' })
  const [destination, setDestination] = useState<RouteEndpoint | null>(
    defaultDestinationId ? { kind: 'place', id: defaultDestinationId } : null)
  const [picking, setPicking] = useState<'origin' | 'destination' | null>(null)
  const [avoidStairs, setAvoidStairs] = useState(false)
  // 내 위치에서 출발할 때 경로를 계산한 위치(움직일 때마다 다시 찾지 않고, 경로를 벗어났을 때만 갱신)
  const [gpsOrigin, setGpsOrigin] = useState<LngLat | null>(null)
  const [pickError, setPickError] = useState('')
  // 걸을 때 지도가 내 위치를 따라갑니다. 지도를 손으로 움직이면 꺼지고 버튼으로 다시 켭니다.
  const [following, setFollowing] = useState(true)
  const fixCountRef = useRef(0)
  const markersRef = useRef<{ origin?: Marker; destination?: Marker }>({})

  const pointOf = (endpoint: RouteEndpoint | null): LngLat | null => {
    if (!endpoint) return null
    if (endpoint.kind === 'point') return endpoint.point
    if (endpoint.kind === 'gps') return gpsOrigin
    const place = places.find((item) => item.id === endpoint.id)
    return place ? [place.longitude, place.latitude] : null
  }
  const originPoint = pointOf(origin)
  const destinationPoint = pointOf(destination)

  const result = useMemo(() => {
    if (!active || !originPoint || !destinationPoint) return null
    return findRoute(walkGraphFor(alleys), originPoint, destinationPoint, { avoidStairs })
  }, [active, originPoint?.[0], originPoint?.[1], destinationPoint?.[0], destinationPoint?.[1], avoidStairs, alleys])
  const route: Route | null = result && typeof result !== 'string' ? result : null
  const routeError = typeof result === 'string' ? ERROR_TEXT[result] : ''

  // 길찾기 탭에서 출발지가 '내 위치'일 때만 내 위치로 경로를 찾고 따라갑니다.
  const usesGps = active && origin.kind === 'gps'
  useEffect(() => {
    if (usesGps) return
    setGpsOrigin(null)
    setFollowing(true)
    fixCountRef.current = 0
  }, [usesGps])

  // 첫 위치를 받으면 경로를 찾고, 이후에는 경로를 크게 벗어났을 때만 현재 위치에서 다시 찾습니다.
  useEffect(() => {
    if (!usesGps || gps.status !== 'ok' || !gps.position) return
    if (!gpsOrigin || (route && distanceFromRoute(route, gps.position) > OFF_ROUTE_DISTANCE)) setGpsOrigin(gps.position)
  }, [usesGps, gps.position?.[0], gps.position?.[1], gps.status])

  // 내 위치 따라가기: 첫 위치에서는 경로 전체를 보여 주고, 그다음 위치부터 지도를 내 위치로 옮깁니다.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !usesGps || gps.status !== 'ok' || !gps.position) return
    fixCountRef.current++
    if (!following || fixCountRef.current < 2) return
    map.easeTo({ center: gps.position, zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), duration: 700 })
  }, [usesGps, following, gps.position?.[0], gps.position?.[1], gps.status])

  // 사용자가 지도를 직접 끌면 따라가기를 끕니다(코드로 움직인 것은 originalEvent가 없음).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !usesGps) return
    const stop = (event: { originalEvent?: unknown }) => { if (event.originalEvent) setFollowing(false) }
    map.on('dragstart', stop)
    return () => { map.off('dragstart', stop) }
  }, [usesGps])

  const arrived = Boolean(usesGps && gps.position && destinationPoint && meters(gps.position, destinationPoint) < ARRIVAL_DISTANCE)

  // 지도에서 출발지·도착지 고르기
  useEffect(() => {
    const map = mapRef.current
    if (!map || !active || !picking) return
    const choose = (event: MapMouseEvent) => {
      const point: LngLat = [event.lngLat.lng, event.lngLat.lat]
      if (!isInsideGamcheonMap(...point)) {
        setPickError('사각형 지도 안쪽을 눌러 주세요.')
        return
      }
      setPickError('')
      if (picking === 'origin') setOrigin({ kind: 'point', point })
      else setDestination({ kind: 'point', point })
      setPicking(null)
    }
    map.on('click', choose)
    map.getCanvas().style.cursor = 'crosshair'
    return () => {
      map.off('click', choose)
      map.getCanvas().style.cursor = ''
    }
  }, [active, picking])

  // 경로 선 그리기, 새 경로가 나오면 화면에 맞춰 보여 주기
  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource<GeoJSONSource>(ROUTE_SOURCE_ID)
    if (!map || !source) return
    if (!active || !route) {
      source.setData(EMPTY_COLLECTION)
      return
    }
    source.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coordinates } }],
    })
  }, [active, route])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !active || !route) return
    const bounds = route.coordinates.reduce((box, point) => box.extend(point), new LngLatBounds(route.coordinates[0], route.coordinates[0]))
    map.fitBounds(bounds, { padding: 70, maxZoom: 18.5, duration: 700 })
  }, [active, route?.coordinates[0]?.[0], route?.coordinates.at(-1)?.[0], route?.distance])

  // 출발·도착·내 위치 표식
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers = markersRef.current
    const place = (key: 'origin' | 'destination', point: LngLat | null, className: string, label: string) => {
      if (!active || !point) {
        markers[key]?.remove()
        markers[key] = undefined
        return
      }
      if (!markers[key]) markers[key] = new Marker({ element: markerElement(className, label), anchor: 'bottom' }).setLngLat(point).addTo(map)
      else markers[key]!.setLngLat(point)
    }
    place('origin', origin.kind === 'gps' ? null : originPoint, 'gamcheon-map__route-pin gamcheon-map__route-pin--origin', '출발')
    place('destination', destinationPoint, 'gamcheon-map__route-pin gamcheon-map__route-pin--destination', '도착')
  }, [active, originPoint?.[0], originPoint?.[1], destinationPoint?.[0], destinationPoint?.[1], origin.kind])

  useEffect(() => () => {
    const markers = markersRef.current
    markers.origin?.remove()
    markers.destination?.remove()
  }, [])

  return {
    panelProps: {
      places,
      origin,
      destination,
      picking,
      avoidStairs,
      gps,
      route,
      error: pickError || routeError,
      arrived,
      following,
      onFollow: () => {
        setFollowing(true)
        const map = mapRef.current
        if (map && gps.position) map.easeTo({ center: gps.position, zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), duration: 700 })
      },
      onOrigin: (endpoint: RouteEndpoint) => { setOrigin(endpoint); setPicking(null) },
      onDestination: (endpoint: RouteEndpoint | null) => { setDestination(endpoint); setPicking(null) },
      onPick: (target: 'origin' | 'destination' | null) => { setPicking(target); setPickError('') },
      onAvoidStairs: setAvoidStairs,
      onSwap: () => {
        // 내 위치는 도착지가 될 수 없으므로, 그때는 현재 위치 좌표를 도착지로 씁니다.
        const nextDestination: RouteEndpoint | null = origin.kind === 'gps' ? (gps.position ? { kind: 'point', point: gps.position } : null) : origin
        setOrigin(destination ?? { kind: 'gps' })
        setDestination(nextDestination)
        setPicking(null)
      },
      onRecenter: () => {
        const map = mapRef.current
        if (!map || !route) return
        const bounds = route.coordinates.reduce((box, point) => box.extend(point), new LngLatBounds(route.coordinates[0], route.coordinates[0]))
        map.fitBounds(bounds, { padding: 70, maxZoom: 18.5, duration: 700 })
      },
    },
  }
}
