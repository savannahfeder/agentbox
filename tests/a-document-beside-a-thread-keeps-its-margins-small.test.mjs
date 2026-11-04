// A markdown file open beside a thread wasted a third of its pane on margins.
// Measured in the built app at a 1710px window with the pane 1040px wide: a
// 700px text column with 170px of empty space either side. The column now
// grows to 820px in a pane too narrow for the full contents list, so those
// margins are 110px. The wider panes, with the contents list, are held by
// tests/a-zoomed-out-document-does-not-float-in-white-space.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = fs.readFileSync(path.join(root, 'renderer/src/components/doc-reading.css'), 'utf8')

function sheetRules(block) {
  const rule = block.match(/\.doc-sheet \{([^}]*)\}/)[1]
  const cols = rule.match(/grid-template-columns:\s*([^;]+);/)[1].trim()
  const gap = Number((rule.match(/column-gap:\s*(\d+)px/) ?? [0, 0])[1])
  return { cols, gap }
}

function containerBlock(max) {
  const at = css.indexOf(`@container (max-width: ${max}px)`)
  expect(at).toBeGreaterThan(-1)
  const open = css.indexOf('{', at)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error('unclosed block')
}

// Lays out `minmax(Apx|0, 1fr) minmax(0, Bpx) minmax(Apx|0, 1fr)` the way the
// grid does for a pane of `width` with no side padding.
function layout({ cols, gap }, width) {
  const m = cols.match(/^minmax\((\d+)(?:px)?, 1fr\) minmax\(0, (\d+)px\) minmax\((\d+)(?:px)?, 1fr\)$/)
  if (!m) throw new Error(`unexpected columns: ${cols}`)
  const [side, cap] = [Number(m[1]), Number(m[2])]
  const column = Math.max(0, Math.min(cap, width - 2 * side - 2 * gap))
  return { column, margin: (width - column) / 2 }
}

const middle = sheetRules(containerBlock(1060))

describe('a document beside a thread keeps its margins small', () => {
  it('uses most of the 1040px pane from the report', () => {
    const { column, margin } = layout(middle, 1040)
    expect(column).toBe(820)
    expect(margin).toBe(110)
  })

  it('still caps the line length at the top of the narrow range', () => {
    expect(layout(middle, 1060).column).toBe(820)
  })

  it('keeps a real margin in a narrower pane', () => {
    const { column, margin } = layout(middle, 776)
    expect(margin).toBe(48)
    expect(column).toBe(680)
  })
})
