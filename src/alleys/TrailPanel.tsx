import type { AlleyCandidate, GpsTrail } from './gpsTrails'
import { PASS_THRESHOLD_RANGE, trailLengthMeters } from './gpsTrails'

interface TrailPanelProps {
  trails: GpsTrail[]
  candidates: AlleyCandidate[]
  selectedId: string | null
  threshold: number
  showTrails: boolean
  onThresholdChange: (value: number) => void
  onShowTrailsChange: (value: boolean) => void
  onSelect: (id: string) => void
  onApprove: () => void
  onDismiss: () => void
  onDeleteTrail: (id: string) => void
  gpxStatus: string
  onImportGpx: (files: FileList) => void
}

const when = (iso: string) => {
  // 서버는 기록 시작을 날짜(YYYY-MM-DD)로만 저장합니다. 옛 기록처럼 시각까지 있으면 그대로 보여 줍니다.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (dateOnly) return `${Number(dateOnly[2])}/${Number(dateOnly[3])}`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// 골목길 탭의 "GPS 기록으로 골목길 찾기" 영역입니다. 기록은 휴대폰 GPS 기록 앱의 GPX 파일로 올립니다
// (지도 안의 걸으며 기록·자동 기록은 2026-10-12에 뺐습니다).
export function TrailPanel({
  trails, candidates, selectedId, threshold, showTrails,
  onThresholdChange, onShowTrailsChange, onSelect, onApprove, onDismiss, onDeleteTrail, gpxStatus, onImportGpx,
}: TrailPanelProps) {
  const selected = candidates.find((candidate) => candidate.id === selectedId)

  return <div className="gamcheon-map__model-editor gamcheon-map__trail-panel">
    <p className="gamcheon-map__model-help">
      GPS 기록 앱으로 골목을 걸은 GPX 파일을 올려 주세요. 서로 다른 기록에서 같은 곳을 <b>{threshold}번 이상</b> 지나간, 지도에 없는 길이
      주황 점선 후보로 나타납니다. 확인한 후보만 골목길로 추가됩니다.
    </p>
    <div className="gamcheon-map__model-inspector gamcheon-map__gpx-import">
      <strong>GPX 파일로 기록 추가</strong>
      <p className="gamcheon-map__model-help">
        휴대폰의 GPS 기록 앱(안드로이드 GPSLogger, 아이폰 Open GPX Tracker 등)으로 기록한 GPX 파일을 올려 주세요.
        가만히 있을 때의 흔들림과 정확도가 나쁜 점은 거르고, 여러 파일을 한 번에 올릴 수 있습니다.
      </p>
      <p className="gamcheon-map__model-help">
        <b>본인이 직접 걸으며 기록한 파일만</b> 올려 주세요. 다른 사람의 기록은 그 사람의 동의를 받은 뒤에만 올립니다.
        서버에는 감천 작업 범위 안의 경로와 기록한 날짜만 남고, 시각(몇 시 몇 분)과 범위 밖의 위치는 저장하지 않습니다.
        골목 후보를 확인한 뒤에는 기록을 지워도 됩니다.
      </p>
      <label className="gamcheon-map__gpx-button">
        GPX 파일 선택
        <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" multiple onChange={(event) => {
          if (event.target.files?.length) onImportGpx(event.target.files)
          event.target.value = ''
        }} />
      </label>
      {gpxStatus && <p className="gamcheon-map__model-help" role="status">{gpxStatus}</p>}
    </div>
    <div className="gamcheon-map__model-inspector gamcheon-map__trail-settings">
      <label>골목길로 볼 기준 <span>{threshold}번 이상</span>
        <input aria-label="골목길로 볼 기준 횟수" type="range" min={PASS_THRESHOLD_RANGE.min} max={PASS_THRESHOLD_RANGE.max} step="1" value={threshold} onChange={(event) => onThresholdChange(Number(event.target.value))} />
      </label>
      <label className="gamcheon-map__trail-toggle"><input type="checkbox" checked={showTrails} onChange={(event) => onShowTrailsChange(event.target.checked)} /> 지도에 내 기록(파란 선) 보기</label>
    </div>

    <div className="gamcheon-map__model-section-title">골목길 후보 <strong>{candidates.length}개</strong></div>
    <div className="gamcheon-map__model-placed">
      {candidates.map((candidate, index) => <button key={candidate.id} type="button" className={selectedId === candidate.id ? 'is-selected' : ''} onClick={() => onSelect(candidate.id)}>
        <span>{String(index + 1).padStart(2, '0')}</span>약 {Math.round(candidate.lengthMeters)}m · {candidate.passes}번 지나감
      </button>)}
      {candidates.length === 0 && <p className="gamcheon-map__model-empty">{trails.length < threshold
        ? `기록이 ${threshold}개 이상 쌓이면 후보가 나타납니다(지금 ${trails.length}개).`
        : '지금 기준으로는 새 골목길 후보가 없습니다.'}</p>}
    </div>
    {selected && <div className="gamcheon-map__model-inspector">
      <strong>후보 확인</strong>
      <p className="gamcheon-map__model-help">지도에서 진한 주황 점선이 실제 골목과 맞는지 확인해 주세요. 추가한 뒤에는 위 목록에서 점을 옮겨 모양과 폭을 고칠 수 있습니다.</p>
      <div className="gamcheon-map__model-item-actions">
        <button type="button" className="gamcheon-map__model-place" onClick={onApprove}>골목길로 추가</button>
        <button type="button" className="is-danger" onClick={onDismiss}>골목길 아님(버리기)</button>
      </div>
    </div>}

    <details className="gamcheon-map__trail-list">
      <summary>저장된 기록 {trails.length}개</summary>
      {trails.map((trail) => <div key={trail.id} className="gamcheon-map__trail-row">
        <span>{when(trail.startedAt)} · 약 {Math.round(trailLengthMeters(trail))}m</span>
        <button type="button" onClick={() => { if (window.confirm('이 기록을 지울까요? 되돌릴 수 없습니다.')) onDeleteTrail(trail.id) }}>지우기</button>
      </div>)}
    </details>
  </div>
}
