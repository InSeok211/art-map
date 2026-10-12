import { sameBuildingEdits } from './buildingEdits'
import type { BuildingEdits } from './buildingEdits'

function changeKey(before: BuildingEdits, after: BuildingEdits): string {
  if ((['overrides', 'added', 'models'] as const).filter((section) => JSON.stringify(before[section]) !== JSON.stringify(after[section])).length !== 1) return ''
  for (const section of ['overrides', 'added', 'models'] as const) {
    if (JSON.stringify(before[section]) === JSON.stringify(after[section])) continue
    const previous = section === 'overrides' ? before.overrides : Object.fromEntries(before[section].map((item) => [item.id, item]))
    const next = section === 'overrides' ? after.overrides : Object.fromEntries(after[section].map((item) => [item.id, item]))
    const ids = [...new Set([...Object.keys(previous), ...Object.keys(next)])].filter((id) => JSON.stringify(previous[id]) !== JSON.stringify(next[id]))
    if (ids.length !== 1 || !next[ids[0]]) return ''
    const a = (previous[ids[0]] ?? {}) as Record<string, unknown>, b = next[ids[0]] as Record<string, unknown>
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]))
    return `${section}:${ids[0]}:${keys.sort().join(',')}`
  }
  return ''
}

export class EditHistory {
  private past: BuildingEdits[] = []
  private future: BuildingEdits[] = []
  private key = ''
  private changedAt = 0
  constructor(public current: BuildingEdits) {}
  get canUndo() { return this.past.length > 0 }
  get canRedo() { return this.future.length > 0 }
  get modelIds() { return new Set([this.current, ...this.past, ...this.future].flatMap((edits) => edits.models.map((model) => model.modelId))) }
  reset(value: BuildingEdits) { this.current = value; this.past = []; this.future = []; this.key = '' }
  change(value: BuildingEdits, now = Date.now()) {
    if (sameBuildingEdits(this.current, value)) return false
    const key = changeKey(this.current, value)
    if (!key || key !== this.key || now - this.changedAt > 500 || this.future.length) {
      this.past.push(this.current)
      if (this.past.length > 100) this.past.shift()
    }
    this.key = key; this.changedAt = now; this.future = []; this.current = value
    return true
  }
  undo() {
    const previous = this.past.pop()
    if (!previous) return null
    this.future.push(this.current); this.current = previous; this.key = ''
    return previous
  }
  redo() {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(this.current); this.current = next; this.key = ''
    return next
  }
}
