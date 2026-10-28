import * as THREE from 'three'

// 3D 거리의 재질별 꼭짓점 버퍼입니다. 예전에는 상자·막대·면 조각마다 BufferGeometry를 만들어(단위 상자 복제, 행렬 적용,
// 색·건물 번호 속성 할당) 재질별 목록에 모은 뒤 mergeGeometries로 합치고, 나눠 만든 메시를 다시 합쳤습니다. 첫 장면에
// 조각 5.9만 개·꼭짓점 152만 개가 생겨 그 객체 생성과 두 번의 복사가 빌드 시간의 대부분이었습니다.
// 이제 조각은 재질별로 키워 둔 TypedArray 끝에 좌표를 바로 써 넣고, 메시로 만들 때 한 번만 잘라 냅니다.
//
// 속성 배치: position·uv(float32), normal(int8, 정규화: GPU가 /127로 되돌림), color(uint8, 정규화, 선형 색),
// 고리 묶음이면 buildingIndex(uint16), 편집기면 pickIndex(int16, 없으면 -1).
// 법선·번호를 32비트 실수 대신 8·16비트로 두면 꼭짓점 하나가 43바이트에서 30바이트로 줄어, 꼭짓점 177만 개의
// 그래픽 메모리(76MB→53MB)와 프레임마다 GPU가 읽는 양이 줄어듭니다. 내장 GPU는 시스템 메모리를 같이 쓰므로 효과가 있습니다.
// 셰이더의 'attribute float buildingIndex'는 정수 배열도 실수로 받습니다(vertexAttribPointer, 정규화 안 함).

export interface SlotBufferOptions {
  /** 꼭짓점 색(vertexColors 재질). 완성 재질(finishedMaterial)은 재질 색을 쓰므로 false */
  color: boolean
  /** 고리 묶음(group !== 'scene')의 건물 번호 */
  buildingIndex: boolean
  /** 편집기의 건물 클릭 판정 번호 */
  pickIndex: boolean
}

export interface VertexTags { building: number; pick: number }

/** 상자 UV를 실제 축척으로 늘일 때의 질감 한 장 크기(m). null이면 면마다 0~1 */
export type BoxUvTile = [tileWidth: number, tileHeight: number] | null

const INITIAL_CAPACITY = 1024

// 기둥·난간처럼 기울어 놓이는 막대는 끝면이 보일 수 있어 여섯 면을 모두 둡니다.
export const UNIT_BEAM = new THREE.BoxGeometry(1, 1, 1).toNonIndexed()
// 상자의 아랫면은 위에서 내려다보는 지도에서 보이지 않으므로 빼 둡니다(삼각형 1/6 절약).
// BoxGeometry의 면 순서는 +x, -x, +y, -y, +z, -z이고 면마다 꼭짓점 6개입니다.
export const UNIT_BOX = (() => {
  const full = new THREE.BoxGeometry(1, 1, 1).toNonIndexed()
  const keep = (attribute: THREE.BufferAttribute) => {
    const size = attribute.itemSize
    const array = attribute.array as Float32Array
    return new THREE.Float32BufferAttribute([...array.slice(0, 18 * size), ...array.slice(24 * size)], size)
  }
  const box = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv']) box.setAttribute(name, keep(full.getAttribute(name) as THREE.BufferAttribute))
  full.dispose()
  return box
})()
const BOX_POSITION = UNIT_BOX.getAttribute('position').array as Float32Array
const BOX_NORMAL = UNIT_BOX.getAttribute('normal').array as Float32Array
const BOX_UV = UNIT_BOX.getAttribute('uv').array as Float32Array
const BOX_VERTICES = UNIT_BOX.getAttribute('position').count
const BEAM_POSITION = UNIT_BEAM.getAttribute('position').array as Float32Array
const BEAM_NORMAL = UNIT_BEAM.getAttribute('normal').array as Float32Array
const BEAM_UV = UNIT_BEAM.getAttribute('uv').array as Float32Array
const BEAM_VERTICES = UNIT_BEAM.getAttribute('position').count

// 색(sRGB 16진수) → 선형 0~255. 같은 색을 수천 번 쓰므로 기억해 둡니다(예전 addGeometry의 THREE.Color 변환과 같음).
const colorCache = new globalThis.Map<number, [number, number, number]>()
export function colorBytes(hex: number): [number, number, number] {
  let bytes = colorCache.get(hex)
  if (!bytes) {
    const linear = new THREE.Color(hex)
    bytes = [Math.round(linear.r * 255), Math.round(linear.g * 255), Math.round(linear.b * 255)]
    colorCache.set(hex, bytes)
  }
  return bytes
}

const scratchMatrix = new THREE.Matrix4()
const scratchNormalMatrix = new THREE.Matrix3()
const scratchStart = new THREE.Vector3()
const scratchEnd = new THREE.Vector3()
const scratchDirection = new THREE.Vector3()
const scratchQuaternion = new THREE.Quaternion()
const UP = new THREE.Vector3(0, 1, 0)
const ONE = new THREE.Vector3(1, 1, 1)

export class SlotBuffer {
  count = 0
  private capacity = 0
  private position = new Float32Array(0)
  private normal = new Int8Array(0)
  private uv = new Float32Array(0)
  private color: Uint8Array | null = null
  private buildingIndex: Uint16Array | null = null
  private pickIndex: Int16Array | null = null

  constructor(readonly options: SlotBufferOptions) {
    this.allocate(INITIAL_CAPACITY)
  }

  private allocate(capacity: number) {
    const copy = <T extends Float32Array | Uint8Array | Int8Array | Uint16Array | Int16Array>(old: T, size: number, make: (length: number) => T) => {
      const next = make(capacity * size)
      if (this.count) next.set(old.subarray(0, this.count * size) as unknown as ArrayLike<number>)
      return next
    }
    this.position = copy(this.position, 3, (length) => new Float32Array(length))
    this.normal = copy(this.normal, 3, (length) => new Int8Array(length))
    this.uv = copy(this.uv, 2, (length) => new Float32Array(length))
    if (this.options.color) this.color = copy(this.color ?? new Uint8Array(0), 3, (length) => new Uint8Array(length))
    if (this.options.buildingIndex) this.buildingIndex = copy(this.buildingIndex ?? new Uint16Array(0), 1, (length) => new Uint16Array(length))
    if (this.options.pickIndex) this.pickIndex = copy(this.pickIndex ?? new Int16Array(0), 1, (length) => new Int16Array(length))
    this.capacity = capacity
  }

  private reserve(extra: number) {
    const needed = this.count + extra
    if (needed <= this.capacity) return
    let capacity = Math.max(this.capacity * 2, INITIAL_CAPACITY)
    while (capacity < needed) capacity *= 2
    this.allocate(capacity)
  }

  // start부터 count개 꼭짓점에 색·건물 번호·클릭 번호를 채웁니다.
  private tag(start: number, count: number, rgb: [number, number, number] | null, tags: VertexTags) {
    if (this.color && rgb) {
      const [r, g, b] = rgb
      for (let i = start * 3, end = (start + count) * 3; i < end; i += 3) { this.color[i] = r; this.color[i + 1] = g; this.color[i + 2] = b }
    }
    if (this.buildingIndex) this.buildingIndex.fill(tags.building, start, start + count)
    if (this.pickIndex) this.pickIndex.fill(tags.pick, start, start + count)
  }

  /**
   * 상자(아랫면 없음, 30 꼭짓점). 예전 boxGeometry와 같은 순서로 계산합니다: 단위 상자를 (width, height, depth)로 늘이고,
   * uvTile이 있으면 면별 UV를 실제 축척으로 바꾸고, y축으로 rotation만큼 돌린 뒤 (x, y, z)로 옮깁니다.
   * uvY: UV 세로 기준이 되는 높이(옮기기 전 y). 지형 건물은 position만 buildingBase만큼 더 올리므로 따로 받습니다.
   */
  appendBox(width: number, height: number, depth: number, x: number, y: number, z: number, rotation: number,
    uvTile: BoxUvTile, uvY: number, rgb: [number, number, number] | null, tags: VertexTags) {
    this.reserve(BOX_VERTICES)
    const start = this.count
    const c = Math.cos(rotation), s = Math.sin(rotation)
    const tileWidth = uvTile?.[0] ?? 0, tileHeight = uvTile?.[1] ?? 0
    for (let i = 0; i < BOX_VERTICES; i++) {
      const px = BOX_POSITION[i * 3] * width, py = BOX_POSITION[i * 3 + 1] * height, pz = BOX_POSITION[i * 3 + 2] * depth
      const nx = BOX_NORMAL[i * 3], ny = BOX_NORMAL[i * 3 + 1], nz = BOX_NORMAL[i * 3 + 2]
      const vertex = (start + i) * 3
      this.position[vertex] = px * c + pz * s + x
      this.position[vertex + 1] = py + y
      this.position[vertex + 2] = -px * s + pz * c + z
      this.normal[vertex] = Math.round((nx * c + nz * s) * 127)
      this.normal[vertex + 1] = Math.round(ny * 127)
      this.normal[vertex + 2] = Math.round((-nx * s + nz * c) * 127)
      let u = BOX_UV[i * 2], v = BOX_UV[i * 2 + 1]
      if (uvTile) {
        const side = Math.abs(nx) > 0.5, top = Math.abs(ny) > 0.5
        u = u * (side ? depth : width) / tileWidth
        v = v * (top ? depth : height) / tileHeight + (top ? 0 : (uvY - height / 2) / tileHeight)
      }
      this.uv[(start + i) * 2] = u
      this.uv[(start + i) * 2 + 1] = v
    }
    this.count += BOX_VERTICES
    this.tag(start, BOX_VERTICES, rgb, tags)
  }

  /** 막대(여섯 면, 36 꼭짓점). 예전 beam과 같이 (thickness, length, thickness)로 늘인 단위 상자를 from→to 방향으로 돌려 놓습니다. */
  appendBeam(from: [number, number, number], to: [number, number, number], thickness: number, rgb: [number, number, number] | null, tags: VertexTags) {
    scratchStart.set(from[0], from[1], from[2])
    scratchEnd.set(to[0], to[1], to[2])
    scratchDirection.copy(scratchEnd).sub(scratchStart)
    const length = scratchDirection.length()
    if (length < 0.04) return false
    scratchQuaternion.setFromUnitVectors(UP, scratchDirection.normalize())
    scratchMatrix.compose(scratchStart.add(scratchEnd).multiplyScalar(0.5), scratchQuaternion, ONE)
    scratchNormalMatrix.setFromMatrix4(scratchMatrix)
    const m = scratchMatrix.elements, n = scratchNormalMatrix.elements
    this.reserve(BEAM_VERTICES)
    const start = this.count
    for (let i = 0; i < BEAM_VERTICES; i++) {
      const px = BEAM_POSITION[i * 3] * thickness, py = BEAM_POSITION[i * 3 + 1] * length, pz = BEAM_POSITION[i * 3 + 2] * thickness
      const nx = BEAM_NORMAL[i * 3], ny = BEAM_NORMAL[i * 3 + 1], nz = BEAM_NORMAL[i * 3 + 2]
      const vertex = (start + i) * 3
      this.position[vertex] = m[0] * px + m[4] * py + m[8] * pz + m[12]
      this.position[vertex + 1] = m[1] * px + m[5] * py + m[9] * pz + m[13]
      this.position[vertex + 2] = m[2] * px + m[6] * py + m[10] * pz + m[14]
      // 회전만 있는 행렬이므로 법선은 그대로 돌리면 됩니다(길이 1 유지).
      this.normal[vertex] = Math.round((n[0] * nx + n[3] * ny + n[6] * nz) * 127)
      this.normal[vertex + 1] = Math.round((n[1] * nx + n[4] * ny + n[7] * nz) * 127)
      this.normal[vertex + 2] = Math.round((n[2] * nx + n[5] * ny + n[8] * nz) * 127)
      this.uv[(start + i) * 2] = BEAM_UV[i * 2]
      this.uv[(start + i) * 2 + 1] = BEAM_UV[i * 2 + 1]
    }
    this.count += BEAM_VERTICES
    this.tag(start, BEAM_VERTICES, rgb, tags)
    return true
  }

  /**
   * 삼각형 목록(펼친 꼭짓점). normals가 없으면 삼각형마다 면 법선을 계산합니다(예전 quad의 computeVertexNormals와 같음).
   */
  appendTriangles(positions: ArrayLike<number>, normals: ArrayLike<number> | null, uvs: ArrayLike<number>, rgb: [number, number, number] | null, tags: VertexTags) {
    const count = positions.length / 3
    this.reserve(count)
    const start = this.count
    this.position.set(positions, start * 3)
    this.uv.set(uvs, start * 2)
    if (normals) {
      for (let i = 0, limit = count * 3; i < limit; i++) this.normal[start * 3 + i] = Math.round(normals[i] * 127)
    } else {
      for (let i = 0; i < count; i += 3) {
        const a = i * 3, b = a + 3, c = a + 6
        const abx = positions[b] - positions[a], aby = positions[b + 1] - positions[a + 1], abz = positions[b + 2] - positions[a + 2]
        const acx = positions[c] - positions[a], acy = positions[c + 1] - positions[a + 1], acz = positions[c + 2] - positions[a + 2]
        let nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx
        const length = Math.hypot(nx, ny, nz) || 1
        nx /= length; ny /= length; nz /= length
        const bx = Math.round(nx * 127), by = Math.round(ny * 127), bz = Math.round(nz * 127)
        for (let k = 0; k < 3; k++) {
          const vertex = (start + i + k) * 3
          this.normal[vertex] = bx; this.normal[vertex + 1] = by; this.normal[vertex + 2] = bz
        }
      }
    }
    this.count += count
    this.tag(start, count, rgb, tags)
  }

  /**
   * 이미 만들어진 도형(지붕·도로 면·지형에 얹은 바닥 등)을 펼쳐서 덧붙입니다. 인덱스가 있으면 풀고, 법선이 없으면 계산하고,
   * uv가 없으면 0으로 둡니다. 도형에 color·buildingIndex·pickIndex 속성이 이미 있으면(합친 메시를 다시 합칠 때) 그대로 복사합니다.
   */
  appendGeometry(geometry: THREE.BufferGeometry, rgb: [number, number, number] | null, tags: VertexTags, from = 0, to?: number) {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
    const normal = geometry.getAttribute('normal') as THREE.BufferAttribute
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined
    const color = geometry.getAttribute('color') as THREE.BufferAttribute | undefined
    const building = geometry.getAttribute('buildingIndex') as THREE.BufferAttribute | undefined
    const pick = geometry.getAttribute('pickIndex') as THREE.BufferAttribute | undefined
    const index = geometry.getIndex()
    const total = index ? index.count : position.count
    const end = Math.min(to ?? total, total)
    const count = Math.max(0, end - from)
    if (!count) return
    this.reserve(count)
    const start = this.count
    // 속성은 모두 평범한 BufferAttribute(연속 배열)라 getX 대신 배열을 직접 읽습니다(큰 바닥 면은 꼭짓점이 수십만 개).
    const pa = position.array as ArrayLike<number>, na = normal.array as ArrayLike<number>
    const ua = uv?.array as ArrayLike<number> | undefined
    const ia = index?.array as ArrayLike<number> | undefined
    // 합친 메시를 다시 합칠 때는 이 버퍼가 만든 int8 법선을 그대로 복사하고, 실수 법선은 8비트로 줄입니다.
    const packedNormal = na instanceof Int8Array && normal.normalized
    const normalScale = packedNormal ? 1 : 127
    for (let i = 0; i < count; i++) {
      const source = ia ? ia[from + i] : from + i
      const vertex = (start + i) * 3, read = source * 3
      this.position[vertex] = pa[read]; this.position[vertex + 1] = pa[read + 1]; this.position[vertex + 2] = pa[read + 2]
      if (packedNormal) { this.normal[vertex] = na[read]; this.normal[vertex + 1] = na[read + 1]; this.normal[vertex + 2] = na[read + 2] }
      else {
        this.normal[vertex] = Math.round(na[read] * normalScale)
        this.normal[vertex + 1] = Math.round(na[read + 1] * normalScale)
        this.normal[vertex + 2] = Math.round(na[read + 2] * normalScale)
      }
      if (ua) { this.uv[(start + i) * 2] = ua[source * 2]; this.uv[(start + i) * 2 + 1] = ua[source * 2 + 1] }
      else { this.uv[(start + i) * 2] = 0; this.uv[(start + i) * 2 + 1] = 0 }
    }
    if (this.color && color) {
      // 합친 메시를 다시 합칠 때 지나는 길. 이 버퍼가 만든 uint8 색은 바이트를 그대로 복사하고, 다른 형식은 getX로 읽습니다.
      const ca = color.array
      const bytes = ca instanceof Uint8Array && color.normalized
      for (let i = 0; i < count; i++) {
        const source = ia ? ia[from + i] : from + i, vertex = (start + i) * 3, read = source * 3
        if (bytes) { this.color[vertex] = ca[read]; this.color[vertex + 1] = ca[read + 1]; this.color[vertex + 2] = ca[read + 2] }
        else {
          const scale = color.normalized ? 255 : 1
          this.color[vertex] = Math.round(color.getX(source) * scale)
          this.color[vertex + 1] = Math.round(color.getY(source) * scale)
          this.color[vertex + 2] = Math.round(color.getZ(source) * scale)
        }
      }
    }
    if (this.buildingIndex && building) {
      const ba = building.array as ArrayLike<number>
      for (let i = 0; i < count; i++) this.buildingIndex[start + i] = ba[ia ? ia[from + i] : from + i]
    }
    if (this.pickIndex && pick) {
      const ka = pick.array as ArrayLike<number>
      for (let i = 0; i < count; i++) this.pickIndex[start + i] = ka[ia ? ia[from + i] : from + i]
    }
    this.count += count
    // 도형에 없던 속성만 채웁니다(있던 것은 위에서 복사함).
    if (this.color && !color && rgb) {
      const [r, g, b] = rgb
      for (let i = start * 3, limit = (start + count) * 3; i < limit; i += 3) { this.color[i] = r; this.color[i + 1] = g; this.color[i + 2] = b }
    }
    if (this.buildingIndex && !building) this.buildingIndex.fill(tags.building, start, start + count)
    if (this.pickIndex && !pick) this.pickIndex.fill(tags.pick, start, start + count)
  }

  /** 모은 꼭짓점을 메시용 도형으로 잘라 내고 버퍼를 비웁니다. 비어 있으면 null. */
  toGeometry() {
    if (!this.count) return null
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position.slice(0, this.count * 3), 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(this.normal.slice(0, this.count * 3), 3, true))
    geometry.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, this.count * 2), 2))
    if (this.color) geometry.setAttribute('color', new THREE.BufferAttribute(this.color.slice(0, this.count * 3), 3, true))
    if (this.buildingIndex) geometry.setAttribute('buildingIndex', new THREE.BufferAttribute(this.buildingIndex.slice(0, this.count), 1))
    if (this.pickIndex) geometry.setAttribute('pickIndex', new THREE.BufferAttribute(this.pickIndex.slice(0, this.count), 1))
    // 큰 버퍼는 메시로 넘어갔으니 작은 크기로 다시 시작합니다(먼 동네를 나눠 만들 때 다시 커집니다).
    this.count = 0
    this.capacity = 0
    this.allocate(INITIAL_CAPACITY)
    return geometry
  }
}
