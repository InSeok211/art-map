# 그린하우스 디자인 시안 기반 USD BRep 복원

`design/greenhouse-exterior/greenhouse-reference-sheet-v1.png`를 참고한 별도 CAD 제작 시안입니다.
기존 지도의 그린하우스 기본 GLB 및 공개 지도 데이터는 교체하지 않습니다.

```powershell
npm run build:greenhouse-brep
```

USD BRep 설치는 [설치 안내](USD_BREP_BUILDINGS.md)를 따릅니다.
표면 그래픽 생성에는 도미도 상세 모델과 같은 로컬 `@napi-rs/canvas` 런타임을 사용합니다.

출력 파일:

- `.tmp/greenhouse-design/greenhouse-design.glb`: 지도 업로드용, CAD 메시와 이미지 재질 포함
- `.tmp/greenhouse-design/greenhouse-design.usda`: 부품별 CAD 테셀레이션 메시 및 부품 색
- `.tmp/greenhouse-design/greenhouse-design.mesh.json`: CAD 테셀레이션 배열
- `.tmp/greenhouse-design/preview.html`: 정면·사선·진입부 확대, 원본 디자인 시안 링크

`npm run dev` 후 `http://127.0.0.1:5173/.tmp/greenhouse-design/preview.html`에서 확인합니다.

## 제작 범위

왼쪽 좁은 박공 건물과 오른쪽 넓은 수평 줄눈 건물, 깊이 들어간 중앙 출입부,
상부 연결부, 노란 계단·난간·랜턴, 황갈색 중앙 차양, 왼쪽 줄무늬 테라스 차양,
꽃상자 창호와 아래 창호, 금속 처마, 채색 테라스 벽, 벽화가 있는 입체 설비함,
실외기, 체커보드 기단, 벽돌 옹벽, VITO 프레임·속을 파낸 수반을 CAD로 제작합니다.
두 나무 인형은 단순 입체 형상으로 표시합니다.
나비·고양이·마을 벽화는 생성 시안의 원본 이미지 영역을 UV로 연결하고 간판은 별도 글자 재질로 표현합니다.
시안 전체를 평면으로 붙이는 대신 창 개구부·계단·난간 등은 실제 입체 CAD 형상입니다.

## 추정과 검증

전체 외벽 폭과 건물 깊이는 실측이 없는 추정값입니다.
기본 입력은 왼쪽 폭 3.0m, 오른쪽 폭 3.8m, 가운데 간격 1.8m,
깊이 5.0m, 왼쪽 처마 6.0m, 오른쪽 처마 6.5m입니다.
진입 계단의 단수·폭·치수, 뒷면과 내부도 설계 시안을 해석한 값입니다.
사진·생성 시안은 실측 설계도와 다르므로 현장 치수가 생기면 이 값을 먼저 보정합니다.

CAD 부품 444개가 manifold 검사에 통과했고 CAD 삼각형은 43,008개입니다.
최종 GLB는 7,419,964바이트이며 지도 업로드 검사기에서 파일 크기·외부 참조·압축 여부를 검사합니다.
같은 재질의 CAD 부품은 묶어서 렌더링합니다. 브라우저에서 실제 메시·재질 로딩과 뷰 전환을 확인합니다.
