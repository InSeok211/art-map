# 감천 골목지도

감천2동 골목을 3D로 보여 주는 지도 앱입니다. 공개 지도(`/`)와 관리자 편집 앱(`/studio/`), 지도 데이터 API(`/api/`)를 한 서버(Cloudflare Worker)에서 제공합니다. 감천 작가 지도 홈페이지는 공개 지도를 화면에 끼워 쓰고 승인된 작가 위치를 넘겨줍니다.

## 프로젝트 안내 문서

- [파일 구조·정리 기준·이동 내역](docs/PROJECT_STRUCTURE.md)
- [수정 위치·실행 방법·홈페이지 반영·인수인계 설명](docs/MAINTENANCE_GUIDE.md)
- [로컬 편집기: 선택·배치·고도·실행 취소·백업·서버 공개](docs/LOCAL_EDITOR_GUIDE.md)
- [최신 커밋 통합: 포함·제외·보류 기능 결정](docs/FEATURE_INTEGRATION.md)

이 저장소는 지도 원본입니다. 상위 `실서버_배포본_20261001/`의 `worker/`·`static/`는 과거 홈페이지 배포본입니다.

## 개발 및 확인

```bash
npm install --legacy-peer-deps
npm run dev
```

`npm run dev`는 화면만 띄우는 미리보기입니다(서버 없음). 공개 지도는 `http://127.0.0.1:5173/`, 편집 앱은 `/studio/`이며, 미리보기의 편집 앱은 로그인 없이 이 브라우저에만 저장합니다. 개발 서버의 공개 지도는 같은 브라우저의 확정한 건물 공개본·현재 골목·사용자 모델을 읽습니다. Worker로 빌드하면 localhost에서도 서버 API를 사용합니다.

## 지도 앱 서버

| 위치 | 내용 |
|---|---|
| `/` (`index.html`, `src/embed.tsx`) | 공개 지도. 홈페이지가 iframe으로 끼우면 홈페이지가 보낸 장소를 표시. 브라우저에서 바로 열면 편집 앱(`/studio/`)으로 이동하고, `/?view=public`으로 열면 장소 목록·길찾기 패널까지 있는 전체 공개 지도 |
| `/studio/` (`studio/index.html`, `src/studio.tsx`) | 편집 앱. 관리자로 로그인해 골목길·건물을 고치고 공개 |
| `/api/` (`server/`) | 지도 데이터 API. `/api/map-alleys`·`/api/map-buildings`·`/api/map-models/<번호>`는 누구나 읽고, `/api/admin/...`는 로그인한 관리자만 씀 |
| `migrations/` | 데이터베이스(D1) 표 |

```bash
npm run admin:password -- --local   # 내 PC 확인용 관리자 아이디·비밀번호(.dev.vars, git에 올라가지 않음)
npm run app:local                    # 빌드 → 내 PC 데이터베이스 준비 → http://127.0.0.1:8788
npm run admin:password               # 배포한 서버에 관리자 로그인 설정(비밀번호는 해시로만 저장)
npm run app:deploy                   # 빌드 → 데이터베이스 표 맞추기 → 배포
```

- 관리자 로그인: 비밀번호는 PBKDF2 해시로만 비밀값(`ADMIN_PASSWORD_HASH`)에 두고, 로그인하면 서명한 쿠키(HttpOnly·Secure·SameSite=Strict, 8시간)를 줍니다. 같은 곳에서 15분 안에 5번 틀리면 15분 동안 막습니다. 값을 바꾸는 요청은 이 앱 화면에서 온 것만 받습니다.
- 홈페이지 연결: 공개 지도는 `src/embed.tsx`의 `HOST_ORIGINS` 주소에서 온 메시지만 받고 그 주소로만 보냅니다. 화면에 끼워 넣을 수 있는 주소는 `public/_headers`의 `frame-ancestors`로 같게 정합니다. 편집 앱은 다른 사이트에 끼워 넣을 수 없습니다.
  - 홈페이지 → 지도: `{ source: 'gamcheon-artist-host', type: 'set', places, selectedId, canPick }`
  - 지도 → 홈페이지: `{ source: 'gamcheon-artist-map', type: 'ready' | 'select' | 'pick', ... }`
- 오픈소스 라이선스 전문은 빌드할 때 `third-party-notices.txt`로 함께 나갑니다.

```bash
npm test
npm run build
```

`npm run build`는 다른 React 웹에서 사용할 수 있는 ES 모듈, CSS, 타입 선언, 기본 GLB 에셋을 `dist/`에 만듭니다. `dist/assets/models/` 디렉터리를 JS 파일과 함께 배포해야 그린하우스·아름다운한글 모델이 표시됩니다.

## 기존 React 웹에 연결

라이브러리 빌드 결과를 기존 웹의 패키지로 설치하거나 `src/`를 기존 프로젝트에 옮겨 사용할 수 있습니다. 컴포넌트를 담는 영역에 높이를 지정하세요.

```tsx
import { useState } from 'react'
import { GamcheonMap, type Place } from 'gamcheon-map'
import 'gamcheon-map/style.css'

const initialPlaces: Place[] = [
  {
    id: 'unique-place-id',
    name: '장소 이름',
    category: 'attraction', // 'attraction' 또는 'shop'
    latitude: 35.0975,
    longitude: 129.0103,
    address: '주소',
    description: '짧은 설명',
  },
]

export function MapSection() {
  const [places, setPlaces] = useState(initialPlaces)

  return (
    <div style={{ height: 650 }}>
      <GamcheonMap
        places={places}
        editable
        onPlacesChange={setPlaces}
        onPlaceSelect={(place) => console.log(place)}
      />
    </div>
  )
}
```

`places`가 비어 있으면 빈 상태가 표시됩니다. 표시된 사각형 영역 밖의 장소는 목록과 지도에서 숨깁니다. 검색은 이름·주소·설명을 대상으로 하며, 분류 버튼은 가게와 명소를 구분합니다. `editable`을 켜면 장소 추가·수정·삭제가 가능하고, 위치는 사각형 영역 안쪽의 지도를 클릭해 정합니다. 저장 결과는 `onPlacesChange`로 전달되므로 기존 웹의 서버나 데이터 저장소에 연결할 수 있습니다. 미리보기 화면에서는 브라우저의 로컬 저장소에 자동 저장됩니다.

## 건물 고치기(관리자 작업실)

편집 앱의 **건물** 탭입니다(`editable`과 `buildingEditor`를 넘기면 생김). 지도 바닥의 건물 윤곽을 눌러 층수·벽 색·지붕 색·지붕 모양을 바꾸거나 숨기고, **새 건물 그리기**로 윤곽을 찍어 건물을 더하고, 올린 GLB 모델로 건물을 바꿀 수 있습니다. 고친 내용은 초안에만 저장되고 **공개하기**를 눌러야 공개 지도(`buildingEdits`)에 나타납니다. 편집 앱은 지도 앱 서버의 데이터베이스와 파일 저장소(R2)를, 개발 미리보기는 이 브라우저(로컬 저장소·IndexedDB)를 씁니다.

GLB는 텍스처를 포함한 glTF 2.0 바이너리 한 파일, 20MB 이하만 받습니다(`src/buildings/glbCheck.ts`). 다른 주소를 불러오는 파일과 Draco·meshopt·Basis 압축 파일은 받지 않습니다. 직접 만들었거나 쓸 권리가 있는 모델만 올려 주세요.

예전의 **3D 배치** 탭(둥근형·각진형 샘플과 브라우저에만 저장하던 GLB 배치, `models`·`onModelsChange`)은 건물 탭으로 대신해 뺐습니다.

## 파일 구조

| 위치 | 내용 |
|---|---|
| `src/GamcheonMap.tsx`, `src/gamcheon-map.css` | 지도 컴포넌트(패널·탭·지도 층 연결) |
| `src/embed.tsx`, `src/studio.tsx` | 공개 지도, 편집 앱 |
| `server/`, `migrations/`, `wrangler.jsonc` | 지도 앱 서버(API·로그인), 데이터베이스 표, 서버 설정 |
| `src/map/` | 지도 스타일, 감천 범위, 좌표 변환, 지형, 내 위치, 휴대폰 화면 |
| `src/places/` | 장소 목록·편집, 작가님 공방 장소 |
| `src/route/` | 길찾기 |
| `src/alleys/` | 골목길 그리기, GPS 기록으로 골목길 찾기, GPX 가져오기 |
| `src/buildings/` | 관리자 건물 고치기(고친 내용 형식, 저장소, 패널, 모델 파일) |
| `src/scene/` | 3D 거리 장면(`StreetSceneLayer.ts`)과 건물·도로 데이터, 바닥 도형, 모델 파일·올린 모델 배치, 경로 선 |
| `src/scene/terrain/` | 지형 전용 건물 기준 층·경사 벽·기초 계산과 관련 검사 |
| `src/data/` | OSM 건물·도로, 감천2동 경계, 기록한 골목길, 바탕 지도 스타일 원본 |
| `src/generated/` | `npm run build:road-ground`·`build:terrain`이 미리 계산한 저장본 |
| `src/assets/models/` | 직접 만든 GLB 모델 |
| `previews/` | 그린하우스·아름다운한글 단독 모델 미리보기 HTML |
| `scripts/` | 데이터 수집·변환, 사전 계산, 모델 제작, 홈페이지 내보내기 |
| `design/` | 도면·OSM XML·외관 조사·시안 근거와 조사 보고서 |
| `docs/` | 파일 분류 기준과 프로젝트 관리 설명 |

### 평지와 3D 지형 생성

평지는 기존 상세 건물 생성 경로를 사용합니다. 3D 지형에서는 일반 건물을 `StreetSceneLayer.ts`의 `buildTerrainBuilding()`과 `src/scene/terrain/terrainBuildingGeometry.ts`로 생성합니다. 도로 쪽 지면에 기준 층을 두고, 벽 밑단은 지형을 따르며, 층과 지붕은 수평을 유지합니다. 현재 3D 일반 건물의 외관은 지형 배치를 확인하기 위한 단순화 시안입니다. 아래 촬영 거리 상세 외관 설명은 기존 평지 표현에 해당합니다.

전용 GLB와 작가님 공방은 기존 외관 모델을 지면 기준으로 배치하고, 낮은 쪽을 기초로 연결합니다. 평지와 3D는 생성 도형이 다르지만 건물 위치·색·높이와 편집 저장 데이터는 공유합니다. 세부 구조와 한계는 [파일 구조 문서](docs/PROJECT_STRUCTURE.md#5-평지와-3d-지형의-관계)에 기록했습니다.

### 단독 모델 미리보기

개발 서버를 실행한 뒤 다음 주소에서 확인합니다.

- 그린하우스: `http://127.0.0.1:5173/previews/greenhouse-preview.html`
- 아름다운한글: `http://127.0.0.1:5173/previews/beautiful-hangul-preview.html`

### 작가님 공방 모델

작가님 공방은 카카오맵 장소 **꿈꾸는작업실(부산 사하구 옥천로101번길 23, 감천동 12-299)**입니다. 거리 장면이 이 건물을 전용 모델(`src/scene/artistWorkshopModel.ts`)로 직접 그립니다. 모델은 2025년 11월 장소 로드뷰를 기준으로 했고, 반영한 요소는 다음과 같습니다.

- 연한 베이지·회갈색 쪼갠면 벽돌
- 모서리를 감싸며 돌출된 알루미늄 통창: 골목 쪽 세 칸, 갈림길 쪽 한 칸
- 흰 양문과 문 위 등, 도로명 주소판, 콘크리트 계단참
- 옥상 테라스의 갓돌과 스테인리스 난간
- 통창 너머로 보이는 작업실 실내: 선반의 미술 재료, 벽에 건 캔버스, 작업대, 로드뷰에서 보이는 둥근 필름 릴 장식, 펜던트 조명(실내 배치는 추정)
- 골목 쪽 벽 끝의 빗물받이 관

지도에서 공방을 바로 찾을 수 있도록, 장소 표식은 "작가님 공방" 이름표가 달린 큰 표식으로 그리고 건물 둘레 바닥에 주황색 강조 띠를 둘렀습니다. 강조 띠는 지도 표시이며 실제 시설이 아닙니다.

지도 오른쪽 위 도구의 **작가님 공방만 보기** 버튼을 누르면 공방을 뺀 3D 건물을 모두 숨깁니다. 도로·바닥·나무·전신주와 장소 표식은 그대로 보이고, 숨긴 건물의 그림자도 함께 빠집니다. 한 번 더 누르면 다시 보입니다.

OSM 윤곽(1468590644)은 골목을 따라 9.5m×2.2m 띠로 그려져 있어 로드뷰에서 잰 크기(골목 쪽 약 4m, 갈림길 쪽 약 3.7m)로 나누었습니다. 띠의 나머지는 별도 부속 건물로 남겼습니다(`src/scene/streetSceneData.ts`의 `splitWorkshopFootprint`). 높이와 보이지 않는 남쪽·동쪽 벽은 추정치입니다. `src/assets/models/custom/artist-workshop-180.glb`는 예전 GLB 시안으로, 지금 지도에서는 쓰지 않습니다(`scripts/build-artist-workshop.mjs`로 다시 만들 수 있음).

장소 검색에도 공방을 표시하려면 패키지에서 `ARTIST_WORKSHOP_PLACE`를 가져와 `places`에 추가하세요.

### 길찾기

패널의 **길찾기** 탭에서 걸어서 가는 길을 찾습니다. 보기 전용 지도에서도 쓸 수 있습니다.

- 출발지는 내 위치(GPS), 장소 목록, 지도에서 고른 곳 중에서 고릅니다. 도착지는 기본으로 작가님 공방입니다.
- 길 그물망은 OSM의 도로·골목·보도·계단 중심선(`src/data/street-surfaces.json`)과 직접 그린 골목길로 만듭니다(`src/route/routing.ts`). 화면용으로 위치를 보정한 도로가 아니라 OSM 원본을 씁니다.
- 걷는 속도는 평지 1.1m/s, 계단 0.55m/s로 잡았습니다. **계단 피하기**를 켜면 계단 없는 길만 찾습니다. 고도 자료가 없어 경사는 반영하지 않습니다.
- 지도를 열면 바로 내 위치(파란 점)와 바라보는 방향(화살표)을 보여 주고, 지도를 닫으면 추적을 멈춥니다. 방향은 휴대폰 나침반을 먼저 쓰고(iOS는 화면을 한 번 누를 때 권한을 물음), 없으면 걸어온 방향을 씁니다. 화살표는 매 프레임 부드럽게 돌아갑니다. 지도 도구의 **내 위치로 이동** 버튼으로 언제든 내 위치로 갈 수 있습니다. 위치는 화면에만 쓰고 저장하거나 보내지 않습니다. 경로에서 25m 넘게 벗어나면 현재 위치에서 다시 찾고, 목적지 15m 안에 들어오면 도착을 알립니다.
- 위치 기능은 HTTPS(또는 localhost)에서만 동작합니다. 권한이 거부되거나 위치가 지도 밖이면 장소·지도에서 출발지를 고르도록 안내합니다.

### 성능

- 도로·보도 면(수천 개의 도로 조각을 합치고 건물 자리를 빼는 계산)은 `npm run build:road-ground`로 미리 계산해 `src/generated/road-ground.json`에 저장합니다. 지도 자료(`src/data/gamcheon-buildings.json`, `src/data/street-surfaces.json`)나 도로·건물 계산 코드를 고치면 이 명령을 다시 실행하세요. 입력이 바뀌었는데 저장본이 그대로면 `src/scene/roadGround.test.ts`가 실패해 알려 줍니다.
- 바탕 지도를 먼저 그린 뒤 3D 거리를 만들고, 그동안 "3D 거리를 불러오는 중" 안내를 보여 줍니다. 거리에서 75m 넘게 떨어진 건물은 지도에 붙은 뒤 12ms 단위로 나눠 만들어 화면이 멈추지 않게 합니다.
- 측정값(개발 PC): 첫 화면을 막는 장면 만들기 시간이 Node에서 17.6초 → 3.5초, 브라우저에서 약 2.2초입니다. 먼 동네 건물은 그 뒤 약 2.8초에 걸쳐 나눠 채워집니다. 브라우저에서는 `performance.getEntriesByName('gamcheon-map:street-scene-build')`와 `'gamcheon-map:district-build'`로 확인할 수 있습니다.
- 성능 예산: `src/scene/streetScenePerformance.test.ts`가 첫 화면 장면 만들기를 9초 안으로 묶어 큰 퇴보를 잡습니다.
- 휴대폰에서 그래픽(WebGL) 연결이 끊기면 안내를 띄우고, 다시 연결되면 3D 층을 자동으로 붙입니다.

### 촬영 거리 3D 장면

첫 화면과 오른쪽 위 **촬영 거리 보기**는 카페아뽕 인근에서 작가님 공방까지의 약 130m 구간을 기울인 시점으로 보여줍니다. 이는 이동 경로 안내가 아니라 지도 위 거리 장면입니다. 도로의 위치와 굽은 형태는 OSM의 옥천로75번길·감내1로 노드(`src/scene/streetSceneData.ts`)를, 양옆 건물 위치와 외곽은 저장된 OSM 건물 윤곽(`src/data/gamcheon-buildings.json`)을 사용합니다. 사용자가 제공한 2026년 9월 촬영 영상을 따라 남쪽의 붉은 벽돌·크림색 상가, 중간의 청록·하늘색 외벽, 북쪽 굽은 길의 녹색·분홍색 건물이 나타나도록 구간별 외관을 다르게 표현했습니다. 회청색 블록 포장, 노란 가장자리 선, 원형 포장 무늬, 일부 주차 차량과 전신주도 간략한 3D 형태로 표현했습니다. 공방은 거리 장면 안의 전용 모델로 표시합니다.

거리 건물에는 영상에서 보이는 평지붕과 일부 경사지붕, 유리 상점 전면·셔터·줄무늬 차양·벽돌 줄눈을 단순화해 적용했습니다. 공방과 시각적 밀도를 맞추기 위해 창틀·창턱·출입문·손잡이·건물 기단·층간 띠·옥상 설비와 일부 난간도 더했습니다. 조감도의 에스컬레이터나 새 건축물은 실제 촬영 거리의 현황으로 확인되지 않아 배치하지 않았습니다. 건물 높이와 촬영되지 않은 면은 실측값이 없어 추정치입니다. `src/scene/streetSceneData.ts`에서 건물별 색과 높이 규칙을, `src/scene/StreetSceneLayer.ts`에서 창·차양·포장 표현을 수정할 수 있습니다. 장소 정보는 지도에서 직접 편집하고, 개별 건물의 높이·색·지붕은 관리자 작업실의 건물 탭에서 고칠 수 있습니다.

촬영 영상에서 외관을 식별할 수 있는 추가 건물 19동은 OSM 건물 ID별로 외벽색, 1층 유리창·셔터, 차양, 상층 창 배열을 지정했습니다. 적용한 프레임과 확인 범위는 [`design/building-observation-log.md`](design/building-observation-log.md)에 기록했습니다. 영상에 GPS가 없으므로 프레임과 각 OSM 건물의 대응은 잠정적이며, 영상에서 보이지 않는 나머지 건물은 여전히 구역별 추정 모델입니다.

조사하지 않은 건물의 지붕은 감천 산비탈 마을에 흔한 청색·청록·녹색 칠 금속 지붕과 회색 슬래브 지붕을 섞은 일반형 디자인 팔레트(`src/scene/streetSceneData.ts`의 `genericRoof`)로 칠합니다. 항공사진 등 건물별 자료에서 얻은 색이 아니며, OSM 번호로 골라 건물마다 늘 같은 색이 됩니다. 사진 시안 6동과 현장 사진으로 확인한 카페아봉은 기존 지붕색을 유지합니다. 맞붙은 벽에는 창문을 생략했습니다. 로드뷰로 확인하지 않은 개별 외벽색·재질·상점 전면·발코니를 임의 지정했던 24동 시안은 제거했습니다. 공방 북쪽 남북 도로 양옆의 4동은 2025년 11월 로드뷰와 도로·건물 윤곽을 대조해 흰 미장·적벽돌·황토색 미장 외관을 적용했습니다. 나머지 미확인 외벽은 중립색 임시 모델이며, 개별 외관은 주소와 촬영면을 대조한 뒤 추가해야 합니다. 조사 근거는 [`design/expanded-area-source-notes.md`](design/expanded-area-source-notes.md)에 기록했습니다.

### 지도 전체 3D 범위

공방 북쪽 로드뷰의 흰 미장 건물은 곡면 청록 차양·넓은 창을, 맞은편 적벽돌 건물은 하층 셔터와 유리 출입부를 보완했습니다. 전체 건물의 개별 외벽 대조는 아직 완료되지 않았습니다.

촬영 거리의 선택 범위를 없애고 현재 사각 지도 전체의 OSM 건물 윤곽 2천여 동을 3D로 표시합니다. **전체 지도 보기** 버튼으로 넓은 범위를 볼 수 있습니다. 도로·골목 636개와 녹지 14곳을 같은 사각 범위에서 받아 바닥에 적용했습니다. 도로 면은 작은 단위로 합치고 좌표를 밀리미터 단위로 정리해 교차부의 계산 오류를 줄이며, 건물 윤곽을 도로에서 제외합니다. `node scripts/fetch-map-surfaces.mjs`로 도로·녹지 사본을 갱신할 수 있습니다.

공방과 조사한 거리 건물은 기존 상세 모델을 유지합니다. 멀리 있는 건물은 창틀·창턱·기단·층간 띠·옥상 테두리를 묶어 그리는 모델을 사용합니다. 전체 건물의 실제 외벽을 로드뷰로 확인한 것은 아니며, 미확인 외벽은 중립색, 지붕은 일반형 팔레트입니다. 건물 높이와 도로 폭은 자료가 없는 경우 추정치이고 지형 높낮이는 아직 평면입니다.

## 골목길 직접 그리기

`editable`을 켜고 **골목길** 탭에서 **새 골목길 그리기**를 누른 뒤 지도를 차례로 클릭해 점을 찍고 **완료**를 누릅니다. 목록에서 골목길을 고르면 흰 점을 드래그해 모양을 고치거나, 점을 더블클릭해 지우거나, 점 사이의 ＋를 눌러 점을 추가할 수 있습니다. 이름과 폭(1~8m)도 바꿀 수 있습니다. 3D 모델은 현재 카메라 각도에서 도로·골목길을 가리면 그 모델만 자동으로 반투명해집니다. 모델이 화면에서 차지하는 영역을 계산해 그 안을 지나는 길이 있는지 카메라가 움직일 때마다 다시 판정합니다. 골목길 탭에서는 모든 모델이 반투명해지며, 다른 탭에서도 지도 오른쪽 위의 상자 버튼으로 모두 반투명하게 볼 수 있습니다. 폭은 기본값 3m가 배경지도의 골목과 같은 굵기가 되도록 비례해 그리므로 실제 치수가 아닌 상대적인 굵기입니다.

그린 결과는 `alleys` / `onAlleysChange`로 주고받으며 형식은 `Alley` 타입(`{ id, name?, coordinates: [경도, 위도][], widthMeters }`)입니다. 미리보기는 브라우저의 로컬 저장소에 저장합니다.

## 실제 건물 윤곽

지도 오른쪽 위의 건물 버튼으로 OpenStreetMap 건물 외곽선을 켜고 끌 수 있습니다. 벡터 타일의 건물은 일부 줌에만 들어 있어 표시 영역의 건물을 `src/data/gamcheon-buildings.json`에 저장해 사용합니다. `node scripts/fetch-buildings.mjs`로 다시 받을 수 있습니다.

## 지도 데이터

배경지도는 OpenStreetMap 데이터를 사용하는 [OpenFreeMap Positron 벡터 스타일](https://openfreemap.org/quick_start/)을 바탕으로 합니다. 크림색 바탕, 녹색 공원·숲, 청록색 물, 밝은 도로와 따뜻한 윤곽선으로 색을 조정했습니다. 건물과 기본 지도 글자 레이어는 숨기고 도로·공원·물길은 남겼습니다. [OpenStreetMap 감천2동 경계(Relation 4057099)](https://www.openstreetmap.org/relation/4057099)를 `src/data/gamcheon2-boundary.json`에 저장하고, 해당 경계의 최소·최대 좌표에서 사방으로 넓힌 사각형을 표시 영역으로 사용합니다. 사각형 밖은 단색으로 가리고 지도 이동 범위도 주변으로 제한합니다. 경계 데이터는 저장 시점의 사본이므로 OpenStreetMap에서 바뀌어도 자동 갱신되지 않습니다. 지도 바닥은 평면이며 시점을 기울이거나 회전해 볼 수 있습니다. 마우스 휠로 확대·축소하고, 마우스 오른쪽 버튼을 누른 채 움직여 시점을 회전하거나 기울일 수 있습니다. 출처 표기는 지도 오른쪽 아래에 유지합니다. `src/data/positron-style.json`은 OpenFreeMap 스타일을 가져온 파일이며, OpenFreeMap 프로젝트의 라이선스는 [공식 사이트](https://openfreemap.org/)에 안내되어 있습니다.

## 출처와 라이선스

지도 데이터(OpenStreetMap, ODbL 1.0), 배경 지도(OpenFreeMap·OpenMapTiles), 3D 모델 에셋의 출처와 조건, 오픈소스 라이선스 고지 방법은 [`NOTICE.md`](NOTICE.md)에 정리했습니다. 지도 앱을 빌드하면 `third-party-notices.txt`가 함께 만들어집니다.
