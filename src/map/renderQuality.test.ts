import { describe, expect, it } from 'vitest'
import { isIntegratedGpu, MSAA_PIXEL_BUDGET, shouldAntialias } from './renderQuality'

describe('render quality', () => {
  it('tells integrated GPUs from discrete ones by the WebGL renderer name', () => {
    expect(isIntegratedGpu('ANGLE (AMD, AMD Radeon (TM) Graphics (0x000015E7) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true)
    expect(isIntegratedGpu('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true)
    expect(isIntegratedGpu('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true)
    expect(isIntegratedGpu('ANGLE (AMD, AMD Radeon(TM) 780M Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true)
    expect(isIntegratedGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe(true)
    expect(isIntegratedGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false)
    expect(isIntegratedGpu('ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false)
    expect(isIntegratedGpu('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false)
    // 애플 실리콘은 내장이지만 MSAA를 충분히 감당하므로 외장처럼 둡니다.
    expect(isIntegratedGpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)')).toBe(null)
    expect(isIntegratedGpu(null)).toBe(null)
  })

  it('turns MSAA off on integrated GPUs only when the canvas is large', () => {
    expect(shouldAntialias({ width: 1920, height: 1080, pixelRatio: 1, integratedGpu: true })).toBe(false)
    expect(shouldAntialias({ width: 1366, height: 768, pixelRatio: 1.25, integratedGpu: true })).toBe(false)
    expect(shouldAntialias({ width: 1366, height: 768, pixelRatio: 1, integratedGpu: true })).toBe(true)
    expect(shouldAntialias({ width: 1920, height: 1080, pixelRatio: 1, integratedGpu: false })).toBe(true)
    expect(shouldAntialias({ width: 1920, height: 1080, pixelRatio: 1, integratedGpu: null })).toBe(true)
    expect(1366 * 768).toBeLessThan(MSAA_PIXEL_BUDGET)
  })

  it('keeps MSAA off on dense screens regardless of the GPU', () => {
    expect(shouldAntialias({ width: 390, height: 844, pixelRatio: 2, integratedGpu: false })).toBe(false)
    expect(shouldAntialias({ width: 390, height: 844, pixelRatio: 2, integratedGpu: null })).toBe(false)
  })
})
