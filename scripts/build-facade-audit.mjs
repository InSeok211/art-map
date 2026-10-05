import fs from 'node:fs'

const source = fs.readFileSync('src/streetSceneData.ts', 'utf8')
const footprints = JSON.parse(fs.readFileSync('src/gamcheon-buildings.json', 'utf8')).features
function idsBetween(start, end) {
  return new Set([...source.slice(source.indexOf(start), source.indexOf(end)).matchAll(/^\s+(\d{10}):/gm)].map(match => Number(match[1])))
}
const roadview = idsBetween('const roadviewByFootprint', 'const conceptAppearance')
const video = idsBetween('const observedByFootprint', '// Kakao roadview')
const concept = idsBetween('const conceptByFootprint', '// The footprint order')
const addresses = {
  1468485967: { address: '감내1로175번길 68-4 (옥탑방)', reference: 'roadview-rooftop-cafe-reference.jpg', notes: '주소점과 저장 윤곽 중심 약 0.25m. 적갈색 벽돌, 흰 창살, 연녹색 문, 발코니 난간, 기단 청록·흰 장식 벽돌 확인. 높이·상층 창 치수·후면 추정; 화분·가스 계량기 미반영.' },
  1468352669: { address: '감내1로 260 (제2안내소) 인접 윤곽', reference: 'roadview-second-information-reference.jpg', notes: '장소 검색으로 안내소 이름·주소 확인. 청록 테라스 북쪽 흰 미장 단층·붉은 박공지붕·청록 문과 기단. 작은 저장 윤곽 대응 중간 신뢰도; 아치 창은 사각 개구부로 단순화, 후면·치수 추정.' },
  1468590570: { reference: 'roadview-261-reference.jpg', notes: '259/261 분홍 주택 남쪽 높은 주택. 연한 하늘색 미장, 불규칙한 창 배열, 상층 창살과 배수관. 인접 순서와 항공 윤곽 대응 중간 신뢰도; 주소·치수·후면 미확정.' },
  1468352670: { address: '감내1로 260 인접 윤곽', reference: 'roadview-260-reference.jpg', notes: '도로 아래 선명한 청록색 미장 주택, 옥상 테라스와 난간 확인. 주소 표식은 가까운 부속 윤곽에 위치해 대응 중간 신뢰도. 태양광 패널은 참고 화면에 보이지만 모델에는 미반영. 가려진 개구부·높이·부속채 경계 추정.' },
  1468277215: { address: '감내1로 259', reference: 'roadview-259-reference.jpg', notes: '주소 표식과 항공 윤곽을 대조. 분홍 미장 단층 주택, 짙은 기단과 처마, 흰 창틀 및 창살. 옹벽·지형 단차·후면·지붕 경사는 미확인.' },
  1468277211: { address: '감내1로 257', reference: 'roadview-257-reference.jpg', notes: '주소 표식과 항공 윤곽을 대조. 적벽돌 2층, 흰 창틀, 회색 출입문, 청록 옥상 띠. 주차장 너머 입면 확인; 옹벽·층고·후면 추정.' },
  1468352691: { address: '감내1로 237', reference: 'roadview-237-close-reference.jpg', notes: '주소판 확인. 연한 민트 수평 외장, 분홍 처마, 작은 상층 창과 하층 창살·오른쪽 문. 높이·후면 추정.' },
  1468352690: { reference: 'roadview-237-close-reference.jpg', notes: '237 옆 황토색 목간 건물. 하부 타일, 상부 큰 창, 옥상 난간. 주소 미확인·윤곽 대응 중간 신뢰도.' },
  1468110784: { address: '감내1로 239', reference: 'roadview-239-reference.jpg', notes: '짙은 갈색 수평 목재 외벽, 낮은 카페, 유리 출입구와 Cafe 간판. 지형 단차·후면 미확인.' },
  1468352652: { address: '감내1로243번길 3', reference: 'roadview-blue-house-reference.jpg', notes: '계단위푸른집 본체. 파란 외벽, 분홍 문, 큰 상층 창, 흰 구름 벽화와 옥상 난간. 본체 대응 중간 신뢰도; 옆 테라스 미반영.' },
  1468277196: { address: '감내1로 245 / 245-1', reference: 'roadview-245-reference.jpg', notes: '회색 타일·패널, 갈색 문, 흰 창살. 두 주소가 가까운 동일 저장 윤곽에 대응하므로 중복 생성하지 않음. 중간 신뢰도.' },
  1468277197: { address: '감내1로 249', reference: 'roadview-249-reference.jpg', notes: '짙은 적벽돌 주택, 흰 창틀, 녹색 차양과 창살. 주소·인접 윤곽 대응 중간 신뢰도; 옹벽 높이 미확인.' },
  1468277208: { address: '감내1로 251', reference: 'roadview-251-reference.jpg', notes: '주소판 확인. 붉은 벽돌, 밝은 창틀, 오른쪽 창살 출입문. 보이는 창 배치 반영; 계단·후면 미확인.' },
  1468277207: { address: '감내1로 253', reference: 'roadview-253-reference.jpg', notes: '회분홍 수평 패널, 큰 흰 창살과 출입문. 가까운 작은 윤곽과 경계 모호하여 중간 신뢰도.' },
  1468277209: { address: '감내1로 255', reference: 'roadview-255-reference.jpg', notes: '적벽돌, 넓은 상층 유리 발코니, 청록 띠, 붉은 경사 지붕. 지붕 높이와 숨은 면 추정.' },
  1468277210: { reference: 'roadview-255-reference.jpg', notes: '253·255 사이 회색 타일 주택. 3개 층의 흰 창살·창틀과 하부 적벽돌 띠. 주소 미확인·인접 윤곽 대응 중간 신뢰도.' },
  1468352676: { address: '감내1로 228', reference: 'roadview-228-reference.jpg', notes: '적벽돌, 흰 창살, 청록 수평띠, 하부 분홍 담장. 인접 윤곽 대응 중간 신뢰도; 치수·후면 미확인.' },
  1468352662: { address: '감내1로 230', reference: 'roadview-230-reference.jpg', notes: '분홍 외벽, 청록 수평띠, 흰 창틀과 난간. 인접 윤곽 대응 중간 신뢰도; 높이·후면 미확인.' },
  1468110796: { address: '감내1로 231', reference: 'roadview-231-reference.jpg', notes: '낮은 연두색 주택, 파란 지붕 가장자리, 흰 창살. 지붕 전체 경사·후면 미확인.' },
  1468352689: { address: '감내1로 234', reference: 'roadview-231-reference.jpg', notes: '우리누리 지역아동센터. 밝은 베이지 외벽, 흰 창살·난간, 붉은 간판. 층고·후면 미확인.' },
  1468590613: { address: '감내1로 190', reference: 'roadview-190-reference.jpg', notes: '흰 수평 외장, 회색 셔터, 파란 차양. 높이 추정, 후면 미확인.' },
  1468590605: { address: '감내1로 200', reference: 'roadview-200-reference.jpg', notes: '하부 분홍·베이지 타일, 상부 밝은 회색, 가로 창 배열. 층고 추정, 후면 미확인.' },
  1468485969: { address: '감내1로 219', reference: 'roadview-220-reference.jpg', notes: '부산유리. 청회색 타일, 황토색 수평띠, 파란 간판, 유리 출입구. 후면 미확인.' },
  // 2026-09-30 공방 주변 추가 대조(참고 화면은 저장하지 않음)
  1468551457: { notes: '예루살렘성교회로 추정(지도 표기 인접). 한 층 높이의 긴 적벽돌, 벽돌 처마의 지그재그 무늬, 가로 창 띠, 회청색 셔터. 북쪽 끝 2층·옥상 십자가는 단일 높이로 단순화. 중간 신뢰도.' },
  1468551348: { notes: 'DUF COFFEE. 흰 미장 단층 카페, 메모·포스터가 붙은 정면, 어두운 나무 문. 중간 신뢰도.' },
  1468590688: { notes: '주소판 66. 1층 흰 칠 벽돌과 나무틀 유리문 두 개, 상층 적벽돌·큰 창. 층수 추정, 중간 신뢰도.' },
  1469906501: { notes: '선명한 청록 칠 벽돌 2층 주택, 흰 장식 문 두 개, 창살 창, 짙은 회색 타일 기단.' },
  1469906598: { notes: '주소판 157과 남쪽 이웃(회색 롤셔터 두 칸)이 한 저장 윤곽에 포함. 짙은 적벽돌, 창살 문·창. 개구부 좌우 배치 추정, 중간 신뢰도.' },
  1468485984: { address: '감내1로 210', notes: '주소판 확인. 연두·노랑 미장 상점, 짙은 갈색 차양, 창살 창. 윤곽 대응 중간 신뢰도.' },
  1468485981: { notes: '210 북쪽 계단 옆. 연한 살구·베이지 미장, 흰 난간 창, 위층 녹색 사이딩. 중간 신뢰도.' },
  1468485990: { notes: "'현대연탄 가스' 간판 문 옆. 연분홍 베이지 단층, 두꺼운 콘크리트 처마. 중간 신뢰도." },
  1468485974: { address: '감내1로 216', notes: '주소판 확인. 크림색 미장, 회색 알루미늄 유리 양문, 창살 창, 콘크리트 처마.' },
  1468485978: { notes: '적갈색 벽돌, 흰 창살 창, 기단 청록·흰 포인트 타일, 위층 난간. 중간 신뢰도.' },
  1469906524: { notes: '연녹색 칠 벽돌, 1·2층 창살 창. 중간 신뢰도.' },
  1469906525: { notes: '짙은 적벽돌(백화 얼룩), 반지하·1층 창살 창. 남서쪽 도로 정면. 중간 신뢰도.' },
  1469906528: { notes: '주소판 150. 짙은 적갈색 벽돌, 1층 회색 화강석과 방범 셔터 창 두 칸.' },
  1469906529: { notes: '주황·적색 혼합 벽돌, 창살 창과 검은 방범문, 위층 장식 창살. 중간 신뢰도.' },
  1468485985: { notes: '210 남쪽. 벗겨진 연두색 미장, 앞쪽 낮은 부속채와 뒤쪽 3층 몸채의 작은 창 열. 중간 신뢰도.' },
  1468352683: { notes: '220 부근 동쪽. 물고기 그림 석축과 스테인리스 난간 위 연민트 미장 주택. 석축 높이 추정, 중간 신뢰도.' },
  1468352684: { address: '감내1로 220', notes: '이전에 석축만 확인했던 윤곽. 석축 위 연한 청회색 미장 건물. 하부·후면 미확인, 중간 신뢰도.' },
  1467907462: { notes: '감천문화마을 중심 거리. 파란 칠 벽돌 2층, 위층 큰 창 두 개, 1층 엽서 가게(남색 차양)·휴대폰 케이스 가게(분홍 차양). 두 가게를 한 윤곽에 표현, 중간 신뢰도.' },
  1467907463: { notes: '주소판 127. BUSAN BADA SAND HILLS 카페. 연보라 회색 타일, 파란 띠·간판, 폴딩 유리창, 위층 유리 개방부·난간.' },
  1467907509: { notes: '뷰티풀 캣 캐리커쳐. 보라 간판·차양, 크림색 위층, 옥상 흰 난간. 중간 신뢰도.' },
  1467910232: { notes: '어린왕자 포토존 위 분홍 단층 주택. 벽화 옹벽 위 테라스, 붉은 틀 창, 사람·고양이 그림. 옹벽 높이 추정.' },
  1467907430: { notes: '거리 아래 주차장 쪽 면. 비눗방울 벽화 흰 옹벽 위 크림색 미장 상점, 짙은 나무 창틀. 정면(거리 쪽)은 미확인, 중간 신뢰도.' },
  1468352626: { notes: '적벽돌 2층 기념품 가게, 짙은 빨강 차양, 위층 검은 틀 폴딩창. 중간 신뢰도.' },
  1468352618: { notes: '분홍 벽과 흰 나무 사이딩, 옥상 녹색 테라스 난간. 중간 신뢰도.' },
  1468352713: { notes: '갈색 싱글 박공지붕의 작은 목조 상점, 나무틀 유리창. 중간 신뢰도.' },
  1467910240: { notes: '간식 가게. 빨간 차양·깃발, 검은 간판 띠, 위층 유리창 열. 인접 소형 윤곽과 대응 중간 신뢰도.' },
  1467910242: { notes: '어두운 박공 차양의 주스 가판점, FRESH JUICE 간판. 중간 신뢰도.' },
  1468590644: { address: '옥천로101번길 23 (꿈꾸는작업실)', notes: '작가님 공방. 카카오 장소 좌표·로드뷰(pano 1202733209)로 확인. OSM 띠 윤곽을 로드뷰에서 잰 4m×3.7m로 나누고 전용 모델로 표현: 쪼갠면 혼합 벽돌, 모서리를 감싸는 돌출 통창(골목 쪽 세 칸, 갈림길 쪽 한 칸), 흰 양문과 계단참, 옥상 갓돌과 스테인리스 난간.' },
  1468590633: { notes: '공방 서쪽 갈림길 모서리의 분홍 주택. 연어색 미장 2층, 붉은 금속 모임지붕, 위층 4칸 창, LG 실외기, 1층 유리 미닫이문. 사진 시안에서 로드뷰 대조로 전환.' },
}
// streetSceneData.ts의 inferNearbyFacades와 같은 조건(공방에서 반경 이내, 확인·시안 건물 제외)입니다.
const inferredRadius = Number(source.match(/INFERRED_RADIUS_METERS = (\d+)/)[1])
const workshop = [129.00930268855, 35.095522407839]
const metersFromWorkshop = ([lng, lat]) => Math.hypot((lng - workshop[0]) * 111320 * Math.cos(workshop[1] * Math.PI / 180), (lat - workshop[1]) * 111320)
const rows = footprints.map(feature => {
  const id = feature.properties.id
  const ring = feature.geometry.coordinates[0].slice(0, -1)
  const center = [0, 1].map(axis => ring.reduce((sum, p) => sum + p[axis], 0) / ring.length)
  const distance = metersFromWorkshop(center)
  const scale = [111320 * Math.cos(workshop[1] * Math.PI / 180), 111320]
  const area = Math.abs(ring.reduce((sum, p, index) => {
    const next = ring[(index + 1) % ring.length]
    return sum + p[0] * scale[0] * next[1] * scale[1] - next[0] * scale[0] * p[1] * scale[1]
  }, 0) / 2)
  const status = roadview.has(id) ? 'roadview-visible-face' : video.has(id) ? 'video-provisional-match' : concept.has(id) ? 'photo-concept'
    : area >= 8 && distance >= 12 && distance <= inferredRadius && id !== 1469906540 ? 'inferred-from-neighbors' : 'pending'
  return { id, center, status, ...addresses[id],
    unseenFaces: 'not-verified', source: roadview.has(id) ? 'Kakao roadview 2025-11' : video.has(id) ? 'user video' : concept.has(id) ? 'user photo / design concept' : null }
})
const counts = Object.fromEntries(['roadview-visible-face', 'video-provisional-match', 'photo-concept', 'inferred-from-neighbors', 'pending'].map(status => [status, rows.filter(row => row.status === status).length]))
const audit = { updated: '2026-10-01', scope: 'all stored footprints; includes unrendered or outside-boundary features', total: rows.length, counts,
  limitations: ['Roof colours of unsurveyed buildings come from a generic design palette.', 'Roadview verifies visible faces only; heights remain estimated.', 'Video correspondence is provisional.', 'Inferred-from-neighbors borrows material and colour from nearby verified buildings; it is not an observation.', 'Pending means no exterior comparison has been completed.'], buildings: rows }
fs.writeFileSync('design/facade-audit.json', JSON.stringify(audit, null, 2))
const payload = JSON.stringify(audit).replaceAll('<', '\\u003c')
fs.writeFileSync('design/facade-audit.html', `<!doctype html><html lang="ko"><meta charset="utf-8"><title>전체 건물 외벽 대조 현황</title><style>body{font:15px system-ui;margin:32px;background:#f6f8fa;color:#24313e}h1{font-size:26px}input,select{padding:10px;margin-right:12px}table{width:100%;border-collapse:collapse;background:white}td,th{padding:10px;text-align:left;border-bottom:1px solid #ddd}a{color:#236eae}.summary{padding:20px;background:white;margin-bottom:20px;line-height:1.8}small{color:#586572}</style><h1>전체 건물 외벽 대조 현황</h1><div class="summary" id="summary"></div><p><input id="search" placeholder="주소 또는 건물 ID 검색"><select id="status"><option value="">모든 상태</option><option value="pending">외벽 미대조</option><option value="roadview-visible-face">로드뷰에서 보이는 면 대조</option><option value="video-provisional-match">영상 잠정 대응</option><option value="photo-concept">사진 기반 시안</option><option value="inferred-from-neighbors">주변 기반 추정</option></select></p><table><thead><tr><th>건물 ID / 위치</th><th>주소</th><th>외벽 상태</th><th>관찰 내용</th><th>참고 화면</th></tr></thead><tbody id="rows"></tbody></table><script>const data=${payload};const labels={'pending':'외벽 미대조','roadview-visible-face':'보이는 면 대조 · 후면 미확인','video-provisional-match':'영상 잠정 대응','photo-concept':'사진 기반 시안','inferred-from-neighbors':'주변 확인 건물 기반 추정 · 실제 미확인'};const summary=document.getElementById('summary');summary.textContent='전체 윤곽 '+data.total+'동 · 로드뷰 '+data.counts['roadview-visible-face']+'동 · 영상 잠정 대응 '+data.counts['video-provisional-match']+'동 · 사진 시안 '+data.counts['photo-concept']+'동 · 주변 기반 추정 '+data.counts['inferred-from-neighbors']+'동 · 외벽 미대조 '+data.counts.pending+'동. 지붕색 확인은 외벽 확인에 포함하지 않습니다. 전체 저장 윤곽 기준이므로 화면 밖·미표시 윤곽도 포함됩니다.';function render(){const q=document.getElementById('search').value;const s=document.getElementById('status').value;const body=document.getElementById('rows');body.replaceChildren();for(const r of data.buildings.filter(r=>(!s||r.status===s)&&(!q||(r.address||'').includes(q)||String(r.id).includes(q)))){const tr=document.createElement('tr');const first=document.createElement('td');const a=document.createElement('a');a.href='https://map.kakao.com/?q='+encodeURIComponent(r.address?'부산 사하구 '+r.address:r.center[1]+','+r.center[0]);a.textContent=r.id;first.append(a);const model=document.createElement('a');model.href='../?building='+r.id;model.textContent='지도 모델';model.style.display='block';first.append(model);tr.append(first);for(const value of [r.address||'주소 미확인',labels[r.status],r.notes||'보이지 않는 면·재질·층고 미확인']){const td=document.createElement('td');td.textContent=value;tr.append(td)}const td=document.createElement('td');if(r.reference){const a=document.createElement('a');a.href=r.reference;a.textContent='로드뷰 화면';td.append(a)}tr.append(td);body.append(tr)}}document.getElementById('search').oninput=render;document.getElementById('status').onchange=render;render();</script></html>`)
console.log(JSON.stringify({ total: audit.total, counts }))
