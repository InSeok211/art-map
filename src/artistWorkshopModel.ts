import * as THREE from 'three'
import type { ConceptSurface } from './streetTextures'

// 작가님 공방(꿈꾸는작업실)의 전용 모델입니다. 치수는 카카오 장소 로드뷰(pano 1202733209, 2025년 11월)를
// 같은 위치에서 방향을 바꿔 가며 잰 값입니다. 보이지 않는 남쪽·동쪽 벽은 같은 벽돌로 닫기만 합니다.
//
// 좌표는 공방 윤곽의 골목·갈림길 모서리(통창이 꺾이는 곳)를 원점으로 한 평면 좌표입니다.
//   s: 골목 쪽 벽을 따라 오르막(동남동) 방향, t: 골목 쪽 벽에서 건물 안쪽(남남서) 방향, y: 높이
// 골목 쪽 면은 t = 0 평면이고 바깥이 t < 0, 갈림길 쪽 면은 s = 0 평면이고 바깥이 s < 0입니다.

// 마감: glow 스스로 빛나는 조명, lit 은은하게 밝힌 실내, clear-glass 속이 비치는 유리, halo 바닥 강조 띠
export type WorkshopFinish = 'glow' | 'lit' | 'clear-glass' | 'halo'

export interface WorkshopPainter {
  box(color: number, width: number, height: number, depth: number, x: number, y: number, z: number,
    rotation?: number, glass?: boolean, surface?: ConceptSurface): void
  beam(color: number, from: [number, number, number], to: [number, number, number], thickness: number): void
  roof(color: number, outline: [number, number][], height: number, surface?: ConceptSurface): void
  geometry(color: number, geometry: THREE.BufferGeometry, finish?: WorkshopFinish): void
}

export const WORKSHOP_DIMENSIONS = {
  wallHeight: 3.55,
  // 모서리를 감싸는 통창 돌출 칸: 골목 쪽 세 칸, 갈림길 쪽 한 칸
  bayProjection: 0.16,
  bayLaneLength: 2.75,
  bayLanePanes: 3,
  bayFrontLength: 1.05,
  baySill: 1.05,
  bayHead: 2.75,
  // 갈림길 쪽 흰 양문(넓은 문짝 + 좁은 문짝)과 콘크리트 계단참
  doorStart: 1.6,
  doorEnd: 2.8,
  landingHeight: 0.3,
  railingHeight: 1.0,
  // 지도에서 공방을 찾기 쉽게 벽에서 조금 띄워 두르는 바닥 강조 띠(지도 표시이며 실제 시설이 아닙니다)
  haloGap: 0.35,
  haloWidth: 0.55,
} as const

const COLORS = {
  brick: 0xffffff, // 벽돌 색은 workshop-brick 텍스처가 그대로 냅니다.
  plinth: 0xd2cfc6,
  aluminium: 0x40484b,
  glass: 0xb9d0d3,
  door: 0xf1f2ee,
  doorGlass: 0x8ea4a9,
  handle: 0xb9bec0,
  concrete: 0xf4f1e8,
  cap: 0xd9d6cc,
  roof: 0xf0eee6,
  steel: 0xc8cfd0,
  plate: 0x2f5f9c,
  pipe: 0x8f9594,
  // 실내: 밝은 회벽, 나무 바닥·선반·작업대, 따뜻한 조명
  interiorWall: 0xf4ecdd,
  ceiling: 0xfbf4e6,
  floor: 0xb68d63,
  wood: 0x9c7451,
  tableTop: 0xd9b98f,
  reel: 0x50575b,
  reelHub: 0xc9ced0,
  shade: 0x2f3437,
  bulb: 0xffd79a,
  halo: 0xe8742f,
}

// 선반 위 물감 통·책·상자처럼 보이는 작은 물건들의 색입니다.
const SUPPLY_COLORS = [0xd9534f, 0xf0ad4e, 0x5bc0de, 0x5cb85c, 0x8e6bbf, 0xf2e8cf, 0xe07a5f, 0x3d5a80]

export function buildArtistWorkshopModel(paint: WorkshopPainter, outline: [number, number][]) {
  // 윤곽 순서는 streetSceneData의 splitWorkshopFootprint와 같습니다: 모서리, 골목 쪽 끝, 안쪽 끝, 갈림길 쪽 끝
  const [origin, laneEnd, , frontEnd] = outline
  const laneLength = Math.hypot(laneEnd[0] - origin[0], laneEnd[1] - origin[1])
  const frontLength = Math.hypot(frontEnd[0] - origin[0], frontEnd[1] - origin[1])
  const u: [number, number] = [(laneEnd[0] - origin[0]) / laneLength, (laneEnd[1] - origin[1]) / laneLength]
  const w: [number, number] = [(frontEnd[0] - origin[0]) / frontLength, (frontEnd[1] - origin[1]) / frontLength]
  const rotation = -Math.atan2(u[1], u[0])
  const world = (s: number, t: number): [number, number] => [
    origin[0] + u[0] * s + w[0] * t, origin[1] + u[1] * s + w[1] * t,
  ]
  // (s, t) 축에 맞춘 상자. 범위는 [시작, 끝]으로 받습니다.
  const block = (color: number, [s0, s1]: [number, number], [y0, y1]: [number, number], [t0, t1]: [number, number],
    glass = false, surface?: ConceptSurface) => {
    const [x, z] = world((s0 + s1) / 2, (t0 + t1) / 2)
    paint.box(color, s1 - s0, y1 - y0, t1 - t0, x, (y0 + y1) / 2, z, rotation, glass, surface)
  }
  // 원점에 놓고 만든 도형을 (s, y, t) 위치로 옮깁니다. alongLane이면 도형의 y축을 골목 쪽 벽 방향(s)으로 눕힙니다.
  const place = (geometry: THREE.BufferGeometry, s: number, y: number, t: number, alongLane = false) => {
    if (alongLane) geometry.rotateZ(Math.PI / 2)
    geometry.rotateY(rotation)
    const [x, z] = world(s, t)
    geometry.translate(x, y, z)
    return geometry
  }
  const finished = (finish: WorkshopFinish | undefined, color: number,
    [s0, s1]: [number, number], [y0, y1]: [number, number], [t0, t1]: [number, number]) => {
    paint.geometry(color, place(new THREE.BoxGeometry(s1 - s0, y1 - y0, t1 - t0),
      (s0 + s1) / 2, (y0 + y1) / 2, (t0 + t1) / 2), finish)
  }
  const bar = (color: number, [s0, t0]: [number, number], [s1, t1]: [number, number], y0: number, y1: number, thickness: number) => {
    const [x0, z0] = world(s0, t0)
    const [x1, z1] = world(s1, t1)
    paint.beam(color, [x0, y0, z0], [x1, y1, z1], thickness)
  }

  const d = WORKSHOP_DIMENSIONS
  const L = laneLength, F = frontLength, H = d.wallHeight, P = d.bayProjection
  const wall = 0.2
  const sill = d.baySill, head = d.bayHead
  const brick = (s: [number, number], y: [number, number], t: [number, number]) =>
    block(COLORS.brick, s, y, t, false, 'workshop-brick')

  // 벽돌 외벽. 통창 자리는 벽을 비워 실내가 보이게 합니다(창 아래·위 벽만 남김).
  brick([0, d.bayLaneLength], [0, sill], [0, wall])
  brick([0, d.bayLaneLength], [head, H], [0, wall])
  brick([d.bayLaneLength, L], [0, H], [0, wall])
  brick([0, wall], [0, sill], [wall, d.bayFrontLength])
  brick([0, wall], [head, H], [wall, d.bayFrontLength])
  brick([0, wall], [0, H], [d.bayFrontLength, F - wall])
  brick([0, L], [0, H], [F - wall, F])
  brick([L - wall, L], [0, H], [wall, F - wall])
  // 아랫단 콘크리트 띠
  block(COLORS.plinth, [-0.03, L], [0, 0.16], [-0.03, 0.05], false, 'concrete')
  block(COLORS.plinth, [-0.03, 0.05], [0, 0.16], [0, F], false, 'concrete')

  // 실내: 바닥, 천장, 안쪽 벽 마감. 지붕 그늘 속에서도 작업실 불빛이 보이도록 은은하게 밝힙니다.
  finished('lit', COLORS.floor, [wall, L - wall], [0, 0.06], [wall, F - wall])
  finished('lit', COLORS.ceiling, [wall, L - wall], [H - 0.22, H - 0.17], [wall, F - wall])
  finished('lit', COLORS.interiorWall, [wall, L - wall], [0.06, H - 0.22], [F - wall - 0.02, F - wall])
  finished('lit', COLORS.interiorWall, [L - wall - 0.02, L - wall], [0.06, H - 0.22], [wall, F - wall])
  finished('lit', COLORS.interiorWall, [d.bayLaneLength, L - wall], [0.06, H - 0.22], [wall, wall + 0.02])
  finished('lit', COLORS.interiorWall, [wall, wall + 0.02], [0.06, H - 0.22], [d.bayFrontLength, F - wall])
  // 통창 안쪽 창턱
  finished('lit', COLORS.interiorWall, [-P, d.bayLaneLength], [sill - 0.04, sill], [-P, wall + 0.08])
  finished('lit', COLORS.interiorWall, [-P, wall + 0.08], [sill - 0.04, sill], [wall, d.bayFrontLength])

  // 안쪽 벽 선반과 미술 재료
  const shelfStart = 0.55, shelfEnd = L - 0.45, shelfDepth = 0.3
  for (const [row, y] of [0.95, 1.5, 2.05].entries()) {
    finished(undefined, COLORS.wood, [shelfStart, shelfEnd], [y - 0.03, y], [F - wall - shelfDepth, F - wall - 0.02])
    let s = shelfStart + 0.08
    let item = row * 3
    while (s < shelfEnd - 0.2) {
      const width = 0.1 + ((item * 7) % 5) * 0.035
      const height = 0.14 + ((item * 11) % 4) * 0.06
      finished(undefined, SUPPLY_COLORS[item % SUPPLY_COLORS.length],
        [s, s + width], [y, y + height], [F - wall - shelfDepth + 0.06, F - wall - 0.06])
      s += width + 0.05 + ((item * 13) % 3) * 0.04
      item++
    }
  }
  // 동쪽 안벽에 걸린 캔버스 두 점
  for (const [t0, t1, y0, y1, color, accent] of [
    [0.75, 1.55, 1.3, 2.25, 0x7fb3d5, 0xf6c667], [1.8, 2.7, 1.1, 1.85, 0xe8a87c, 0x41b3a3],
  ] as const) {
    finished(undefined, COLORS.wood, [L - wall - 0.06, L - wall - 0.02], [y0 - 0.04, y1 + 0.04], [t0 - 0.04, t1 + 0.04])
    finished('lit', color, [L - wall - 0.075, L - wall - 0.06], [y0, y1], [t0, t1])
    finished('lit', accent, [L - wall - 0.085, L - wall - 0.075], [y0 + (y1 - y0) * 0.35, y1 - (y1 - y0) * 0.2],
      [t0 + (t1 - t0) * 0.2, t1 - (t1 - t0) * 0.45])
  }
  // 작업대와 그 위의 재료
  const table = { s: [1.15, 2.75] as [number, number], t: [1.45, 2.3] as [number, number], top: 0.86 }
  finished(undefined, COLORS.tableTop, table.s, [table.top - 0.05, table.top], table.t)
  for (const s of [table.s[0] + 0.06, table.s[1] - 0.06]) for (const t of [table.t[0] + 0.06, table.t[1] - 0.06])
    finished(undefined, COLORS.wood, [s - 0.03, s + 0.03], [0.06, table.top - 0.05], [t - 0.03, t + 0.03])
  finished(undefined, 0xf7f3ea, [1.35, 1.95], [table.top, table.top + 0.015], [1.6, 2.05])
  finished(undefined, SUPPLY_COLORS[0], [2.15, 2.25], [table.top, table.top + 0.12], [1.7, 1.8])
  finished(undefined, SUPPLY_COLORS[2], [2.32, 2.42], [table.top, table.top + 0.16], [1.75, 1.85])
  // 갈림길 쪽 창 안에 보이는 둥근 필름 릴 장식(로드뷰에서 보임)
  const reel = { s: 0.45, t: 0.5, y: sill + 0.62, radius: 0.33 }
  paint.geometry(COLORS.reel, place(new THREE.CylinderGeometry(reel.radius, reel.radius, 0.05, 32), reel.s, reel.y, reel.t, true))
  paint.geometry(COLORS.reelHub, place(new THREE.CylinderGeometry(0.07, 0.07, 0.07, 16), reel.s, reel.y, reel.t, true))
  for (let hole = 0; hole < 6; hole++) {
    const angle = hole / 6 * Math.PI * 2
    paint.geometry(COLORS.reelHub, place(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 16),
      reel.s, reel.y + Math.sin(angle) * 0.2, reel.t + Math.cos(angle) * 0.2, true))
  }
  finished(undefined, COLORS.reel, [reel.s - 0.02, reel.s + 0.02], [sill, reel.y - reel.radius], [reel.t - 0.02, reel.t + 0.02])
  // 펜던트 조명
  for (const [s, t] of [[1.45, 1.85], [2.45, 1.85], [0.85, 0.75]] as [number, number][]) {
    bar(COLORS.shade, [s, t], [s, t], 2.62, H - 0.22, 0.012)
    paint.geometry(COLORS.shade, place(new THREE.CylinderGeometry(0.06, 0.17, 0.2, 20, 1, true), s, 2.55, t))
    paint.geometry(COLORS.bulb, place(new THREE.SphereGeometry(0.07, 12, 8), s, 2.47, t), 'glow')
  }

  // 모서리를 감싸는 통창 돌출 칸: 비치는 유리, 알루미늄 틀
  finished('clear-glass', COLORS.glass, [-P, d.bayLaneLength], [sill, head], [-P + 0.015, -P + 0.035])
  finished('clear-glass', COLORS.glass, [-P + 0.015, -P + 0.035], [sill, head], [-P, d.bayFrontLength])
  for (const [y0, y1] of [[head, head + 0.1], [sill - 0.08, sill]] as [number, number][]) {
    block(COLORS.aluminium, [-P - 0.02, d.bayLaneLength + 0.02], [y0, y1], [-P - 0.02, 0])
    block(COLORS.aluminium, [-P - 0.02, 0], [y0, y1], [0, d.bayFrontLength + 0.02])
  }
  // 창 밑 물끊기 판
  block(COLORS.aluminium, [-P - 0.05, d.bayLaneLength + 0.05], [sill - 0.11, sill - 0.08], [-P - 0.05, 0])
  block(COLORS.aluminium, [-P - 0.05, 0], [sill - 0.11, sill - 0.08], [0, d.bayFrontLength + 0.05])
  // 세로 창살: 모서리 기둥, 골목 쪽 칸 나눔, 양 끝(돌출 칸의 옆면을 닫음)
  block(COLORS.aluminium, [-P - 0.03, -P + 0.05], [sill, head], [-P - 0.03, -P + 0.05])
  for (let pane = 1; pane < d.bayLanePanes; pane++) {
    const s = -P + (d.bayLaneLength + P) * pane / d.bayLanePanes
    block(COLORS.aluminium, [s - 0.025, s + 0.025], [sill, head], [-P - 0.02, -P + 0.05])
  }
  block(COLORS.aluminium, [d.bayLaneLength - 0.05, d.bayLaneLength + 0.02], [sill, head], [-P - 0.02, wall])
  block(COLORS.aluminium, [-P - 0.02, wall], [sill, head], [d.bayFrontLength - 0.05, d.bayFrontLength + 0.02])

  // 유리와 금속 프레임 사이의 얇은 검은 고무 가스켓. 큰 통창의 각 판을 분리해 보이게 합니다.
  for (let pane = 0; pane < d.bayLanePanes; pane++) {
    const s0 = -P + (d.bayLaneLength + P) * pane / d.bayLanePanes + 0.035
    const s1 = -P + (d.bayLaneLength + P) * (pane + 1) / d.bayLanePanes - 0.035
    for (const y of [sill + 0.025, head - 0.025])
      block(0x242b2d, [s0, s1], [y - 0.012, y + 0.012], [-P - 0.025, -P - 0.012])
    for (const s of [s0, s1])
      block(0x242b2d, [s - 0.012, s + 0.012], [sill + 0.025, head - 0.025], [-P - 0.025, -P - 0.012])
  }
  // 모서리 창 뒤의 얇은 안쪽 프레임과 창턱의 깊이.
  block(0x738084, [-P + 0.045, d.bayLaneLength - 0.035], [head - 0.035, head], [-P + 0.045, -P + 0.075])
  block(0x738084, [-P + 0.045, -P + 0.075], [head - 0.035, head], [-P + 0.045, d.bayFrontLength - 0.035])

  // 갈림길 쪽 흰 양문, 위 등, 도로명 주소판, 계단참
  const doorStart = d.doorStart, doorEnd = d.doorEnd, base = d.landingHeight
  const split = doorStart + (doorEnd - doorStart) * 0.62
  block(COLORS.door, [-0.06, 0.02], [base, base + 2.15], [doorStart - 0.06, doorEnd + 0.06])
  for (const [t0, t1] of [[doorStart + 0.02, split - 0.02], [split + 0.02, doorEnd - 0.02]] as [number, number][]) {
    block(COLORS.door, [-0.09, -0.05], [base + 0.03, base + 2.09], [t0, t1])
    block(COLORS.doorGlass, [-0.1, -0.085], [base + 0.95, base + 1.98], [t0 + 0.07, t1 - 0.07], true)
    block(COLORS.door, [-0.11, -0.09], [base + 0.86, base + 0.92], [t0 + 0.05, t1 - 0.05])
  }
  block(COLORS.handle, [-0.15, -0.1], [base + 0.85, base + 1.2], [split - 0.09, split - 0.06])
  block(COLORS.door, [-0.2, 0], [2.62, 2.74], [split - 0.11, split + 0.11])
  finished('glow', COLORS.bulb, [-0.205, -0.19], [2.63, 2.73], [split - 0.08, split + 0.08])
  block(COLORS.plate, [-0.03, -0.01], [2.22, 2.4], [doorEnd + 0.22, doorEnd + 0.56])
  block(COLORS.concrete, [-0.95, 0], [0, base], [doorStart - 0.2, doorEnd + 0.3], false, 'concrete')
  block(COLORS.concrete, [-1.25, -0.95], [0, base / 2], [doorStart - 0.2, doorEnd + 0.3], false, 'concrete')

  // 골목 쪽 벽 끝의 빗물받이 관(로드뷰에서 흰 집과 맞닿는 곳)
  const pipe = { s: L - 0.14, t: -0.07 }
  bar(COLORS.pipe, [pipe.s, pipe.t], [pipe.s, pipe.t], 0.12, H - 0.18, 0.075)
  bar(COLORS.pipe, [pipe.s, pipe.t], [pipe.s, 0.12], H - 0.2, H - 0.05, 0.07)
  bar(COLORS.pipe, [pipe.s, pipe.t], [pipe.s, pipe.t - 0.14], 0.14, 0.04, 0.075)

  // 평지붕 옥상 테라스: 낮은 턱, 콘크리트 갓돌, 스테인리스 난간
  paint.roof(COLORS.roof, outline, H - 0.12, 'concrete')
  const capOut = 0.04, capIn = wall + 0.02
  block(COLORS.cap, [-capOut, L + capOut], [H, H + 0.08], [-capOut, capIn])
  block(COLORS.cap, [-capOut, L + capOut], [H, H + 0.08], [F - capIn, F + capOut])
  block(COLORS.cap, [-capOut, capIn], [H, H + 0.08], [capIn, F - capIn])
  block(COLORS.cap, [L - capIn, L + capOut], [H, H + 0.08], [capIn, F - capIn])
  const inset = 0.1
  const corners: [number, number][] = [[inset, inset], [L - inset, inset], [L - inset, F - inset], [inset, F - inset]]
  const railBase = H + 0.08
  corners.forEach((start, index) => {
    const end = corners[(index + 1) % corners.length]
    const length = Math.hypot(end[0] - start[0], end[1] - start[1])
    const posts = Math.max(1, Math.ceil(length / 1.2))
    for (let post = 0; post < posts; post++) {
      const s = start[0] + (end[0] - start[0]) * post / posts
      const t = start[1] + (end[1] - start[1]) * post / posts
      bar(COLORS.steel, [s, t], [s, t], railBase, railBase + d.railingHeight, 0.045)
    }
    for (const [height, thickness] of [[d.railingHeight, 0.05], [0.66, 0.028], [0.33, 0.028]] as [number, number][]) {
      bar(COLORS.steel, start, end, railBase + height, railBase + height, thickness)
    }
  })

  // 바닥 강조 띠: 벽에서 조금 떨어진 따뜻한 주황 띠로 공방 둘레를 감쌉니다. 통창 돌출 칸과 계단참 바깥으로 둘러
  // 앞쪽(갈림길)은 계단참까지 포함합니다.
  const g0 = d.haloGap, g1 = d.haloGap + d.haloWidth
  const west = -1.25 - g0, westOuter = -1.25 - g1
  const north = -P - g0, northOuter = -P - g1
  const haloY: [number, number] = [0.11, 0.125]
  finished('halo', COLORS.halo, [westOuter, L + g1], haloY, [northOuter, north])
  finished('halo', COLORS.halo, [westOuter, L + g1], haloY, [F + g0, F + g1])
  finished('halo', COLORS.halo, [westOuter, west], haloY, [north, F + g0])
  finished('halo', COLORS.halo, [L + g0, L + g1], haloY, [north, F + g0])
}
