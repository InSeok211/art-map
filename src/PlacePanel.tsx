import type { CategoryFilter, Place } from './types'

export interface PlaceDraft {
  id?: string
  name: string
  category: Place['category']
  latitude: number | null
  longitude: number | null
  address: string
  description: string
}

const categories: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'attraction', label: '명소' },
  { value: 'shop', label: '가게' },
]

interface PlaceBrowserProps {
  query: string
  onQueryChange: (query: string) => void
  category: CategoryFilter
  onCategoryChange: (category: CategoryFilter) => void
  places: Place[]
  hasAnyPlace: boolean
  selectedId: string | null
  onSelect: (place: Place) => void
  editable: boolean
  onAdd: () => void
  onEditSelected?: () => void
}

// 장소 탭의 검색·분류·목록입니다.
export function PlaceBrowser({
  query, onQueryChange, category, onCategoryChange, places, hasAnyPlace, selectedId, onSelect, editable, onAdd, onEditSelected,
}: PlaceBrowserProps) {
  return <>
    <div className="gamcheon-map__search-wrap">
      <svg className="gamcheon-map__search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="10.8" cy="10.8" r="6.4" stroke="currentColor" strokeWidth="2" />
        <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        aria-label="장소 검색"
        type="search"
        placeholder="장소 이름이나 주소 검색"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <span className="gamcheon-map__search-shortcut">⌕</span>
    </div>

    <div className="gamcheon-map__categories" role="group" aria-label="장소 분류">
      {categories.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={category === item.value}
          className={category === item.value ? 'gamcheon-map__category is-active' : 'gamcheon-map__category'}
          onClick={() => onCategoryChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>

    <div className="gamcheon-map__results-head">
      <span>장소 목록</span>
      <strong>{places.length}곳</strong>
    </div>

    <div className="gamcheon-map__results" aria-live="polite">
      {places.length > 0 ? (
        places.map((place, index) => (
          <button
            key={place.id}
            type="button"
            className={selectedId === place.id ? 'gamcheon-map__place is-selected' : 'gamcheon-map__place'}
            data-place-id={place.id}
            onClick={() => onSelect(place)}
          >
            <span className={`gamcheon-map__place-icon gamcheon-map__place-icon--${place.category}`} aria-hidden="true">
              {place.category === 'attraction' ? '✦' : '⌂'}
            </span>
            <span className="gamcheon-map__place-body">
              <span className="gamcheon-map__place-meta">{place.category === 'attraction' ? '명소' : '가게'} <span>·</span> {String(index + 1).padStart(2, '0')}</span>
              <strong>{place.name}</strong>
              {place.address && <span className="gamcheon-map__place-address">{place.address}</span>}
              {place.description && <span className="gamcheon-map__place-description">{place.description}</span>}
            </span>
            <span className="gamcheon-map__place-arrow" aria-hidden="true">↗</span>
          </button>
        ))
      ) : (
        <div className="gamcheon-map__empty">
          <span className="gamcheon-map__empty-icon" aria-hidden="true">⌕</span>
          <strong>{hasAnyPlace ? '검색 결과가 없어요' : '아직 등록된 장소가 없어요'}</strong>
          <span>{hasAnyPlace ? '다른 검색어나 분류를 선택해 보세요.' : '장소를 추가해 보세요.'}</span>
        </div>
      )}
    </div>
    {editable && <div className="gamcheon-map__edit-toolbar">
      <button type="button" onClick={onAdd}>＋ 장소 추가</button>
      {onEditSelected && <button type="button" onClick={onEditSelected}>선택 장소 수정</button>}
    </div>}
  </>
}

interface PlaceFormProps {
  draft: PlaceDraft
  onChange: (draft: PlaceDraft) => void
  locationError: string
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}

// 장소 추가·수정 양식입니다. 위치는 지도를 클릭해 정합니다(GamcheonMap).
export function PlaceForm({ draft, onChange, locationError, onSave, onCancel, onDelete }: PlaceFormProps) {
  const located = draft.latitude !== null && draft.longitude !== null
  return <>
    <div className="gamcheon-map__results-head">
      <span>{draft.id ? '장소 수정' : '장소 추가'}</span>
    </div>
    <div className="gamcheon-map__editor">
      <p className="gamcheon-map__editor-hint">표시된 사각형 지도 안쪽에서 장소 위치를 클릭하세요. 다시 클릭하면 위치가 바뀝니다.</p>
      {locationError && <p className="gamcheon-map__editor-error" role="alert">{locationError}</p>}
      <div className="gamcheon-map__editor-location">
        {located ? `위치 선택됨 · ${draft.latitude!.toFixed(5)}, ${draft.longitude!.toFixed(5)}` : '위치를 선택해 주세요'}
      </div>
      <label>장소 이름<input aria-label="장소 이름" value={draft.name} maxLength={80} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="예: 골목 카페" /></label>
      <label>분류<select aria-label="장소 분류 선택" value={draft.category} onChange={(event) => onChange({ ...draft, category: event.target.value as Place['category'] })}><option value="shop">가게</option><option value="attraction">명소</option></select></label>
      <label>주소<input aria-label="주소" value={draft.address} maxLength={160} onChange={(event) => onChange({ ...draft, address: event.target.value })} placeholder="주소를 입력하세요" /></label>
      <label>설명<textarea aria-label="설명" value={draft.description} maxLength={500} onChange={(event) => onChange({ ...draft, description: event.target.value })} placeholder="장소를 소개해 주세요" rows={3} /></label>
      <div className="gamcheon-map__editor-actions">
        <button type="button" className="gamcheon-map__editor-save" onClick={onSave} disabled={!draft.name.trim() || !located}>저장</button>
        <button type="button" onClick={onCancel}>취소</button>
        {draft.id && <button type="button" className="gamcheon-map__editor-delete" onClick={onDelete}>삭제</button>}
      </div>
    </div>
  </>
}
