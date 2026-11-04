// The divider sits on the file's own left edge.
//
// What broke: the drag area was pinned to the pane's left side, but the file
// is drawn as a card 12 points in from it. So the hover line and its pill lit
// up in the gap, 12 points left of the file's own border, and you had to aim
// at empty space to resize. Measured in the running renderer (fixtures, a
// markdown file open beside): grip line at x=482, card edge at x=494.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8')
const pane = fs.readFileSync(path.join(root, 'renderer/src/components/DocPane.tsx'), 'utf8')

describe('the divider sits on the file\'s own edge', () => {
  it('places the grip at the card\'s measured left edge, not the pane\'s', () => {
    const grip = css.match(/\n\.doc-grip \{[^}]*\}/)[0]
    expect(grip).toContain('left: calc(var(--doc-card-x, 0px) - 4px)')
    expect(grip).not.toMatch(/left: -4px/)
    expect(pane).toMatch(/'--doc-card-x': `\$\{cardX\}px`/)
    expect(pane).toMatch(/offsetLeft/)
  })

  it('keeps the drag under the pointer by taking the inset off', () => {
    expect(pane).toMatch(/e\.clientX - body\.left - cardX/)
  })

  // Their pick on 2026-11-04: option five's faint pill on the edge, but only
  // while the pointer is on it or a drag is under way. At rest the file
  // looks as it always did, and the edge itself does not light up.
  it('shows the faint pill on the edge only on hover or while dragging', () => {
    const pill = css.match(/\.doc-grip::after \{[^}]*\}/)[0]
    expect(pill).toContain('background: var(--line-strong)')
    expect(pill).toContain('opacity: 0')
    expect(pill).toContain('left: 1px')
    expect(css).toMatch(/\.doc-grip:hover::after, \.doc-pane\.dragging \.doc-grip::after \{ opacity: 1; \}/)
    expect(css).not.toMatch(/\.doc-grip:hover::before/)
    expect(css).not.toMatch(/\.doc-pane\.dragging \.doc-grip::before/)
  })
})
