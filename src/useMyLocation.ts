import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Marker } from 'maplibre-gl'
import type { Map } from 'maplibre-gl'
import type { LngLat } from './alleys'
import { isInsideGamcheonMap } from './gamcheonBoundary'
import { streetMeters } from './streetSceneData'

// 지도를 여는 순간부터 내 위치(파란 점)와 바라보는 방향(화살표)을 보여 주는 훅입니다.
// 위치는 화면에만 쓰고 저장하거나 보내지 않으며, 지도를 닫으면 추적을 멈춥니다.
//
// 방향은 휴대폰 나침반(방향 센서)을 먼저 쓰고, 없으면 걸어온 방향을 씁니다. 센서는 1초에 수십 번 값을 주므로
// 화면(React)을 다시 그리지 않고, 화살표만 매 프레임 목표 각도로 부드럽게 돌립니다.

export type GpsStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable' | 'unsupported' | 'outside'
// heading: 걸어온 방향(북쪽 기준 시계 방향 각도). 서 있을 때는 마지막 방향을 유지합니다.
export interface GpsState { status: GpsStatus; position?: LngLat; accuracy?: number; heading?: number }

// 이만큼(m) 움직여야 걸어온 방향을 새로 잽니다(GPS가 제자리에서 흔들려도 화살표가 돌지 않게).
export const HEADING_MIN_MOVE = 3
// 화살표가 매 프레임 목표 각도로 다가가는 비율(0~1). 클수록 빠르게 따라갑니다.
export const HEADING_SMOOTHING = 0.25

// 두 지점 사이의 방향(북쪽 기준 시계 방향 각도)
export function bearingBetween(from: LngLat, to: LngLat) {
  const [ax, az] = streetMeters(from), [bx, bz] = streetMeters(to)
  return (Math.atan2(bx - ax, -(bz - az)) * 180 / Math.PI + 360) % 360
}

// 각도 a에서 b로 가는 가장 짧은 회전(-180~180)
export function angleDelta(a: number, b: number) {
  return ((b - a + 540) % 360) - 180
}

function meters(a: LngLat, b: LngLat) {
  const [ax, az] = streetMeters(a), [bx, bz] = streetMeters(b)
  return Math.hypot(bx - ax, bz - az)
}

type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number }

// 나침반 방향(북쪽 기준 시계 방향). iOS는 webkitCompassHeading, 안드로이드는 절대 방위(absolute) alpha를 씁니다.
export function compassHeading(event: CompassEvent, screenAngle = 0): number | null {
  let heading: number | null = null
  if (typeof event.webkitCompassHeading === 'number' && Number.isFinite(event.webkitCompassHeading)) heading = event.webkitCompassHeading
  else if (event.absolute && event.alpha !== null) heading = 360 - event.alpha
  if (heading === null) return null
  // 화면을 가로로 돌리면 기기 기준 방향도 그만큼 돕니다.
  return ((heading + screenAngle) % 360 + 360) % 360
}

export function useMyLocation(mapRef: RefObject<Map | null>, options: { centerOnFirstFix?: boolean } = {}) {
  const [gps, setGps] = useState<GpsState>({ status: 'idle' })
  const markerRef = useRef<Marker | null>(null)
  const headingAnchorRef = useRef<LngLat | null>(null)
  const compassRef = useRef<number | null>(null)
  const walkHeadingRef = useRef<number | undefined>(undefined)
  const shownHeadingRef = useRef<number | null>(null)
  const frameRef = useRef(0)
  const centeredRef = useRef(false)
  const movedByUserRef = useRef(false)
  const centerOnFirstFixRef = useRef(options.centerOnFirstFix ?? true)
  centerOnFirstFixRef.current = options.centerOnFirstFix ?? true

  // 화살표를 목표 각도로 매 프레임 조금씩 돌립니다(화면 전체를 다시 그리지 않음).
  const steer = () => {
    frameRef.current = 0
    const marker = markerRef.current
    const target = compassRef.current ?? walkHeadingRef.current
    if (!marker || target === undefined) return
    marker.getElement().classList.add('has-heading')
    const shown = shownHeadingRef.current
    if (shown === null) {
      shownHeadingRef.current = target
      marker.setRotation(target)
      return
    }
    const delta = angleDelta(shown, target)
    if (Math.abs(delta) < 0.3) return
    const next = (shown + delta * HEADING_SMOOTHING + 360) % 360
    shownHeadingRef.current = next
    marker.setRotation(next)
    if (typeof requestAnimationFrame === 'function') frameRef.current = requestAnimationFrame(steer)
  }
  const requestSteer = () => {
    if (frameRef.current) return
    if (typeof requestAnimationFrame === 'function' && shownHeadingRef.current !== null) frameRef.current = requestAnimationFrame(steer)
    else steer()
  }

  // 위치 추적: 지도가 열려 있는 동안 계속합니다.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGps({ status: 'unsupported' })
      return
    }
    setGps({ status: 'locating' })
    const watch = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const position: LngLat = [coords.longitude, coords.latitude]
        if (!isInsideGamcheonMap(...position)) {
          setGps({ status: 'outside', position, accuracy: coords.accuracy })
          return
        }
        // 기기가 알려 주는 진행 방향(움직일 때만 믿을 만함)을 먼저 쓰고, 없으면 지나온 위치로 계산합니다.
        const reported = coords.heading !== null && Number.isFinite(coords.heading) && (coords.speed ?? 0) > 0.3 ? coords.heading : null
        const anchor = headingAnchorRef.current
        let measured: number | null = null
        if (!anchor) headingAnchorRef.current = position
        else if (meters(anchor, position) >= HEADING_MIN_MOVE) {
          measured = bearingBetween(anchor, position)
          headingAnchorRef.current = position
        }
        setGps((previous) => ({ status: 'ok', position, accuracy: coords.accuracy, heading: reported ?? measured ?? previous.heading }))
      },
      (error) => setGps({ status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [])

  // 나침반: 안드로이드는 바로 받을 수 있고, iOS는 사용자가 화면을 한 번 누를 때 권한을 물어야 합니다.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handle = (event: Event) => {
      const heading = compassHeading(event as CompassEvent, window.screen?.orientation?.angle ?? 0)
      if (heading === null) return
      compassRef.current = heading
      requestSteer()
    }
    window.addEventListener('deviceorientationabsolute', handle)
    window.addEventListener('deviceorientation', handle)
    const permission = (window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined)?.requestPermission
    const askOnce = () => { permission?.call(window.DeviceOrientationEvent).catch(() => undefined) }
    if (permission) window.addEventListener('pointerup', askOnce, { once: true })
    return () => {
      window.removeEventListener('deviceorientationabsolute', handle)
      window.removeEventListener('deviceorientation', handle)
      window.removeEventListener('pointerup', askOnce)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  // 사용자가 지도를 직접 움직였으면 첫 위치로 화면을 옮기지 않습니다.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const moved = (event: { originalEvent?: unknown }) => { if (event.originalEvent) movedByUserRef.current = true }
    map.on('movestart', moved)
    return () => { map.off('movestart', moved) }
  }, [mapRef.current])

  // 파란 점: 한 번 만들어 두고 위치만 옮깁니다.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (gps.status !== 'ok' || !gps.position) {
      markerRef.current?.remove()
      markerRef.current = null
      shownHeadingRef.current = null
      return
    }
    if (!markerRef.current) {
      const element = document.createElement('div')
      element.className = 'gamcheon-map__my-location'
      element.setAttribute('aria-label', '내 위치')
      element.title = '내 위치'
      // 지도를 돌리거나 기울여도 땅 위에서 실제 방향을 가리키도록 지도에 붙입니다.
      markerRef.current = new Marker({ element, anchor: 'center', rotationAlignment: 'map', pitchAlignment: 'map' })
        .setLngLat(gps.position).addTo(map)
    } else markerRef.current.setLngLat(gps.position)
    walkHeadingRef.current = gps.heading
    requestSteer()
    // 지도를 연 뒤 처음 위치를 받았고 아직 지도를 만지지 않았다면 내 위치를 보여 줍니다.
    if (!centeredRef.current) {
      centeredRef.current = true
      if (centerOnFirstFixRef.current && !movedByUserRef.current) map.easeTo({ center: gps.position, duration: 800 })
    }
  }, [gps.status, gps.position?.[0], gps.position?.[1], gps.heading])

  useEffect(() => () => { markerRef.current?.remove() }, [])

  return {
    gps,
    // '내 위치' 버튼: 내 위치로 옮기고, 보여 줄 수 없으면 이유를 돌려줍니다.
    locate(): string | null {
      const map = mapRef.current
      if (gps.status === 'ok' && gps.position && map) {
        map.easeTo({ center: gps.position, zoom: Math.max(map.getZoom(), 17.5), duration: 700 })
        return null
      }
      if (gps.status === 'outside') return '현재 위치가 감천2동 지도 밖입니다.'
      if (gps.status === 'denied') return '위치 권한이 꺼져 있습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.'
      if (gps.status === 'unsupported') return '이 브라우저는 위치 기능을 지원하지 않습니다.'
      if (gps.status === 'unavailable') return '내 위치를 알 수 없습니다. 잠시 뒤 다시 시도해 주세요.'
      return '내 위치를 찾는 중입니다.'
    },
  }
}
