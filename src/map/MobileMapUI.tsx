import { BusArrivals } from '../places/BusArrivals'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { PLACE_CATEGORY_ICONS, PLACE_CATEGORY_LABELS } from '../types'
import type { CategoryFilter, Place } from '../types'

// 공개 지도의 휴대폰 화면(06 '지도 몰입' 시안). 지도를 넓게 두고 위에는 이름표·검색·분류를, 아래에는 고른 장소
// 카드와 하단 메뉴를 띄웁니다. 넓은 화면에서는 CSS로 숨기고 기존 옆 패널을 씁니다.

export type MobileView = 'map' | 'list' | 'route'

interface MobileMapUIProps {
  query: string
  onQueryChange: (query: string) => void
  category: CategoryFilter
  onCategoryChange: (category: CategoryFilter) => void
  counts: Record<CategoryFilter, number>
  places: Place[]
  selected: Place | null
  view: MobileView
  onView: (view: MobileView) => void
  onSelect: (place: Place) => void
  onRouteTo: (place: Place) => void
  onLocate: () => void
  located: boolean
  // 지도가 내가 바라보는 방향을 따라 도는 중인지
  headingUp: boolean
  route: ReactNode
}

const CATEGORIES: [CategoryFilter, string][] = [['all', '전체'], ['attraction', '명소'], ['shop', '가게'], ['toilets', '화장실'], ['bus_stop', '버스 정류장']]
// 카드 위에 쌓는 오른쪽 아래 버튼 묶음의 높이(지도 출처·나침반·내 위치)와, 오른쪽 위 버튼 묶음을 못 찾을 때 쓰는 그 아래 끝(px)
const CORNER_BUTTONS_HEIGHT = 130
const TOP_TOOLS_BOTTOM = 370
const categoryLabel =(place: Place) => PLACE_CATEGORY_LABELS[place.category]
const placeIcon = (place: Place) => PLACE_CATEGORY_ICONS[place.category]

export function MobileMapUI({
  query, onQueryChange, category, onCategoryChange, counts, places, selected, view, onView,
  onSelect, onRouteTo, onLocate, located, headingUp, route,
}: MobileMapUIProps) {
  const card = useRef<HTMLElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { setExpanded(false) }, [selected?.id])
  // 아래 카드가 지도 바닥에서 차지하는 높이를 지도에 알려 줍니다(--gm-card-space). 오른쪽 아래 버튼(내 위치·나침반·
  // 지도 출처)이 카드 바로 위에 붙고, 카드가 커져(버스 도착정보 등) 오른쪽 위 버튼과 부딪힐 만하면 숨깁니다.
  useLayoutEffect(() => {
    const element = card.current
    const host = element?.closest<HTMLElement>('.gamcheon-map')
    if (!element || !host) return
    const update = () => {
      const space = Math.round(host.getBoundingClientRect().bottom - element.getBoundingClientRect().top)
      const tools = host.querySelector('.gamcheon-map__map-tools')?.getBoundingClientRect()
      const toolsBottom = tools?.height ? tools.bottom - host.getBoundingClientRect().top + 12 : TOP_TOOLS_BOTTOM
      host.style.setProperty('--gm-card-space', `${space}px`)
      host.classList.toggle('is-card-tall', host.clientHeight - space - CORNER_BUTTONS_HEIGHT < toolsBottom)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    observer.observe(host)
    return () => { observer.disconnect(); host.style.removeProperty('--gm-card-space'); host.classList.remove('is-card-tall') }
  }, [])
  return <div className="gm-mobile" data-view={view}>
    <div className="gm-mobile__top">
      <div className="gm-mobile__brand">
        <span className="gm-mobile__brand-mark" aria-hidden="true">G</span>
        <div><strong>감천 작가 지도</strong><small>공방과 가게를 한 지도에서</small></div>
        <em>감천2동</em>
      </div>
      <label className="gm-mobile__search">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="10.8" cy="10.8" r="6.4" stroke="currentColor" strokeWidth="2" />
          <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          ref={search}
          type="search"
          enterKeyHint="search"
          aria-label="장소 검색"
          placeholder="공방·가게·명소·화장실·정류장 검색"
          value={query}
          onChange={(event) => { onQueryChange(event.target.value); if (view !== 'list') onView('list') }}
          onKeyDown={(event) => { if (event.key === 'Enter') { search.current?.blur(); onView('list') } }}
        />
        {query && <button type="button" className="gm-mobile__clear" aria-label="검색어 지우기" onClick={() => { onQueryChange(''); search.current?.focus() }}>×</button>}
      </label>
      <div className="gm-mobile__chips" role="group" aria-label="장소 분류">
        {CATEGORIES.map(([value, label]) => <button
          key={value}
          type="button"
          aria-pressed={category === value}
          onClick={() => { onCategoryChange(value); if (view === 'route') onView('map') }}
        >{label} {counts[value]}</button>)}
      </div>
    </div>

    <section ref={card} className={`gm-mobile__card${view === 'list' ? ' is-list' : ''}${view === 'route' ? ' is-route' : ''}`} aria-label={view === 'route' ? '길찾기' : view === 'list' ? '장소 목록' : '장소 정보'}>
      <button type="button" className="gm-mobile__handle" aria-label={view === 'map' ? '장소 목록 열기' : '지도로 돌아가기'} onClick={() => onView(view === 'map' ? 'list' : 'map')}><span /></button>
      {view === 'route' ? <div className="gm-mobile__route">
        <div className="gm-mobile__head"><div><small>걸어서 가는 길</small><strong>길찾기</strong></div><button type="button" onClick={() => onView('map')}>닫기</button></div>
        {route}
      </div> : view === 'list' ? <>
        <div className="gm-mobile__head">
          <div><small>지도에 표시된 장소</small><strong>{query.trim() ? `“${query.trim()}” 검색 결과` : `${CATEGORIES.find(([value]) => value === category)?.[1]} ${places.length}곳`}</strong></div>
          <div className="gm-mobile__list-controls"><button type="button" onClick={() => { onQueryChange(''); onCategoryChange('all') }}>초기화</button><button type="button" onClick={() => { search.current?.blur(); onView('map') }}>지도 보기</button></div>
        </div>
        <div className="gm-mobile__list">
          {places.length ? places.map((place) => <button
            key={place.id}
            type="button"
            className={selected?.id === place.id ? 'is-active' : ''}
            onClick={() => { search.current?.blur(); onSelect(place); onView('map') }}
          >
            <span className={`gm-mobile__icon gm-mobile__icon--${place.category}`} aria-hidden="true">{placeIcon(place)}</span>
            <span className="gm-mobile__list-body"><strong>{place.name}</strong><small>{categoryLabel(place)}{place.address ? ` · ${place.address}` : ''}</small></span>
            <span aria-hidden="true">↗</span>
          </button>) : <p className="gm-mobile__empty">검색 결과가 없습니다. 검색어를 줄이거나 다른 분류를 선택해 보세요.</p>}
        </div>
      </> : selected ? <>
        <div className="gm-mobile__head">
          <div><small>{categoryLabel(selected)}</small><strong>{selected.name}</strong></div>
          <span className={`gm-mobile__icon gm-mobile__icon--${selected.category}`} aria-hidden="true">{placeIcon(selected)}</span>
        </div>
        {selected.address && <p className="gm-mobile__address">⌖ {selected.address}</p>}
        {(selected.photo || selected.description) && <>
          <button type="button" className="gm-mobile__detail-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '장소 안내 접기 ⌃' : selected.photo ? '사진·장소 안내 보기 ⌄' : selected.category === 'bus_stop' ? '정류장 안내 보기 ⌄' : '장소 안내 보기 ⌄'}</button>
          {expanded && <div className="gm-mobile__detail-content">
            {selected.photo && <img className="gm-mobile__photo" src={selected.photo} alt={`${selected.name} 사진`} loading="lazy" />}
            {selected.description && <p className="gm-mobile__description">{selected.description}</p>}
          </div>}
        </>}
        <BusArrivals key={selected.id} place={selected} />
        <div className="gm-mobile__actions">
          <button type="button" onClick={() => onView('list')}>주변 장소 {places.length}곳</button>
          <button type="button" onClick={() => onRouteTo(selected)}>길찾기</button>
        </div>
      </> : <p className="gm-mobile__empty">지도에서 장소를 눌러 보세요.</p>}
    </section>

    <button type="button" className="gm-mobile__compact-locate" aria-label="내 위치로 이동" onClick={onLocate} aria-pressed={located}>◎</button>
    <nav className="gm-mobile__nav" aria-label="지도 메뉴">
      {([['map', '⌖', '지도'], ['list', '☷', '목록'], ['route', '➚', '길찾기']] as const).map(([target, icon, label]) => <button
        key={target}
        type="button"
        className={view === target ? 'is-active' : ''}
        aria-current={view === target ? 'page' : undefined}
        onClick={() => onView(target)}
      ><span aria-hidden="true">{icon}</span>{label}</button>)}
      <button
        type="button"
        className={`${located ? 'is-located' : ''}${headingUp ? ' is-heading' : ''}`}
        aria-pressed={headingUp}
        aria-label={headingUp ? '방향 따라 보기 끄기' : '내 위치에서 바라보는 방향으로 보기'}
        onClick={onLocate}
      ><span aria-hidden="true">{headingUp ? '➤' : '◎'}</span>{headingUp ? '방향 보기' : '내 위치'}</button>
    </nav>
  </div>
}
