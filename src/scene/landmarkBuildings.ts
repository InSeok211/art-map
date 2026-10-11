import { ARTIST_WORKSHOP_FOOTPRINT_ID } from './streetSceneData'
import { BEAUTIFUL_HANGUL_FOOTPRINT_ID } from './beautifulHangul'

// 랜드마크 건물: 자동으로 만들지 않고 따로 만든 모델로 그리는 건물의 OSM 번호입니다(관리자 건물 고치기 대상이 아님).
// 그린하우스(감내1로175번안길 들머리)는 세 OSM 윤곽 대신 사진과 평면도를 바탕으로 만든 연결형 모델입니다.
export const GREEN_HOUSE_FOOTPRINT_IDS = new Set([1468551429, 1468551431, 1468551433])
export const LANDMARK_BUILDING_IDS = new Set([ARTIST_WORKSHOP_FOOTPRINT_ID, BEAUTIFUL_HANGUL_FOOTPRINT_ID, ...GREEN_HOUSE_FOOTPRINT_IDS])
