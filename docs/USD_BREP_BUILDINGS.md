# USD BRep로 지도 건물 만들기

사진을 참고한 실제 장소 예제: [도미도 외관 복원 시안](DOMIDO_RECONSTRUCTION.md).
디자인 시안 기반 추가 예제: [그린하우스 CAD 복원](GREENHOUSE_BREP_RECONSTRUCTION.md).

지도에서 쓰는 GLB를 로컬 CAD 작업으로 생성하는 실험입니다. 웹 앱의 런타임 의존성은 추가하지 않습니다.
NVIDIA의 [USD BRep](https://github.com/NVIDIA-Omniverse/usd-brep)로 벽·문·창문·옥상 난간을 만들고,
CAD 테셀레이션 결과를 Three.js GLTFExporter로 GLB로 저장합니다.
실제 건물의 실측 복원 모델이 아니라 제작 경로 검증을 위한 2층 샘플입니다.

## 설치와 빌드 (Windows PowerShell)

공식 소스는 `.tmp/usd-brep`, 의존성 캐시는 `.tmp/packman-cache`에 둡니다.
두 폴더는 Git에서 제외되어 있습니다. 소스 버전은 `c9c5979f04cea8c38213004d4f04df0dcfb40d05`입니다.
시험 건물은 외부 CAD 파일을 읽지 않으므로 Git LFS의 대용량 테스트 자료는 내려받지 않아도 됩니다.

```powershell
$env:GIT_LFS_SKIP_SMUDGE = '1'
git clone https://github.com/NVIDIA-Omniverse/usd-brep.git .tmp/usd-brep
git -C .tmp/usd-brep checkout c9c5979f04cea8c38213004d4f04df0dcfb40d05
$env:PM_PACKAGES_ROOT = Join-Path (Get-Location) '.tmp/packman-cache'
$env:_CL_ = '/MP2'
Push-Location .tmp/usd-brep
.\prebuild.bat
.\repo.bat build -r -j 1 -t _omni_solid
Pop-Location
```

이 PC는 Visual Studio 2022 Community / MSVC 14.37 / Windows SDK 10.0.22621.0을 사용합니다.
공식 기본 설정은 VS 2019이므로 **로컬 checkout의** `repo.toml`에서
`msbuild.vs_version = "vs2022"`로 바꿔 실행합니다.
Packman이 Windows SDK의 `Program Files (x86)` 경로에서 실패하면, PowerShell의 `New-Item -ItemType Junction`으로
`.tmp/usd-brep/_build/host-deps/winsdk`를 SDK의 `bin/10.0.22621.0`에 연결한 다음 재실행합니다.
전역 환경 변수나 Visual Studio 설치는 수정하지 않습니다.
빌드는 건물 제작에 필요한 `_omni_solid`와 의존 라이브러리만 대상으로 합니다.
`_CL_=/MP2`로 동시 C++ 컴파일 수를 제한하여 메모리 사용을 줄입니다.

## 건물 생성

```powershell
npm run build:brep-building
# 크기는 미터. 시험용 개구부에 맞춰 최소 폭 4, 깊이 3, 층고 2.5가 필요합니다.
npm run build:brep-building -- --width 7 --depth 5 --floor-height 3.2
```

다른 위치에 빌드한 소스가 있으면 현재 PowerShell의 `USD_BREP_ROOT`를 그 경로로 지정합니다.
결과는 `.tmp/brep-building/`에 저장합니다.

- `gamcheon-brep-building.usda`: 정확한 CAD 형상에서 만든 메시만 담은 USD, Z축 위·센티미터 단위
- `gamcheon-brep-building.mesh.json`: CAD 테셀레이션 원본 배열
- `gamcheon-brep-building.glb`: 지도용 단일 파일, Y축 위·미터 단위
- `preview.html`: 개발 서버에서 모델을 회전·확대하는 미리보기

제작 순서는 `scripts/build-brep-building.py`에서 공식 `example_generate_asset.py`를 바탕으로 CAD·USD 출력 부분을 적용하고,
`scripts/build-brep-building.mjs`에서 좌표를 회전·축척 변환한 뒤 GLB로 저장하는 방식입니다.
벽과 개구부는 BRep 차집합 연산을 사용합니다. 각 부품의 manifold 여부를 확인하고,
GLB 생성 후 지도 업로드와 동일한 `checkGlb` 검사를 통과해야 결과를 저장합니다.
공식 뷰어를 실행하지 않으므로 NumPy·PyVista 설치는 필요하지 않습니다.

검증한 기본 샘플은 manifold 부품 25개, 삼각형 1,984개, GLB 158,720바이트입니다.
전체 크기는 지붕 돌출부와 난간을 포함하여 폭 6.30m × 높이 7.06m × 깊이 4.30m입니다.

## 지도에 넣기

`npm run dev` 실행 후 `http://127.0.0.1:5173/.tmp/brep-building/preview.html`에서 모델부터 확인할 수 있습니다.

1. `npm run dev` 실행 후 `/studio/`를 엽니다.
2. 건물 모델 라이브러리에 생성된 GLB를 올립니다.
3. 시험할 건물을 선택하고 모델을 배치한 뒤 크기·방향·고도를 조정합니다.
4. 공개본에 반영하려면 편집기에서 결과를 확인하고 공개합니다.

이 생성 명령 자체는 공개 지도나 서버 데이터를 변경하지 않습니다.
