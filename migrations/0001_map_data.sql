-- 감천 골목지도 앱 서버의 데이터베이스입니다. 표 이름·모양은 예전 홈페이지(감천 작가 지도)와 같아서 데이터를 그대로
-- 옮겨 올 수 있습니다.

-- 골목길(확인한 길)과 버린 후보. 한 줄(id = 'active')에 목록 전체를 둡니다.
CREATE TABLE IF NOT EXISTS map_alleys (
  id TEXT PRIMARY KEY NOT NULL DEFAULT 'active',
  alleys_json TEXT NOT NULL,
  dismissed_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 관리자 GPS 기록(GPX로 올린 것). 공개 지도에는 나가지 않습니다.
CREATE TABLE IF NOT EXISTS gps_trails (
  id TEXT PRIMARY KEY NOT NULL,
  started_at TEXT NOT NULL,
  points_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 건물 편집 초안(draft)·공개본(published)
CREATE TABLE IF NOT EXISTS map_building_edits (
  id TEXT PRIMARY KEY NOT NULL CHECK (id IN ('draft', 'published')),
  edits_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 편집 앱 로그인 실패 횟수(같은 곳에서 15분 안에 5번 틀리면 잠시 막음)
CREATE TABLE IF NOT EXISTS login_failures (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  first_at INTEGER NOT NULL
);
