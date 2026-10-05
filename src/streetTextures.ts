import * as THREE from 'three'

// 거리 장면의 벽·바닥·지붕 재질에 쓰는 128px 절차 텍스처입니다.
export type ConceptSurface = 'brick' | 'white-brick' | 'lime-rib' | 'wood' | 'pink-plaster' | 'concrete' | 'lane-plaster' | 'lane-brick'
  | 'context-tile' | 'context-stucco' | 'context-stone' | 'roof-grain'
  | 'district-window' | 'district-facade' | 'workshop-brick'
  | 'ground-pavers' | 'ground-stone' | 'ground-asphalt' | 'ground-cobble' | 'ground-lane' | 'ground-grass' | 'roof-sheet'

type Rgb = [number, number, number]

const SIZE = 128

const BASE_COLORS: Record<ConceptSurface, Rgb> = {
  brick: [151, 78, 62], 'white-brick': [226, 225, 212],
  'lime-rib': [155, 190, 48], wood: [137, 89, 53], 'pink-plaster': [204, 150, 141],
  concrete: [175, 173, 165], 'lane-plaster': [242, 239, 229], 'lane-brick': [245, 238, 226],
  'context-tile': [247, 246, 240], 'context-stucco': [244, 242, 234], 'context-stone': [235, 234, 225],
  'roof-grain': [245, 245, 241],
  'district-window': [100, 143, 153], 'district-facade': [244, 242, 234], 'workshop-brick': [198, 186, 168],
  'ground-pavers': [231, 239, 232], 'ground-stone': [226, 233, 227],
  'ground-asphalt': [110, 121, 125], 'ground-cobble': [181, 207, 207], 'ground-lane': [144, 163, 166], 'ground-grass': [153, 193, 139],
  'roof-sheet': [228, 239, 238],
}

// 텍스처 한 장이 덮는 반복 횟수입니다. 목록에 없는 재질은 기본값(1, 1)입니다.
const REPEATS: Partial<Record<ConceptSurface, [number, number]>> = {
  'ground-pavers': [44, 60], 'ground-stone': [8, 8], 'ground-asphalt': [8, 5], 'ground-cobble': [14, 4],
  'ground-lane': [2, 2], 'ground-grass': [12, 12], 'roof-sheet': [2, 1], 'roof-grain': [1, 1],
}

const BRICK_MORTAR: Partial<Record<ConceptSurface, number>> = { brick: 52, 'lane-brick': 176, 'white-brick': 232 }

// 작가님 공방의 쪼갠면 벽돌: 연한 베이지·회갈색·갈색이 섞인 긴 벽돌(약 36cm×9cm)과 밝은 회색 줄눈.
// 텍스처 한 장(128px)이 1.44m를 덮도록 StreetSceneLayer가 UV를 맞춥니다.
const WORKSHOP_BRICK_TONES: Rgb[] = [
  [204, 190, 166], [188, 176, 158], [171, 160, 146], [158, 136, 112],
  [214, 204, 186], [137, 124, 110], [192, 164, 132], [181, 178, 170],
]
function workshopBrick(x: number, y: number): Rgb {
  const course = Math.floor(y / 8)
  const shifted = x + (course % 2) * 16
  const brick = Math.floor(shifted / 32) % 4
  if (y % 8 === 0 || shifted % 32 === 0) return [202, 198, 189]
  const hash = (course * 31 + brick * 17 + course * brick * 7) % 23
  const [red, green, blue] = WORKSHOP_BRICK_TONES[hash % WORKSHOP_BRICK_TONES.length]
  // 쪼갠면의 거친 결과 아래쪽 그늘
  const grain = ((x * 37 + y * 91 + x * y * 13) % 17) - 8
  const shade = grain * 0.9 + (y % 8 === 7 ? -14 : 0)
  return [red + shade, green + shade, blue + shade]
}

// 한 픽셀의 색입니다. 대부분 기본색을 밝거나 어둡게(shade) 바꾸고, 줄눈·창틀은 고정색을 씁니다.
function pixelColor(kind: ConceptSurface, x: number, y: number): Rgb {
  const [red, green, blue] = BASE_COLORS[kind]
  const tinted = (shade: number): Rgb => [red + shade, green + shade, blue + shade]
  const noise = ((x * 73 + y * 151 + x * y * 17) % 23) - 11

  if (kind === 'district-facade') {
    // 벽 한 칸(폭 3.1m × 층고 2.65m): 가운데 창(틀·창턱 포함)과 아래쪽 층 띠(텍스처 0행이 아래). 벽색과 곱해지므로 창은 어둡게 둡니다.
    if (y < 5) return tinted(-14)
    const frame = x >= 34 && x <= 94 && y >= 36 && y <= 90
    const glass = x >= 38 && x <= 90 && y >= 40 && y <= 86
    if (glass) return [70 + (x < 64 ? 14 : 0) + Math.round(y * 0.1), 98 + (x < 64 ? 12 : 0), 110 + (x < 64 ? 10 : 0)]
    if (frame) return [236, 238, 230]
    if (y >= 31 && y <= 35 && x >= 30 && x <= 98) return tinted(-26)
    return tinted(((x * 73 + y * 151 + x * y * 17) % 23 - 11) * 0.6)
  }
  if (kind === 'district-window') {
    const frame = x < 7 || x > 120 || y < 7 || y > 120 || Math.abs(x - 64) < 3 || Math.abs(y - 51) < 2
    return frame ? [231, 233, 222] : tinted(noise * 0.2 + (x < 60 ? 10 : -12) + y * 0.12)
  }
  if (kind === 'workshop-brick') return workshopBrick(x, y)
  if (kind === 'roof-sheet') {
    const rib = x % 8
    return tinted(rib < 2 ? -33 : rib < 4 ? 7 : noise * 0.35)
  }
  if (kind === 'roof-grain') return tinted(x % 40 === 0 || y % 40 === 0 ? -11 : noise * 0.55)
  if (kind === 'ground-lane') return tinted(noise * 0.18)
  if (kind.startsWith('ground-')) {
    const tile = kind === 'ground-cobble' ? 12 : 20
    const paver = kind === 'ground-stone' || kind === 'ground-cobble'
    const joint = paver && (x % tile < 1 || y % (kind === 'ground-cobble' ? 9 : tile) < 1)
    if (joint) return tinted(-16)
    const speckle = (x * 19 + y * 37 + x * y * 3) % 29 === 0 ? 13 : 0
    const variation = ((Math.floor(x / tile) * 7 + Math.floor(y / tile) * 13) % 5 - 2) * 3
    return tinted(noise * (kind === 'ground-grass' ? 1.8 : kind === 'ground-pavers' ? 0.3 : 0.65) + variation + speckle)
  }
  if (kind.startsWith('context-')) {
    const stagger = Math.floor(y / 13) % 2 ? 14 : 0
    const tileJoint = kind === 'context-tile' && (y % 13 < 1 || (x + stagger) % 28 < 1)
    const stoneJoint = kind === 'context-stone' && (y % 22 < 2 || (x + Math.floor(y / 22) * 17) % 44 < 2)
    return tinted(tileJoint ? -31 : stoneJoint ? -24 : noise * (kind === 'context-stucco' ? 0.8 : 0.42))
  }

  // 벽돌·골강판·목재·미장 벽
  const courseHeight = kind === 'white-brick' ? 13 : 16
  const brickX = (x + (Math.floor(y / courseHeight) % 2) * 16) % 32
  const mortar = BRICK_MORTAR[kind]
  if (mortar !== undefined && (y % courseHeight < 2 || brickX < 2)) return [mortar, mortar, mortar]
  if ((kind === 'lime-rib' && x % 9 < 2) || (kind === 'wood' && x % 23 < 2)) return tinted(-22)
  return tinted(noise + (kind === 'wood' ? Math.sin(x * 0.34 + y * 0.07) * 10 : 0))
}

export function conceptTexture(kind: ConceptSurface) {
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const offset = (y * SIZE + x) * 4
    const color = pixelColor(kind, x, y)
    for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = Math.max(0, Math.min(255, color[channel]))
    pixels[offset + 3] = 255
  }
  const texture = new THREE.DataTexture(pixels, SIZE, SIZE, THREE.RGBAFormat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  const repeat = REPEATS[kind]
  if (repeat) texture.repeat.set(...repeat)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}
