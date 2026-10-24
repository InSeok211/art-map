// 지도 API가 쓰는 자원입니다. 이 API는 감천 작가 지도 홈페이지 서버 안에서 돌고(npm run export:site로 묶어 넣음),
// 홈페이지가 자기 자원과 운영자 확인을 넘겨줍니다.
//  - DB: 골목길·GPS 기록·건물 편집(홈페이지 D1, 표는 migrations/0001_map_data.sql)
//  - MODELS: 관리자가 올린 3D 모델(GLB) 파일(홈페이지 R2, map-models/ 아래)
//  - isAdmin: 이 요청이 홈페이지 운영자로 로그인한 사람의 것인지
export interface MapEnv {
  busanBusApiKey?: string
  DB: D1Database
  MODELS: R2Bucket
  isAdmin: (request: Request) => Promise<boolean>
}
