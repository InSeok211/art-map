import type { Place } from '../types'
import { PLACE_CATEGORY_ICONS, PLACE_CATEGORY_LABELS } from '../types'
import { BusArrivals } from './BusArrivals'

export function DesktopPlaceDetail({ place, onClose, onRoute }: { place: Place; onClose: () => void; onRoute: () => void }) {
  return <section className="gm-desktop-detail" role="region" aria-label="선택한 장소">
    <header className="gm-desktop-detail__top"><span>장소 상세</span><button type="button" onClick={onClose} aria-label="장소 상세 닫기">×</button></header>
    <div className="gm-desktop-detail__body">
      <div className="gm-detail-heading">
      {place.photo ? <img className="gm-desktop-detail__photo" src={place.photo} alt={`${place.name} 사진`} /> : <div className={`gm-desktop-detail__cover is-${place.category}`} aria-hidden="true"><span>{PLACE_CATEGORY_ICONS[place.category]}</span></div>}
      <div>
      <span className={`gm-desktop-detail__category is-${place.category}`}>{PLACE_CATEGORY_LABELS[place.category]}</span>
      <h2>{place.name}</h2>
      {place.address && <p className="gm-desktop-detail__address">⌖ {place.address}</p>}
      </div></div>
      <BusArrivals key={place.id} place={place} />
      {place.description && <details key={place.id} className="gm-place-more"><summary>{place.category === 'bus_stop' ? '정류장 안내' : '장소 소개 보기'}</summary>
      {place.description && <div className="gm-desktop-detail__about"><h3>장소 안내</h3><p>{place.description}</p></div>}
      </details>}
      <button type="button" className="gm-desktop-detail__route" onClick={onRoute}>여기까지 걸어서 <span>길찾기 ↗</span></button>
    </div>
  </section>
}

