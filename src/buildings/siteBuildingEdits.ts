import { useEffect, useState } from 'react'
import { EMPTY_BUILDING_EDITS, sameBuildingEdits, sanitizeBuildingEdits } from './buildingEdits'
import type { BuildingEdits } from './buildingEdits'

const REFRESH_MS = 60_000
const STARTUP_WAIT_MS = 1_500

// 공개 지도가 열려 있는 동안에도 공개본을 다시 읽습니다. 최초 요청이 느리면 빈 지도로 먼저 시작하고,
// 응답이 도착하는 즉시 건물을 갱신합니다.
export function useSiteBuildingEdits(): BuildingEdits | null {
  const [edits, setEdits] = useState<BuildingEdits | null>(null)
  useEffect(() => {
    let cancelled = false
    let latestRequest = 0
    const startup = window.setTimeout(() => {
      if (!cancelled) setEdits((current) => current ?? EMPTY_BUILDING_EDITS)
    }, STARTUP_WAIT_MS)
    const load = async () => {
      const request = ++latestRequest
      try {
        const response = await fetch('/api/map-buildings', { cache: 'no-store' })
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return
        const body = await response.json() as { edits?: unknown }
        if (cancelled || request !== latestRequest) return
        const next = sanitizeBuildingEdits(body.edits)
        setEdits((current) => current && sameBuildingEdits(current, next) ? current : next)
      } catch {
        // 마지막으로 정상 수신한 공개본을 계속 보여 줍니다.
      }
    }
    void load()
    const refresh = window.setInterval(() => { void load() }, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearTimeout(startup)
      window.clearInterval(refresh)
    }
  }, [])
  return edits
}
