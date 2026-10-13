import type { Map } from 'maplibre-gl'

// 고른 모델·건물 손잡이의 안내선입니다. 3D 거리(Three.js) 아래로 가리지 않게 지도 위에 SVG로 그립니다.
//  - 회전 원(가운데에서 손잡이까지), 긴 쪽 축(크기 손잡이 ~ 회전 손잡이), 건물이면 옮긴 뒤의 윤곽 미리보기
// 위치는 [경도, 위도]로 받고, 지도가 움직이면 다시 그립니다.
type LngLat = [number, number]
export interface GuideShape {
  center: LngLat
  ring: LngLat[]
  axis: [LngLat, LngLat]
  outline?: LngLat[]
  active?: boolean
}

const SVG = 'http://www.w3.org/2000/svg'

export function createHandleGuide(map: Map) {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'gamcheon-map__handle-guide')
  svg.setAttribute('aria-hidden', 'true')
  const ring = document.createElementNS(SVG, 'polygon')
  ring.setAttribute('class', 'is-ring')
  const axis = document.createElementNS(SVG, 'line')
  axis.setAttribute('class', 'is-axis')
  const outline = document.createElementNS(SVG, 'polygon')
  outline.setAttribute('class', 'is-outline')
  svg.append(ring, outline, axis)
  map.getCanvasContainer().appendChild(svg)

  let shape: GuideShape | null = null
  const points = (list: LngLat[]) => list.map((point) => {
    const { x, y } = map.project(point)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const draw = () => {
    svg.style.display = shape ? '' : 'none'
    if (!shape) return
    svg.classList.toggle('is-active', !!shape.active)
    ring.setAttribute('points', points(shape.ring))
    const [a, b] = shape.axis.map((point) => map.project(point))
    axis.setAttribute('x1', String(a.x)); axis.setAttribute('y1', String(a.y))
    axis.setAttribute('x2', String(b.x)); axis.setAttribute('y2', String(b.y))
    outline.style.display = shape.outline ? '' : 'none'
    if (shape.outline) outline.setAttribute('points', points(shape.outline))
  }
  map.on('move', draw)
  return {
    set(next: GuideShape | null) { shape = next; draw() },
    remove() { map.off('move', draw); svg.remove() },
  }
}
