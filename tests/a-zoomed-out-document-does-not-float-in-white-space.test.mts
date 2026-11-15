// Zoomed out, a markdown file beside a thread sat in a sea of white. Zooming
// out makes the pane wider in page pixels, so past 1060px it took the layout
// with the full contents list, which kept the text at 700px and centred it,
// leaving the left margin as wide as the list. Measured in the built app with
// the pane beside a thread: 1130px wide at actual size gave 215px of margin on
// each side, 1248px one step out gave 274px. The text now grows to the same
// 820px the narrower pane uses, the list keeps its own column on the right, and
// the left margin only grows once the text is at full width.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = fs.readFileSync(path.join(root, 'renderer/src/components/doc-reading.css'), 'utf8')

const wide = css.slice(0, css.indexOf('@container'))
const sheet = wide.match(/\.doc-sheet \{([^}]*)\}/)[1]
const cols = sheet.match(/grid-template-columns:\s*([^;]+);/)[1].trim()
const gap = Number(sheet.match(/column-gap:\s*(\d+)px/)[1])

// Lays out `minmax(Lpx, 1fr) minmax(0, Cpx) minmax(Rpx, 1fr)` the way the grid
// does: the capped middle track fills first, then the fr tracks share what is
// left, each held at its minimum.
function layout(width) {
  const m = cols.match(/^minmax\((\d+)px, 1fr\) minmax\(0, (\d+)px\) minmax\((\d+)px, 1fr\)$/)
  if (!m) throw new Error(`unexpected columns: ${cols}`)
  const [minL, cap, minR] = m.slice(1).map(Number)
  const free = width - 2 * gap
  const column = Math.max(0, Math.min(cap, free - minL - minR))
  const rest = free - column
  let left = rest / 2, right = rest / 2
  if (right < minR) { right = minR; left = rest - minR }
  if (left < minL) { left = minL; right = rest - minL }
  return { column, left: left + gap, right: right + gap, list: right }
}

describe('a zoomed-out document does not float in white space', () => {
  it('fills the 1130px pane from the report instead of leaving 215px either side', () => {
    const { column, left } = layout(1130)
    expect(column).toBeGreaterThan(760)
    expect(left).toBeLessThanOrEqual(100)
  })

  it('stays at full width one step zoomed out, at 1248px', () => {
    const { column, left } = layout(1248)
    expect(column).toBe(820)
    expect(left).toBeLessThan(200)
  })

  it('keeps the full contents list its room in the narrowest wide pane', () => {
    expect(layout(1061).list).toBeGreaterThanOrEqual(220)
  })

  it('centres the text again when the pane is wide enough for both', () => {
    const { left, right } = layout(1700)
    expect(left).toBe(right)
  })

  it('still caps the line length in a very wide pane', () => {
    expect(layout(2400).column).toBe(820)
  })
})
