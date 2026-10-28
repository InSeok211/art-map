// 화면 품질과 속도 사이의 선택: 멀티샘플링(MSAA)을 켤지 정합니다.
//
// MSAA는 건물 모서리의 계단 현상을 줄이지만, 화면 픽셀마다 4개 샘플을 그려 합치므로 큰 캔버스에서는 그래픽 처리
// 부담이 큽니다. CPU에 붙은 내장 GPU(인텔 UHD·AMD Radeon Graphics 등)로 전체화면(1920×1080) 지도를 끌면
// MSAA만으로 프레임이 22→36fps까지 달라졌습니다. 외장 GPU에서는 차이가 작아 그대로 켭니다.

// 이 픽셀 수(캔버스 가로×세로×픽셀 밀도²)를 넘는 캔버스는 내장 GPU에서 MSAA를 끕니다. 1366×768 노트북(약 105만)은
// 켜고, 1920×1080(약 207만)과 배율 125%의 1366×768(약 164만)은 끕니다.
export const MSAA_PIXEL_BUDGET = 1_200_000

// 외장 GPU 이름에 흔히 들어가는 표현. 먼저 확인해 'Radeon RX'가 내장 'Radeon Graphics'로 잡히지 않게 합니다.
const DISCRETE_GPU = /GeForce|RTX|GTX|Quadro|Titan|Radeon\s*(\(TM\))?\s*(RX|Pro|R9|R7|VII)\b|FirePro|Arc\s*(\(TM\))?\s*[AB]\d{3}/i
// 내장 GPU·소프트웨어 렌더러 이름에 흔히 들어가는 표현
const INTEGRATED_GPU = /Intel|Iris|UHD Graphics|HD Graphics|Radeon\s*(\(TM\))?\s*(Graphics|Vega|\d{3}M\b)|Mali|Adreno|PowerVR|llvmpipe|SwiftShader|Mesa/i

// WebGL이 알려 주는 GPU 이름(WEBGL_debug_renderer_info). 모르면 null.
export function gpuRendererName(): string | null {
  if (typeof document === 'undefined' || typeof WebGLRenderingContext === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return null
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return name
  } catch {
    return null
  }
}

// GPU 이름으로 내장 GPU(또는 소프트웨어 렌더러)인지 가립니다. 모르면 null.
export function isIntegratedGpu(renderer: string | null): boolean | null {
  if (!renderer) return null
  if (DISCRETE_GPU.test(renderer)) return false
  if (INTEGRATED_GPU.test(renderer)) return true
  return null
}

export type AntialiasChoice = {
  width: number; height: number; pixelRatio: number
  // isIntegratedGpu의 결과. 모르면(null) 외장 GPU처럼 다룹니다.
  integratedGpu: boolean | null
}

// 캔버스 크기와 GPU 종류로 MSAA를 켤지 정합니다.
export function shouldAntialias({ width, height, pixelRatio, integratedGpu }: AntialiasChoice) {
  // 화면 밀도가 2 이상이면 계단 현상이 거의 안 보이므로 끕니다(휴대폰 대부분).
  if (pixelRatio >= 2) return false
  if (integratedGpu && width * height * pixelRatio * pixelRatio > MSAA_PIXEL_BUDGET) return false
  return true
}
