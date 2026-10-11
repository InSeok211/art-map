import type * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { resolveModelUrl } from '../buildings/buildingEdits'
import type { PlacedModel } from '../buildings/buildingEdits'

// 3D 거리가 쓰는 모델(GLB) 파일 받기입니다. 같은 주소는 한 번만 받아 두고(3D 거리를 다시 만들어도 다시 받지 않음),
// 실패하면 다음에 다시 받을 수 있게 비웁니다.

// 그린하우스·아름다운한글 전용 모델
export const GREEN_HOUSE_URL = new URL('../assets/models/custom/greenhouse-sixpence-connected.glb', import.meta.url).href
export const BEAUTIFUL_HANGUL_URL = new URL('../assets/models/custom/beautiful-hangul-studio.glb', import.meta.url).href

const downloads = new globalThis.Map<string, Promise<ArrayBuffer>>()
export function downloadModel(url: string) {
  let download = downloads.get(url)
  if (!download) {
    download = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${url}`)
      return response.arrayBuffer()
    })
    download.catch(() => downloads.delete(url))
    downloads.set(url, download)
  }
  return download
}

// 그린하우스·아름다운한글 모델(약 1.9MB)은 예전에는 3D 거리를 다 만든 뒤에야 받기 시작해 마지막에 몇 초를
// 더 기다렸습니다. 지도를 열자마자 받기 시작하고(GamcheonMap), 거리가 준비되면 받아 둔 파일을 바로 읽습니다.
export function prefetchStreetModels() {
  downloadModel(GREEN_HOUSE_URL).catch(() => undefined)
  downloadModel(BEAUTIFUL_HANGUL_URL).catch(() => undefined)
}

// 관리자가 올린 3D 모델도 고친 내용을 받자마자 받기 시작합니다(3D 거리를 다 만든 뒤에 받지 않게).
export function prefetchPlacedModels(models: readonly PlacedModel[]) {
  for (const modelId of new Set(models.map((model) => model.modelId))) {
    resolveModelUrl(modelId).then(downloadModel).catch(() => undefined)
  }
}

export function loadModel(url: string, onLoad: (gltf: { scene: THREE.Group }) => void, onError: () => void) {
  downloadModel(url)
    .then((buffer) => new GLTFLoader().parse(buffer, '', onLoad, onError))
    .catch(onError)
}
