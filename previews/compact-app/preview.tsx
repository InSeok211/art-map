import { createRoot } from 'react-dom/client'
import FullArtistMap from '../../../이거/app/map/FullArtistMap'
import type { ArtistPlace } from '../../../이거/app/map/map-artists'

// 디자인 미리보기 전용 예시. 운영 화면 /map은 승인된 작가 데이터만 사용합니다.
const artists: ArtistPlace[] = [
  {id:'preview-painting',name:'김하늘 · 예시',categories:['회화'],studio:'하늘빛 작업실',image:'/assets/home/hero-artist-studio.png',geoPosition:{longitude:129.0102,latitude:35.097}},
  {id:'preview-craft',name:'이서연 · 예시',categories:['공예'],studio:'마루 공방',image:'/assets/home/artist-goods.png',geoPosition:{longitude:129.009,latitude:35.096}},
  {id:'preview-ceramic',name:'박도윤 · 예시',categories:['도예','공예'],studio:'소담 도예공방',image:'/assets/home/artist-goods.png',geoPosition:{longitude:129.0107,latitude:35.0955}},
  {id:'preview-photo',name:'정유진 · 예시',categories:['사진'],studio:'감천 스냅',image:'/assets/home/hero-artist-studio.png',geoPosition:{longitude:129.0112,latitude:35.0972}},
].map(artist=>({...artist,type:artist.categories[0]+' 작가',address:'감천문화마을',hours:'방문 전 문의',visitType:'예약 방문',detailHref:'/artists'}))
createRoot(document.getElementById('root')!).render(<FullArtistMap initialPlaces={artists}/>);
