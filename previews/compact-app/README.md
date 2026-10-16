# 컴팩트 모바일 앱 미리보기

홈페이지 `app/map/FullArtistMap.tsx`의 실제 컴포넌트를 사용합니다. 이 미리보기에만 예시 작가 4명을 넣으며 홈페이지 `/map`은 승인된 작가 데이터를 사용합니다.

지도 원본에서 먼저 `npm run export:site -- "C:/Users/Inseok/Desktop/이거"`를 실행한 다음, 지도 저장소에서 `node node_modules/vite/bin/vite.js --config previews/compact-app/vite.config.mjs`를 실행하면 `http://127.0.0.1:5175/`에서 확인할 수 있습니다.

작가 소개 링크의 실제 상세 페이지는 홈페이지 `/artists/[id]`에서 제공합니다. 이 미리보기 서버는 지도와 앱 화면 확인용입니다.
