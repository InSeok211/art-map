// 관리자가 올리는 3D 모델(GLB) 파일 검사입니다. 지도 앱 서버(server/models.ts)도 이 함수로 다시 검사합니다.
//  - glTF 2.0 바이너리(GLB) 한 파일이어야 합니다(텍스처·버퍼가 파일 안에 들어 있어야 함).
//  - 다른 주소를 불러오는 링크(외부 텍스처·버퍼)는 받지 않습니다(공개 지도를 연 사람의 브라우저가 다른 곳에 접속하지 않게).
//  - 지도가 읽지 못하는 압축 형식(Draco·meshopt·Basis)은 받지 않습니다.
export const MAX_GLB_BYTES = 20 * 1024 * 1024
const UNSUPPORTED_EXTENSIONS = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu']

export function checkGlb(buffer: ArrayBuffer): string | null {
  if (buffer.byteLength > MAX_GLB_BYTES) return `파일이 너무 큽니다(최대 ${MAX_GLB_BYTES / 1024 / 1024}MB).`
  if (buffer.byteLength < 20) return 'GLB 파일이 아닙니다.'
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== 0x46546c67) return 'GLB 파일이 아닙니다(.gltf는 텍스처를 묶은 .glb로 내보내 주세요).'
  if (view.getUint32(4, true) !== 2) return 'glTF 2.0 형식의 GLB만 올릴 수 있습니다.'
  if (view.getUint32(8, true) !== buffer.byteLength) return 'GLB 파일이 손상되었습니다.'
  const jsonLength = view.getUint32(12, true)
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + jsonLength > buffer.byteLength) return 'GLB 파일이 손상되었습니다.'
  let json: { buffers?: { uri?: unknown }[]; images?: { uri?: unknown }[]; extensionsRequired?: unknown; meshes?: unknown[] }
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)))
  } catch {
    return 'GLB 파일이 손상되었습니다.'
  }
  const external = [...(json.buffers ?? []), ...(json.images ?? [])].some((item) => typeof item?.uri === 'string' && !item.uri.startsWith('data:'))
  if (external) return '다른 파일을 불러오는 GLB는 올릴 수 없습니다. 텍스처를 포함해 하나의 .glb로 내보내 주세요.'
  const required = Array.isArray(json.extensionsRequired) ? json.extensionsRequired : []
  const unsupported = required.find((name) => UNSUPPORTED_EXTENSIONS.includes(String(name)))
  if (unsupported) return `압축(${unsupported})을 끄고 다시 내보내 주세요.`
  if (!Array.isArray(json.meshes) || !json.meshes.length) return '모델 안에 도형이 없습니다.'
  return null
}
