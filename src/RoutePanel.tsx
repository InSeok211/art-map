import { OFF_ROUTE_DISTANCE } from './useRouteFinder'
import type { GpsState, RouteEndpoint } from './useRouteFinder'
import type { Route } from './routing'
import type { Place } from './types'

interface RoutePanelProps {
  places: Place[]
  origin: RouteEndpoint
  destination: RouteEndpoint | null
  picking: 'origin' | 'destination' | null
  avoidStairs: boolean
  gps: GpsState
  route: Route | null
  error: string
  arrived: boolean
  following: boolean
  onFollow: () => void
  onOrigin: (endpoint: RouteEndpoint) => void
  onDestination: (endpoint: RouteEndpoint | null) => void
  onPick: (target: 'origin' | 'destination' | null) => void
  onAvoidStairs: (value: boolean) => void
  onSwap: () => void
  onRecenter: () => void
}

const GPS_TEXT: Record<GpsState['status'], string> = {
  idle: '',
  locating: '내 위치를 찾는 중입니다…',
  ok: '',
  denied: '위치 권한이 꺼져 있습니다. 브라우저 설정에서 위치 권한을 허용하거나, 출발지를 장소나 지도에서 골라 주세요.',
  unavailable: '내 위치를 알 수 없습니다. 실외로 나가거나 잠시 뒤 다시 시도하고, 출발지를 지도에서 골라도 됩니다.',
  unsupported: '이 브라우저는 위치 기능을 지원하지 않습니다. 출발지를 장소나 지도에서 골라 주세요.',
  outside: '현재 위치가 감천2동 지도 밖입니다. 출발지를 장소나 지도에서 골라 주세요.',
}

// <select> 값과 출발·도착 지점 사이를 오갑니다.
function endpointValue(endpoint: RouteEndpoint | null) {
  if (!endpoint) return ''
  if (endpoint.kind === 'gps') return 'gps'
  if (endpoint.kind === 'point') return 'point'
  return `place:${endpoint.id}`
}

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters / 5) * 5}m`
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes}분`
}

const STEP_ICONS: Record<Route['steps'][number]['action'], string> = {
  start: '●', straight: '↑', left: '←', right: '→', 'slight-left': '↖', 'slight-right': '↗', back: '↩', steps: '⇡', arrive: '⚑',
}

export function RoutePanel({
  places, origin, destination, picking, avoidStairs, gps, route, error, arrived, following,
  onFollow, onOrigin, onDestination, onPick, onAvoidStairs, onSwap, onRecenter,
}: RoutePanelProps) {
  const endpointSelect = (target: 'origin' | 'destination') => {
    const endpoint = target === 'origin' ? origin : destination
    return <select
      aria-label={target === 'origin' ? '출발지' : '도착지'}
      value={picking === target ? 'pick' : endpointValue(endpoint)}
      onChange={(event) => {
        const value = event.target.value
        if (value === 'pick') return onPick(target)
        const next: RouteEndpoint | null = value === 'gps' ? { kind: 'gps' }
          : value.startsWith('place:') ? { kind: 'place', id: value.slice(6) } : null
        if (!next) return
        if (target === 'origin') onOrigin(next)
        else onDestination(next)
      }}
    >
      {target === 'destination' && !destination && <option value="">도착지를 고르세요</option>}
      {target === 'origin' && <option value="gps">내 위치 (GPS)</option>}
      {places.map((place) => <option key={place.id} value={`place:${place.id}`}>{place.name}</option>)}
      {endpoint?.kind === 'point' && picking !== target && <option value="point">지도에서 고른 곳</option>}
      <option value="pick">지도에서 고르기…</option>
    </select>
  }

  const followBlock = origin.kind === 'gps' && gps.status === 'ok' && <div className="gamcheon-map__route-follow">
    <button type="button" className={following ? 'is-active' : ''} aria-pressed={following} onClick={onFollow} disabled={following}>
      {following ? '내 위치를 따라가는 중' : '내 위치 따라가기'}
    </button>
    {gps.accuracy !== undefined && <p className="gamcheon-map__route-accuracy">정확도 약 ±{Math.round(gps.accuracy)}m · 경로를 {OFF_ROUTE_DISTANCE}m 넘게 벗어나면 다시 찾습니다. 지도를 직접 움직이면 따라가기가 멈춥니다.</p>}
  </div>

  // 경로가 나오면 결과(시간·거리, 따라가기, 안내)를 맨 위에 둬서, 휴대폰에서 시트를 접어도 바로 보이게 합니다.
  return <div className="gamcheon-map__model-editor gamcheon-map__route">
    {arrived && <p className="gamcheon-map__route-arrived" role="status">목적지 근처에 도착했습니다.</p>}
    {route ? <section className="gamcheon-map__route-result" aria-label="찾은 길">
      <div className="gamcheon-map__route-summary">
        <strong>{formatDuration(route.duration)}</strong>
        <span>{formatDistance(route.distance)}{route.stairsDistance > 0 ? ` · 계단 ${formatDistance(route.stairsDistance)}` : ' · 계단 없음'}</span>
        <button type="button" onClick={onRecenter}>경로 전체 보기</button>
      </div>
      {followBlock && <div className="gamcheon-map__route-result-follow">{followBlock}</div>}
      <ol className="gamcheon-map__route-steps">
        {route.steps.map((step, index) => <li key={index} className={`is-${step.action}`}>
          <span aria-hidden="true">{STEP_ICONS[step.action]}</span>{step.text}
        </li>)}
      </ol>
    </section> : <p className="gamcheon-map__model-help">
      걸어서 가는 길을 찾습니다. 지도에 표시된 골목·계단과 직접 그린 골목길을 따라가며, 경사는 반영하지 않습니다.
    </p>}
    <div className="gamcheon-map__route-fields">
      <label><span className="gamcheon-map__route-dot gamcheon-map__route-dot--origin" />출발{endpointSelect('origin')}</label>
      <button type="button" className="gamcheon-map__route-swap" onClick={onSwap} aria-label="출발지와 도착지 바꾸기" title="출발지와 도착지 바꾸기">⇅</button>
      <label><span className="gamcheon-map__route-dot gamcheon-map__route-dot--destination" />도착{endpointSelect('destination')}</label>
    </div>
    {picking && <p className="gamcheon-map__route-picking" role="status">
      지도에서 {picking === 'origin' ? '출발지' : '도착지'}를 눌러 주세요.
      <button type="button" onClick={() => onPick(null)}>취소</button>
    </p>}
    <label className="gamcheon-map__route-option">
      <input type="checkbox" checked={avoidStairs} onChange={(event) => onAvoidStairs(event.target.checked)} />
      계단 피하기 (유모차·휠체어)
    </label>
    {origin.kind === 'gps' && GPS_TEXT[gps.status] && <p className={gps.status === 'locating' ? 'gamcheon-map__model-help' : 'gamcheon-map__model-error'} role="status">{GPS_TEXT[gps.status]}</p>}
    {!route && followBlock}
    {error && <p className="gamcheon-map__model-error" role="alert">{error}</p>}
  </div>
}
