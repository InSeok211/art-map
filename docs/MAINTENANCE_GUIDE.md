# 감천 골목지도 — 관리 설명서

## 프로젝트 설명문

감천 골목지도는 홈페이지에 연결해서 사용하는 React 지도 컴포넌트입니다. MapLibre가 지도·좌표·지형을 처리하고, Three.js가 건물·길·주변 물체를 3D로 그립니다. 장소 탐색, 길찾기, 골목 편집, 건물 편집은 기능별 폴더에서 관리하며, `GamcheonMap.tsx`가 이 기능들을 지도 화면에 연결합니다.

평지 화면은 평평한 바닥을 기준으로 기존 상세 건물을 생성합니다. 3D 지형 화면은 일반 건물에 대해 도로 쪽 지면을 기준으로 층을 잡고, 각 벽의 밑단을 경사면에 맞춰 생성합니다. 층과 지붕은 수평을 유지합니다. 전용 GLB 건물과 작가님 공방은 기존 외관 모델을 지면 기준으로 배치하고, 필요한 부분에 기초를 연결합니다. 이 두 표현은 같은 건물 입력 자료를 사용하지만 도형을 만드는 방식이 다릅니다.

현재 로컬 3D 표현은 지형 배치를 확인하기 위한 시안입니다. 일반 건물의 세부 외관은 단순화되어 있고, 고도와 출입면은 지도 자료에서 추정합니다. 실제 건물의 출입구 높이, 옹벽, 계단을 정확히 표현하려면 현장 자료를 추가해야 합니다.

코드를 수정할 때는 `art-map/src/`를 사용합니다. 상위 폴더의 `worker/`·`static/`는 과거 홈페이지 배포 결과를 보관한 자료입니다. 지도 코드를 수정하거나 로컬에서 빌드하는 것만으로 홈페이지가 갱신되지는 않습니다. 최신 구조는 지도 앱을 별도 Cloudflare Worker로 배포하고 홈페이지가 그 공개 지도를 iframe으로 연결합니다.

## 시작과 확인

아래 명령은 `art-map/` 폴더에서 실행합니다. `package-lock.json`에 기록된 설치 구성을 사용할 때는 다음과 같습니다.

```powershell
npm ci --legacy-peer-deps
npm run dev
```

`npm ci`는 설치된 의존성 폴더를 다시 구성합니다. 의존성이 이미 준비되어 있으면 `npm run dev`로 시작합니다. 개발 서버 설정은 `127.0.0.1:5173`이며, 현재 같은 포트에서 서버가 실행 중이면 두 번째 서버를 시작하지 않습니다.

| 화면 | 로컬 주소 | 용도 |
|---|---|---|
| 지도 작업실 | `http://127.0.0.1:5173/studio/` | 골목·건물 편집과 평지/지형 시안 확인 |
| 공개 지도 | `http://127.0.0.1:5173/` | 로컬 브라우저의 공개본 확인. Worker 빌드는 지도 서버 API를 사용합니다. |
| 그린하우스 단독 모델 | `http://127.0.0.1:5173/previews/greenhouse-preview.html` | 모델을 회전해서 외관 확인 |
| 아름다운한글 단독 모델 | `http://127.0.0.1:5173/previews/beautiful-hangul-preview.html` | 모델을 회전해서 외관 확인 |

단독 모델 페이지는 Vite 개발 서버에서 확인합니다. 공개 화면은 `index.html`, 편집 화면은 `studio/index.html`로 빌드합니다.

## 무엇을 고칠 때 어느 파일을 보는가

| 수정 내용 | 먼저 확인할 위치 |
|---|---|
| 지도 화면·메뉴·기능 연결 | `src/GamcheonMap.tsx`, `src/gamcheon-map.css` |
| 작업실 기본 화면 | `src/studio.tsx`, `src/studio.css` |
| 홈페이지 iframe 연결·부모 창 메시지 | `src/embed.tsx`, `src/embed.css` |
| 지도 스타일·표시 범위·좌표 변환 | `src/map/mapStyle.ts`, `gamcheonBoundary.ts`, `streetCoordinates.ts` |
| 고도 읽기 | `src/map/terrain.ts`, `scripts/build-terrain.mjs` |
| 3D 일반 건물의 기준 층·경사 벽 | `src/scene/terrain/terrainBuildingGeometry.ts`, `StreetSceneLayer.ts`의 `buildTerrainBuilding()` |
| GLB 건물의 지형 기초 | `src/scene/terrain/buildingFoundation.ts`, `src/scene/placedModels.ts` |
| 평지 건물 외관·3D 장면 조립 | `src/scene/StreetSceneLayer.ts` |
| 건물 윤곽·색·높이·관찰 규칙 | `src/scene/streetSceneData.ts`, `src/data/gamcheon-buildings.json` |
| 벽·창·바닥 질감 | `src/scene/streetTextures.ts` |
| GLB 파일 로딩 | `src/scene/modelFiles.ts`, `src/assets/models/custom/` |
| 모델 제작 | `scripts/build-greenhouse-from-plan.mjs`, `build-beautiful-hangul.mjs` 등 |
| 건물 편집 UI·저장 형식 | `src/buildings/` |
| 골목·GPS·GPX | `src/alleys/` |
| 장소 정보·목록·검색 | `src/places/` |
| 길찾기 경로·시간 계산 | `src/route/` |
| 현장 조사·도면·추정 근거 | `design/` |

건물 위치·색·높이의 편집 데이터는 평지와 3D에서 공유됩니다. 한 모드에서 저장한 편집 내용이 다른 모드에도 사용될 수 있습니다. 로컬 작업실의 편집 결과는 브라우저 저장소·IndexedDB에 저장되며, 소스코드 파일을 옮기거나 빌드한다고 그 데이터가 프로젝트 파일로 복사되지는 않습니다.

## 원본과 생성 파일

| 생성 결과 | 갱신 방법 | 실행할 때 |
|---|---|---|
| `src/generated/building-outlines.json`, `road-ground.json` | `npm run build:road-ground` | 건물·도로 입력 또는 해당 사전 계산 규칙 변경 |
| `src/generated/terrain.json` | `npm run build:terrain` | 지형 범위·격자·고도 수집 규칙 변경. 외부 고도 타일을 받습니다. |
| `src/assets/models/custom/greenhouse-sixpence-connected.glb` | `npm run build:greenhouse` | 그린하우스 제작 코드 변경 |
| `src/assets/models/custom/beautiful-hangul-studio.glb` | `npm run build:beautiful-hangul` | 아름다운한글 제작 코드 변경 |
| `dist/` 라이브러리·CSS·타입·모델 | `npm run build` | 다른 React 프로젝트에서 사용할 라이브러리 빌드 |
| `dist-app/` 공개·편집 화면 빌드 | `npm run app:build` | Worker가 제공할 앱 파일 빌드 |

라이브러리 `build`는 `dist/`, 서버 앱 `app:build`는 `dist-app/`에 생성합니다. `build:road-ground`와 `build:terrain`의 생성 결과는 실행에 사용되므로 Git으로 함께 관리합니다. `dist/`와 `node_modules/`는 Git에서 제외합니다.

`scripts/fetch-buildings.mjs`, `fetch-map-surfaces.mjs`는 외부 지도 자료를 받아 입력 파일을 갱신합니다. `scripts/build-street-surfaces.mjs`는 `design/`의 OSM XML을 변환합니다. 기존 제작 스크립트가 조사 보고서를 `design/`에 출력하기도 하므로, 파일을 옮기기 전에 해당 스크립트의 출력 경로를 확인합니다.

## 수정 후 확인

기본 타입 검사는 다음과 같습니다.

```powershell
npx tsc --noEmit
```

지형 건물·기초를 수정했다면 관련 검사는 다음과 같습니다.

```powershell
npx vitest run src/scene/terrain/terrainBuildingGeometry.test.ts src/scene/terrain/buildingFoundation.test.ts src/scene/streetScenePerformance.test.ts
```

브라우저에서는 평지/3D 전환, 낮은 쪽과 높은 쪽 벽 밑단, 건물 크기·방향 변경, 편집 모드의 반투명 표현을 확인합니다. 관련 검사는 수치·도형·평지 장면 동작을 검사하며, 현장 건물과의 일치까지 보장하지는 않습니다.

## 홈페이지 반영 순서(한 서버)

1. 로컬 `/studio/`에서 지형과 건물 편집을 진행합니다. 로컬 ZIP으로 브라우저 자료를 보관합니다.
2. `npm test`로 확인합니다.
3. `npm run export:site -- <홈페이지 저장소 경로>`로 공개 지도·편집 앱(`public/map-app/`)과 지도 API(`app/map/generated/map-api.js`)를 홈페이지에 넣습니다.
4. 홈페이지 저장소에서 빌드·배포하고 커밋합니다. 지도 데이터는 홈페이지 D1·R2에 있고, 편집은 홈페이지 운영자 로그인으로 합니다.

## 인수인계 설명

“지도 원본은 `art-map` 폴더입니다. 공개 지도는 `index.html`, 편집기는 `studio/`, 저장 API는 `server/`입니다. 건물과 지형 기능은 기능별 폴더에서 수정하며, 초안과 공개본은 공통 데이터 형식으로 관리합니다. Vite는 브라우저에 저장하고, 홈페이지에서는 홈페이지 D1/R2에 저장합니다. ZIP은 로컬 복구용입니다. `npm run export:site`로 홈페이지에 넣고 홈페이지를 배포하면 지도도 함께 나갑니다(서버는 홈페이지 하나).”

기능 결정은 [FEATURE_INTEGRATION.md](FEATURE_INTEGRATION.md), 파일 구조는 [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)에 있습니다.
