import type { ModelAsset } from './modelCatalog'

const DATABASE = 'gamcheon-map-assets'
const STORE = 'models'

interface StoredModel {
  id: string
  name: string
  file: Blob
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveCustomModel(file: File): Promise<ModelAsset> {
  const id = `custom-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
  const database = await openStore()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put({ id, name: file.name, file } satisfies StoredModel)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
  return { id, name: file.name.replace(/\.glb$/i, ''), style: 'custom', category: 'building', url: URL.createObjectURL(file), defaultWidth: 12 }
}

export async function loadCustomModels(): Promise<ModelAsset[]> {
  const database = await openStore()
  try {
    const records = await new Promise<StoredModel[]>((resolve, reject) => {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      request.onsuccess = () => resolve(request.result as StoredModel[])
      request.onerror = () => reject(request.error)
    })
    return records.map(({ id, name, file }) => ({
      id,
      name: name.replace(/\.glb$/i, ''),
      style: 'custom' as const,
      category: 'building' as const,
      url: URL.createObjectURL(file),
      defaultWidth: 12,
    }))
  } finally {
    database.close()
  }
}
