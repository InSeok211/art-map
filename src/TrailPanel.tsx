import type { AlleyCandidate, GpsTrail } from './gpsTrails'
import { PASS_THRESHOLD_RANGE, trailLengthMeters } from './gpsTrails'
import type { useTrailRecorder } from './useTrailRecorder'

import type { AutoTrailStatus } from './useAlleyFinder'
import { useState } from 'react'
import { PocketMode } from './PocketMode'

interface TrailPanelProps {
  auto?: AutoTrailStatus
  recorder: ReturnType<typeof useTrailRecorder>
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
  // 기록을 시작하면 휴대폰에서 시트를 접어 지도를 넓게 보여 줍니다.
  onRecordStart?: () => void
}

const when = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// 골목길 탭 아래쪽의 "걸어서 골목길 찾기" 영역입니다.
export function TrailPanel({
  recorder, auto, trails, candidates, selectedId, threshold, showTrails,
  onThresholdChange, onShowTrailsChange, onSelect, onApprove, onDismiss, onDeleteTrail, onRecordStart, gpxStatus, onImportGpx,
}: TrailPanelProps) {
  const [pocket, setPocket] = useState(false)
  const selected = candidates.find((candidate) => candidate.id === selectedId)
  const draftPoints = recorder.draft?.points.length ?? 0

  return <div className="gamcheon-map__model-editor gamcheon-map__trail-panel">
    <p className="gamcheon-map__model-help">
      {auto ? '관리자로 로그인해 지도를 열어 두면 걸은 길이 자동으로 기록됩니다(공개 지도에서도).' : '기록을 켜고 골목을 걸어 주세요.'}
      {' '}서로 다른 기록에서 같은 곳을 <b>{threshold}번 이상</b> 지나간, 지도에 없는 길이
      주황 점선 후보로 나타납니다. 확인한 후보만 골목길로 추가됩니다.
    </p>
    {auto && <div className="gamcheon-map__model-inspector gamcheon-map__auto-trail">
      <strong>{auto.recording ? '● 자동 기록 중' : '자동 기록 일시정지'}</strong>
      <p className="gamcheon-map__model-help">
        {auto.recording ? `이번 기록 ${auto.pointCount}점` : '다시 켜면 이어서 기록합니다.'}
        {auto.lastSaved && ` · ${String(auto.lastSaved.getHours()).padStart(2, '0')}:${String(auto.lastSaved.getMinutes()).padStart(2, '0')} 저장`}
        {' · '}가만히 있을 때의 흔들림과 30m 미만의 기록은 저장하지 않습니다.
      </p>
      <div className="gamcheon-map__model-item-actions">
        {auto.recording ? <>
          <button type="button" onClick={() => setPocket(true)}>주머니 모드</button>
          <button type="button" onClick={auto.pause}>일시정지</button>
        </> : <button type="button" className="gamcheon-map__model-place" onClick={auto.resume}>자동 기록 다시 켜기</button>}
      </div>
      {pocket && auto.recording && <PocketMode pointCount={auto.pointCount} onExit={() => setPocket(false)} />}
    </div>}

    <div className="gamcheon-map__model-inspector gamcheon-map__gpx-import">
      <strong>GPX 파일로 기록 추가</strong>
      <p className="gamcheon-map__model-help">
        화면을 끄고 걸으려면 휴대폰의 GPS 기록 앱(안드로이드 GPSLogger, 아이폰 Open GPX Tracker 등)으로 기록한 뒤
        GPX 파일을 올려 주세요. 지도 기록과 같은 기준으로 거르고, 여러 파일을 한 번에 올릴 수 있습니다.
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
    {!auto && <><div className="gamcheon-map__model-primary-actions">
      {recorder.recording
        ? <button type="button" className="gamcheon-map__model-place gamcheon-map__trail-recording" onClick={() => void recorder.finish()}>■ 기록 끝내고 저장 ({draftPoints}점)</button>
        : <button type="button" className="gamcheon-map__model-place" onClick={() => { recorder.start(); onRecordStart?.() }}>{draftPoints ? `● 기록 이어가기 (${draftPoints}점)` : '● 걸으며 기록 시작'}</button>}
      {recorder.recording && <button type="button" onClick={recorder.pause}>잠시 멈춤</button>}
      {!recorder.recording && draftPoints > 0 && <button type="button" onClick={() => void recorder.finish()}>저장</button>}
      {draftPoints > 0 && <button type="button" onClick={recorder.discard}>기록 버리기</button>}
    </div>
    {recorder.recording && <p className="gamcheon-map__model-help">
      {recorder.accuracy !== null ? `GPS 정확도 약 ${recorder.accuracy}m${recorder.accuracy > 20 ? ' (20m보다 나빠 이 점은 쓰지 않습니다)' : ''}` : 'GPS를 기다리는 중'}
      {' · '}화면을 켠 채로 걸어 주세요.
    </p>}
    {recorder.status && <p className="gamcheon-map__model-help" role="status">{recorder.status}</p>}
    {recorder.pendingCount > 0 && <div className="gamcheon-map__model-primary-actions">
      <button type="button" onClick={() => void recorder.retry()}>올리지 못한 기록 {recorder.pendingCount}개 다시 올리기</button>
    </div>}</>}

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
