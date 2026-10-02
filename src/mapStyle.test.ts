import { describe, expect, it } from 'vitest'
import baseStyle from './positron-style.json'
import { BUILDING_FOOTPRINT_LAYER_IDS, createMinimalStyle } from './mapStyle'
import { isBuildingInsideGamcheon2 } from './gamcheonBoundary'

describe('createMinimalStyle', () => {
  it('removes base building shapes and all base map labels', () => {
    const style = createMinimalStyle(baseStyle)

    expect(style.layers.some((layer) => layer.type === 'symbol')).toBe(false)
    expect(style.layers.some((layer) => layer.id === 'building')).toBe(false)
  })

  it('adds building footprints that are hidden until toggled on', () => {
    const style = createMinimalStyle(baseStyle)
    const footprints = style.layers.filter((layer) => layer.source === 'gamcheonBuildings')

    expect(footprints.map((layer) => layer.id)).toEqual([...BUILDING_FOOTPRINT_LAYER_IDS])
    expect(footprints.every((layer) => (layer.layout as Record<string, unknown> | undefined)?.visibility === 'none')).toBe(true)
    // 줌에 따라 사라지지 않도록 벡터 타일이 아닌 저장된 GeoJSON을 쓰고 줌 제한을 두지 않습니다.
    expect(footprints.every((layer) => layer.minzoom === undefined)).toBe(true)
    expect(style.sources).toMatchObject({ gamcheonBuildings: { type: 'geojson' } })
    const source = (style.sources as Record<string, unknown>).gamcheonBuildings as { data: { features: { geometry: { coordinates: number[][][] } }[] } }
    expect(source.data.features.length).toBeGreaterThan(0)
    expect(source.data.features.every((feature) => isBuildingInsideGamcheon2(feature.geometry.coordinates[0]))).toBe(true)
  })

  it('keeps roads, water, and parks for orientation', () => {
    const style = createMinimalStyle(baseStyle)
    const ids = style.layers.map((layer) => layer.id)

    expect(ids).toContain('water')
    expect(ids).toContain('park')
    expect(ids).toContain('highway_minor')
  })

  it('uses a light green illustrated palette and outlines local streets', () => {
    const style = createMinimalStyle(baseStyle)
    const paint = (id: string) => style.layers.find((layer) => layer.id === id)?.paint as Record<string, unknown>
    const ids = style.layers.map((layer) => layer.id)

    expect(paint('background')['background-color']).toBe('#eef5ee')
    expect(paint('water')['fill-color']).toBe('#73c7b8')
    expect(paint('landcover_wood')['fill-color']).toBe('#9ac7a4')
    expect(paint('highway_minor')['line-color']).toBe('#fffaf0')
    expect(ids.indexOf('highway_minor_casing')).toBeLessThan(ids.indexOf('highway_minor'))
  })

  it('keeps the map surface flat when the camera is tilted', () => {
    const style = createMinimalStyle(baseStyle)

    expect(style).not.toHaveProperty('terrain')
    expect(Object.values(style.sources).some((source) =>
      typeof source === 'object' && source !== null && 'type' in source && source.type === 'raster-dem',
    )).toBe(false)
    expect(style.layers.some((layer) => layer.type === 'hillshade')).toBe(false)
  })

  it('masks everything outside the rectangular Gamcheon map area', () => {
    const style = createMinimalStyle(baseStyle)
    const ids = style.layers.map((layer) => layer.id)

    expect(style).toMatchObject({
      sources: {
        gamcheonMapArea: { type: 'geojson' },
        gamcheonOutside: { type: 'geojson' },
      },
    })
    expect(ids.slice(-3)).toEqual(['gamcheon-outside', 'gamcheon-edge-halo', 'gamcheon-edge'])
  })
})

describe('alley layers', () => {
  it('draws user alleys between the local street casing and fill so junctions merge', () => {
    const ids = createMinimalStyle(baseStyle).layers.map((layer) => layer.id)

    expect(ids.indexOf('highway_minor_casing')).toBeLessThan(ids.indexOf('alley-casing'))
    expect(ids.indexOf('alley-casing')).toBeLessThan(ids.indexOf('highway_minor'))
    expect(ids.indexOf('highway_minor')).toBeLessThan(ids.indexOf('alley-fill'))
    expect(ids.indexOf('alley-draft-line')).toBeLessThan(ids.indexOf('gamcheon-outside'))
  })
})
