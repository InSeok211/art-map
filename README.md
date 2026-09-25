# 감천 골목지도

감천2동의 가게와 명소를 표시하는 재사용 가능한 React 지도 컴포넌트입니다. 감천2동과 주변 일대를 사각형으로 표시하며 장소 검색·편집과 3D 에셋 배치 기능을 제공합니다. 실제 장소 데이터는 아직 연결하지 않았습니다.

## 개발 및 확인

```bash
npm install --legacy-peer-deps
npm run dev
```

브라우저에서 Vite가 출력하는 로컬 주소를 열면 미리보기 화면을 볼 수 있습니다. 미리보기의 감천문화마을 좌표는 UI 확인용 대략 위치입니다.

```bash
npm test
npm run build
```

`npm run build`는 다른 React 웹에서 사용할 수 있는 ES 모듈, CSS, 타입 선언, 기본 GLB 에셋을 `dist/`에 만듭니다. `dist/assets/models/` 디렉터리를 JS 파일과 함께 배포해야 기본 모델이 표시됩니다.

## 기존 React 웹에 연결

라이브러리 빌드 결과를 기존 웹의 패키지로 설치하거나 `src/`를 기존 프로젝트에 옮겨 사용할 수 있습니다. 컴포넌트를 담는 영역에 높이를 지정하세요.

```tsx
import { useState } from 'react'
import { GamcheonMap, type MapModel, type Place } from 'gamcheon-map'
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
  const [models, setModels] = useState<MapModel[]>([])

  return (
    <div style={{ height: 650 }}>
      <GamcheonMap
        places={places}
        editable
        onPlacesChange={setPlaces}
        onPlaceSelect={(place) => console.log(place)}
        models={models}
        onModelsChange={setModels}
      />
    </div>
  )
}
```

`places`가 비어 있으면 빈 상태가 표시됩니다. 표시된 사각형 영역 밖의 장소는 목록과 지도에서 숨깁니다. 검색은 이름·주소·설명을 대상으로 하며, 분류 버튼은 가게와 명소를 구분합니다. `editable`을 켜면 장소 추가·수정·삭제가 가능하고, 위치는 사각형 영역 안쪽의 지도를 클릭해 정합니다. 저장 결과는 `onPlacesChange`로 전달되므로 기존 웹의 서버나 데이터 저장소에 연결할 수 있습니다. 미리보기 화면에서는 브라우저의 로컬 저장소에 자동 저장됩니다.

## 3D 에셋 직접 배치

`editable`을 켜고 **3D 배치** 탭에서 **둥근형** 또는 **각진형** 모델을 고릅니다. **지도에 배치**를 누른 다음 사각형 지도 안쪽을 클릭하면 배치됩니다. 목록에서 모델을 선택하면 그 위치로 확대되고, 크기·회전·높이를 조절하거나 번호 표시를 드래그해 옮길 수 있습니다. **위치 변경**, **복제**, **삭제**도 가능합니다. **내 GLB 불러오기**로 20MB 이하의 `.glb` 파일을 추가할 수 있습니다. 사용자 GLB는 현재 브라우저의 IndexedDB에 저장됩니다.

배치 결과는 `onModelsChange`로 전달됩니다. 기존 웹에서 사용하려면 위 예시처럼 `models`를 상태로 관리하고, 지속 저장이 필요할 때는 서버나 데이터베이스에도 기록하세요. 미리보기는 배치 정보를 브라우저의 로컬 저장소에 저장합니다. 사용자 GLB는 같은 브라우저에서만 다시 열리므로 여러 기기에서 공유하려면 파일도 별도로 업로드·호스팅해야 합니다. GLB 모델의 좌표·크기는 편집 가능한 시연용이며 실제 건물 위치나 크기를 나타내지 않습니다.

기본 에셋 15개는 제공된 `all-6400` 폴더에서 골랐습니다. 모델 제작자는 **dogfooter**이며 자세한 사용 조건은 [`src/assets/models/LICENSE.txt`](src/assets/models/LICENSE.txt)에 있습니다. 기본 모델을 사용하는 화면에서도 제작자 표시를 유지하세요.

## 골목길 직접 그리기

`editable`을 켜고 **골목길** 탭에서 **새 골목길 그리기**를 누른 뒤 지도를 차례로 클릭해 점을 찍고 **완료**를 누릅니다. 목록에서 골목길을 고르면 흰 점을 드래그해 모양을 고치거나, 점을 더블클릭해 지우거나, 점 사이의 ＋를 눌러 점을 추가할 수 있습니다. 이름과 폭(1~8m)도 바꿀 수 있습니다. 3D 모델은 현재 카메라 각도에서 도로·골목길을 가리면 그 모델만 자동으로 반투명해집니다. 모델이 화면에서 차지하는 영역을 계산해 그 안을 지나는 길이 있는지 카메라가 움직일 때마다 다시 판정합니다. 골목길 탭에서는 모든 모델이 반투명해지며, 다른 탭에서도 지도 오른쪽 위의 상자 버튼으로 모두 반투명하게 볼 수 있습니다. 폭은 기본값 3m가 배경지도의 골목과 같은 굵기가 되도록 비례해 그리므로 실제 치수가 아닌 상대적인 굵기입니다.

그린 결과는 `alleys` / `onAlleysChange`로 주고받으며 형식은 `Alley` 타입(`{ id, name?, coordinates: [경도, 위도][], widthMeters }`)입니다. 미리보기는 브라우저의 로컬 저장소에 저장합니다.

## 실제 건물 윤곽

지도 오른쪽 위의 건물 버튼으로 OpenStreetMap 건물 외곽선을 켜고 끌 수 있습니다. 벡터 타일의 건물은 일부 줌에만 들어 있어 표시 영역의 건물을 `src/gamcheon-buildings.json`에 저장해 사용합니다. `node scripts/fetch-buildings.mjs`로 다시 받을 수 있습니다.

## 지도 데이터

배경지도는 OpenStreetMap 데이터를 사용하는 [OpenFreeMap Positron 벡터 스타일](https://openfreemap.org/quick_start/)을 바탕으로 합니다. 크림색 바탕, 녹색 공원·숲, 청록색 물, 밝은 도로와 따뜻한 윤곽선으로 색을 조정했습니다. 건물과 기본 지도 글자 레이어는 숨기고 도로·공원·물길은 남겼습니다. [OpenStreetMap 감천2동 경계(Relation 4057099)](https://www.openstreetmap.org/relation/4057099)를 `src/gamcheon2-boundary.json`에 저장하고, 해당 경계의 최소·최대 좌표에서 사방으로 넓힌 사각형을 표시 영역으로 사용합니다. 사각형 밖은 단색으로 가리고 지도 이동 범위도 주변으로 제한합니다. 경계 데이터는 저장 시점의 사본이므로 OpenStreetMap에서 바뀌어도 자동 갱신되지 않습니다. 지도 바닥은 평면이며 시점을 기울이거나 회전해 볼 수 있습니다. 마우스 휠로 확대·축소하고, 마우스 오른쪽 버튼을 누른 채 움직여 시점을 회전하거나 기울일 수 있습니다. 출처 표기는 지도 오른쪽 아래에 유지합니다. `src/positron-style.json`은 OpenFreeMap 스타일을 가져온 파일이며, OpenFreeMap 프로젝트의 라이선스는 [공식 사이트](https://openfreemap.org/)에 안내되어 있습니다.
