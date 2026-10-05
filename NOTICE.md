# 출처와 라이선스 고지

## 지도 데이터 — OpenStreetMap (ODbL 1.0)

© OpenStreetMap contributors. <https://www.openstreetmap.org/copyright>

다음 파일은 OpenStreetMap 데이터에서 받거나 가공한 데이터베이스이며 [Open Database License(ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)을 따릅니다. 이 파일을 다시 배포하거나 고쳐 배포할 때도 같은 ODbL 조건과 위 출처 표시를 유지해야 합니다.

- `src/gamcheon-buildings.json` — 건물 윤곽
- `src/gamcheon2-boundary.json` — 감천2동 경계(Relation 4057099)
- `src/street-surfaces.json`, `design/street-osm.xml`, `design/street-osm-expanded.xml` — 도로·녹지
- `src/generated/road-ground.json` — 위 도로·건물 자료로 계산한 3D 바닥

지도 화면에는 MapLibre 출처 표시(오른쪽 아래, 휴대폰은 ⓘ 버튼)에 OpenStreetMap·OpenMapTiles·OpenFreeMap 출처가 함께 나옵니다.

## 배경 지도

- 타일: [OpenFreeMap](https://openfreemap.org/)
- 스타일·스키마: © [OpenMapTiles](https://openmaptiles.org/) (`src/positron-style.json`은 OpenFreeMap Positron 스타일을 고친 파일)

## 3D 모델 에셋

`src/assets/models/`의 기본 GLB는 **dogfooter**의 에셋입니다(`src/assets/models/LICENSE.txt`). 제작자 표시(출처: dogfooter)를 유지해야 하며 AI 학습용으로 쓸 수 없습니다. 3D 배치 화면에 제작자 표시가 나옵니다.

## 건물 외관과 지붕색

- 거리 장면의 건물·공방·외벽 질감은 모두 코드로 생성한 절차적 모델입니다. 외부 사진·생성 이미지를 질감으로 쓰지 않습니다.
- 외관 색·창 배열은 사용자가 직접 촬영한 영상·사진과 공개 로드뷰를 눈으로 보고 정리한 관찰값입니다. 로드뷰·항공사진 화면이나 타일은 저장소에 넣거나 배포하지 않습니다(`.gitignore`의 `design/**/*.jpg|png`).
- 조사하지 않은 건물의 지붕색은 일반형 디자인 팔레트(`genericRoof`)이며, 항공사진에서 얻은 값이 아닙니다.

## 오픈소스 소프트웨어

번들에 들어가는 패키지(MapLibre GL JS: BSD-3-Clause, three.js: MIT, polygon-clipping: MIT, React: MIT 등)의 라이선스 전문은 `node scripts/third-party-notices.mjs <출력 파일>`로 모을 수 있습니다. 홈페이지로 내보낼 때(`npm run export:site`) `public/third-party-notices.txt`가 자동으로 만들어지고 사이트 바닥글에서 링크합니다.
