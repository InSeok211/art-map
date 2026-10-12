import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BuildingEditStore } from './buildingEditStore'
import type { Alley } from '../alleys/alleys'
import { readLocalModelFiles, restoreLocalModelFiles } from './modelLibrary'
import { createProjectBackup, downloadWorkspaceFile, readProjectBackup } from './workspaceFiles'
import { PUBLISHED_ALLEYS_KEY } from './publicPreview'

export function LocalWorkspaceTools({ store, alleys, onAlleysChange, terrainMode, onTerrainMode }: {
  store: BuildingEditStore; alleys: Alley[]; onAlleysChange?: (alleys: Alley[]) => void
  terrainMode: boolean; onTerrainMode: (terrain: boolean) => void
}) {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!preview || store.server !== false) return
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [preview, store.server])
  if (store.server !== false) return null
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setNotice('')
    try { await action() } catch (error) { setNotice((error as Error).message || '파일 작업에 실패했습니다.') }
    finally { setBusy(false) }
  }
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return <div className="gamcheon-map__workspace-tools">
    <strong>로컬 지도 편집기</strong>
    <div className="gamcheon-map__model-item-actions">
      <button type="button" aria-pressed={!terrainMode} onClick={() => onTerrainMode(false)}>평지 편집</button>
      <button type="button" aria-pressed={terrainMode} onClick={() => onTerrainMode(true)}>3D 지형 편집</button>
    </div>
    <div className="gamcheon-map__model-item-actions">
      <button type="button" disabled={busy || store.busy} onClick={() => void run(async () => {
        const archive = await createProjectBackup(store.draft, store.published, alleys, await readLocalModelFiles())
        downloadWorkspaceFile(archive, `gamcheon-project-${stamp()}.zip`); setNotice('건물 초안·공개본·골목·GLB 백업을 내려받았습니다.')
      })}>프로젝트 백업 ZIP</button>
      <label className="gamcheon-map__model-import">백업 불러오기<input type="file" aria-label="프로젝트 백업 불러오기" accept=".zip" disabled={busy || store.busy}
        onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = ''
          if (!file) return
          void run(async () => {
            if (!store.onRestore) throw new Error('이 편집 저장소는 프로젝트 복원을 지원하지 않습니다.')
            const { project, files } = await readProjectBackup(file)
            if (project.alleys.length && !onAlleysChange) throw new Error('이 화면은 골목길 복원을 지원하지 않습니다.')
            await restoreLocalModelFiles(files)
            store.onRestore?.(project.draft, project.published)
            onAlleysChange?.(project.alleys)
            setNotice('프로젝트를 복원했습니다. 건물 초안 변경은 실행 취소로 되돌릴 수 있습니다.')
          })
        }} /></label>
    </div>
    <div className="gamcheon-map__model-item-actions">
      <button type="button" disabled={busy || store.busy} onClick={() => {
        try {
          localStorage.setItem(PUBLISHED_ALLEYS_KEY, JSON.stringify(alleys))
          setPreview(true)
        } catch { setNotice('미리보기용 골목 데이터를 저장하지 못했습니다.') }
      }}>사용자 지도 미리보기</button>
    </div>
    <p className="gamcheon-map__model-help">미리보기는 이 브라우저에서 확정한 공개본을 사용합니다. ZIP은 로컬 프로젝트 백업·복원용입니다. 서버 공개는 서버 편집 앱에서 진행합니다.</p>
    {busy && <p role="status">파일을 준비하고 있습니다…</p>}
    {notice && <p className="gamcheon-map__model-help" role="status">{notice}</p>}
    {preview && createPortal(<dialog ref={dialogRef} className="gamcheon-map__public-preview" aria-label="사용자용 공개본 미리보기"
      onCancel={() => setPreview(false)}>
      <header><strong>사용자용 공개본 미리보기</strong><button type="button" autoFocus onClick={() => setPreview(false)}>미리보기 닫기</button></header>
      <iframe title="사용자 지도 미리보기" src="/?mode=full" />
    </dialog>, document.body)}
  </div>
}
