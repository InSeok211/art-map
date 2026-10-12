import { useEffect, useState } from 'react'
import type { BuildingPlacement, BuildingSettings, TerrainBuildingSettings } from './buildingSettings'

export function NumberField({ label, value, min, max, step = 0.1, digits = 1, optional = false, onChange }: {
  label: string; value: number | undefined; min: number; max: number; step?: number; digits?: number; optional?: boolean
  onChange: (value: number | undefined) => void
}) {
  const [text, setText] = useState(value === undefined ? '' : value.toFixed(digits))
  useEffect(() => setText(value === undefined ? '' : value.toFixed(digits)), [value, digits])
  const commit = () => {
    if (!text.trim() && optional) { onChange(undefined); return }
    const number = Number(text)
    if (!text.trim() || !Number.isFinite(number)) { setText(value === undefined ? '' : value.toFixed(digits)); return }
    const next = Math.max(min, Math.min(max, number))
    setText(next.toFixed(digits)); if (next !== value) onChange(next)
  }
  return <label className="gamcheon-map__number-field">{label}
    <input type="number" aria-label={label} value={text} min={min} max={max} step={step} placeholder={optional ? '자동' : undefined}
      onChange={(event) => setText(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
  </label>
}

export function TerrainProperties({ settings, terrainMode, model = false, onChange, onPickEntrance }: {
  settings: BuildingSettings; terrainMode: boolean; model?: boolean; onChange: (patch: Partial<BuildingSettings>) => void; onPickEntrance: () => void
}) {
  const terrain = settings.terrain ?? {}
  const change = (patch: Partial<TerrainBuildingSettings>) => onChange({ terrain: { ...terrain, ...patch } })
  return <div className="gamcheon-map__property-section">
    <strong>{terrainMode ? '3D 지형 높이' : '평지 높이'}</strong>
    {terrainMode ? <>
      <NumberField label="지형 높이 보정(m)" value={terrain.offsetMeters ?? 0} min={-50} max={50} onChange={(offsetMeters) => change({ offsetMeters })} />
      <NumberField label="기준 층 해발고도(m)" value={terrain.baseElevationMeters} min={0} max={1000} optional
        onChange={(baseElevationMeters) => change({ baseElevationMeters })} />
      <div className="gamcheon-map__model-item-actions">
        <button type="button" onClick={onPickEntrance}>출입구 위치 지정</button>
        <button type="button" onClick={() => onChange({ terrain: undefined })}>지면 자동 맞춤</button>
      </div>
      {terrain.entrance && <small>출입구: {terrain.entrance[1].toFixed(6)}, {terrain.entrance[0].toFixed(6)}</small>}
      {model && <label className="gamcheon-map__building-toggle"><input type="checkbox" checked={terrain.foundation !== false}
        onChange={(event) => change({ foundation: event.target.checked })} />기초 벽 연결</label>}
      <p className="gamcheon-map__model-help">고도를 비우면 지면에서 자동 계산합니다. 직접 입력하면 높은 쪽 벽이 땅에 묻힐 수 있습니다.</p>
    </> : <NumberField label="평지 바닥 높이(m)" value={settings.flatBaseMeters ?? 0} min={-50} max={50}
      onChange={(flatBaseMeters) => onChange({ flatBaseMeters })} />}
  </div>
}

export function PlacementProperties({ placement, onChange, onMove, onDuplicate }: {
  placement: BuildingPlacement; onChange: (placement: BuildingPlacement) => void; onMove: () => void; onDuplicate: () => void
}) {
  const field = (key: keyof BuildingPlacement, value: number | undefined) => value !== undefined && onChange({ ...placement, [key]: value })
  return <div className="gamcheon-map__property-section">
    <strong>배치</strong>
    <NumberField label="경도" value={placement.longitude} min={128} max={130} step={0.000001} digits={7} onChange={(value) => field('longitude', value)} />
    <NumberField label="위도" value={placement.latitude} min={34} max={36} step={0.000001} digits={7} onChange={(value) => field('latitude', value)} />
    <NumberField label="회전(도)" value={placement.rotation} min={-360} max={360} step={1} onChange={(value) => field('rotation', value)} />
    <NumberField label="크기 배율" value={placement.scale} min={0.1} max={5} step={0.05} digits={2} onChange={(value) => field('scale', value)} />
    <div className="gamcheon-map__model-item-actions">
      <button type="button" onClick={onMove}>지도에서 위치 옮기기</button>
      <button type="button" onClick={onDuplicate}>건물 복제</button>
    </div>
  </div>
}
