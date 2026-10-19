import { useEffect, useRef, useState } from 'react'
import { MAP_AMENITIES } from '../data/mapAmenities'
import { isInsideGamcheonMap } from '../map/gamcheonBoundary'
import type { Place } from '../types'
import { cleanMapPlaces, MAP_PLACES_KEY } from './mapPlaces'

const defaults = MAP_AMENITIES.filter(p => isInsideGamcheonMap(p.longitude, p.latitude))
function readLocal() {
  try {
    const saved = localStorage.getItem(MAP_PLACES_KEY)
    return saved === null ? defaults : cleanMapPlaces(JSON.parse(saved)) ?? defaults
  } catch { return defaults }
}

export function useMapPlaces(editing = false) {
  const preview = import.meta.env.DEV
  const [places, setPlaces] = useState<Place[]>(preview ? readLocal : () => defaults)
  const [ready, setReady] = useState(preview)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const latest = useRef(places)
  latest.current = places

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(editing ? '/api/admin/map-places' : '/api/map-places', { cache: 'no-store' })
        if (!response.ok) throw new Error()
        const next = cleanMapPlaces((await response.json()).places)
        if (!next) throw new Error()
        if (!cancelled) { setPlaces(next); setReady(true); setNotice('') }
      } catch {
        if (!cancelled) setNotice('장소를 불러오지 못했습니다. 새로고침해 주세요.')
      }
    }
    if (!preview) void load()
    const refresh = () => {
      if (editing) return
      if (preview) setPlaces(readLocal())
      else void load()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', refresh)
    return () => { cancelled = true; window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh) }
  }, [editing, preview])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function update(next: Place[]) {
    if (!ready || saving) return
    setPlaces(next); setDirty(true); setNotice('장소 변경사항이 있습니다. 장소 공개하기를 눌러 반영해 주세요.')
  }
  async function publish() {
    if (!ready || saving) return
    const next = cleanMapPlaces(latest.current)
    if (!next) { setNotice('장소 이름과 위치를 확인해 주세요.'); return }
    setSaving(true)
    try {
      if (preview) localStorage.setItem(MAP_PLACES_KEY, JSON.stringify(next))
      else {
        const response = await fetch('/api/admin/map-places', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ places: next }) })
        if (!response.ok) throw new Error()
      }
      setDirty(false); setNotice('장소를 공개 지도에 반영했습니다.')
    } catch { setNotice('장소를 저장하지 못했습니다. 장소 공개하기를 눌러 다시 시도해 주세요.') }
    finally { setSaving(false) }
  }
  return { places, ready, dirty, saving, notice, update, publish }
}
