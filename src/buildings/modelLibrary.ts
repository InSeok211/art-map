import { useEffect, useState } from 'react'
import { setLocalModelSource } from './buildingEdits'
import { checkGlb, MAX_GLB_BYTES } from './glbCheck'

// 작업실 '건물' 탭에서 올린 3D 모델(GLB) 파일 목록입니다.
//  - 홈페이지 관리자 화면: 홈페이지 파일 저장소(R2)에 올리고 /api/map-models/<번호>로 받습니다.
//  - 개발 미리보기: 이 브라우저(IndexedDB)에만 담아 둡니다.
const API = '/api/admin/map-models'
const DATABASE = 'gamcheon-map-model-files'
const STORE = 'files'

export interface ModelFile {
  id: string
  name: string
  size: number
}

export interface ModelLibrary {
  files: ModelFile[]
  uploading: boolean
  error: string
  upload: (file: File) => Promise<ModelFile | null>
  remove: (id: string) => Promise<void>
}

const newModelId = () => `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
const displayName = (name: string) => name.replace(/\.glb$/i, '').slice(0, 80) || '모델'

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openStore()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(database.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}
type StoredFile = ModelFile & { file: Blob }

// 개발 미리보기에서 3D 거리가 이 브라우저에 담아 둔 모델 파일을 읽게 합니다.
const localUrls = new globalThis.Map<string, string>()
function registerLocalSource() {
  setLocalModelSource(async (id) => {
    const cached = localUrls.get(id)
    if (cached) return cached
    const record = await withStore<StoredFile | undefined>('readonly', (store) => store.get(id))
    if (!record) return null
    const url = URL.createObjectURL(record.file)
    localUrls.set(id, url)
    return url
  })
}

async function readError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string }
  return body.error || `오류 ${response.status}`
}

// server: 홈페이지 저장소를 쓰는지(null이면 아직 모름)
export function useModelLibrary(server: boolean | null): ModelLibrary {
  const [files, setFiles] = useState<ModelFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (server === null) return
    let cancelled = false
    if (server) {
      fetch(API, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error(await readError(response))
          return response.json() as Promise<{ files: ModelFile[] }>
        })
        .then((body) => { if (!cancelled) setFiles(body.files) })
        .catch((reason: Error) => { if (!cancelled) setError(`모델 목록을 불러오지 못했습니다: ${reason.message}`) })
    } else {
      registerLocalSource()
      withStore<StoredFile[]>('readonly', (store) => store.getAll())
        .then((records) => { if (!cancelled) setFiles(records.map(({ id, name, size }) => ({ id, name, size }))) })
        .catch(() => { /* 이 브라우저에 저장소를 쓸 수 없으면 빈 목록 */ })
    }
    return () => { cancelled = true }
  }, [server])

  async function upload(file: File) {
    setError('')
    if (server === null) {
      setError('관리자 저장소 연결을 확인할 수 없습니다. 페이지를 새로고침해 주세요.')
      return null
    }
    // 너무 큰 파일은 메모리로 읽기 전에 거릅니다.
    if (file.size > MAX_GLB_BYTES) {
      setError(`파일이 너무 큽니다(최대 ${MAX_GLB_BYTES / 1024 / 1024}MB).`)
      return null
    }
    const problem = checkGlb(await file.arrayBuffer())
    if (problem) {
      setError(problem)
      return null
    }
    setUploading(true)
    try {
      let saved: ModelFile
      if (server) {
        const form = new FormData()
        form.append('file', file)
        const response = await fetch(API, { method: 'POST', body: form })
        if (!response.ok) throw new Error(await readError(response))
        saved = (await response.json() as { file: ModelFile }).file
      } else {
        saved = { id: newModelId(), name: displayName(file.name), size: file.size }
        await withStore('readwrite', (store) => store.put({ ...saved, file } satisfies StoredFile))
      }
      setFiles((current) => [...current, saved])
      return saved
    } catch (reason) {
      setError(`모델을 올리지 못했습니다: ${(reason as Error).message}`)
      return null
    } finally {
      setUploading(false)
    }
  }

  async function remove(id: string) {
    setError('')
    if (server === null) {
      setError('관리자 저장소 연결을 확인할 수 없습니다. 페이지를 새로고침해 주세요.')
      return
    }
    try {
      if (server) {
        const response = await fetch(`${API}/${id}`, { method: 'DELETE' })
        if (!response.ok) throw new Error(await readError(response))
      } else {
        await withStore('readwrite', (store) => store.delete(id))
      }
      setFiles((current) => current.filter((item) => item.id !== id))
    } catch (reason) {
      setError(`모델 파일을 지우지 못했습니다: ${(reason as Error).message}`)
    }
  }

  return { files, uploading, error, upload, remove }
}
