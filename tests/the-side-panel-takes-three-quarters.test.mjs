// THE SIDE PANEL TAKES THREE QUARTERS, WITH NO LINE DOWN THE MIDDLE. /,
// 2026-08-22.
//
// Her pick, verbatim:
//
// This file replaces the one that held the OPTION SET together. Rounds four and
// five drew eight screens for a task with a file open, five of them offered;
// she took `roomy`, and the other seven are deleted rather than hidden, because
// anything still switchable is something she has to decide again. Their wording
// and their measurements are in decisions.md under "round five", which is the
// only copy of them now.
//
// SO WHAT THIS FILE DOES IS THE OPPOSITE OF WHAT IT DID. It used to prove the
// losers were safe to keep and easy to delete. It now holds the door shut on
// them coming back, and pins the three things her two sentences ask for: the
// fraction it opens on, the line that is not drawn, and the drag that did not
// go anywhere.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  OPENING_SPLIT, MIN_SPLIT, MAX_SPLIT, EVEN_SPLIT,
  clampSplit, splitFromPointer, readSplit, writeSplit, SPLIT_KEY,
} from '../renderer/src/doc-pane.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8')
const src = (f) => fs.readFileSync(path.join(root, 'renderer/src', f), 'utf8')

describe('three quarters, and no line down the middle', () => {
  it('opens the file on three quarters of the window', () => {
    // The number IS the option, so it is pinned rather than derived. 0.72 and
    // not 0.75: opening exactly on MAX_SPLIT leaves her first drag able to go
    // one way only, which reads as a divider that is stuck.
    expect(OPENING_SPLIT).toBe(0.72)
    expect(OPENING_SPLIT).toBeGreaterThan(EVEN_SPLIT)
    expect(OPENING_SPLIT).toBeGreaterThan(MIN_SPLIT)
    expect(OPENING_SPLIT).toBeLessThan(MAX_SPLIT)
  })

  it('draws nothing down the middle until the pointer finds it', () => {
    // The line is `.doc-grip::before`. Only the line went.
    const line = css.match(/\.doc-grip::before \{[^}]*\}/)
    expect(line).toBeTruthy()
    expect(line[0]).toContain('background: transparent')
    expect(line[0]).not.toContain('var(--line-strong)')
    // It comes back under the pointer, or a divider with no state at all
    // cannot be found by feel.
    expect(css).toMatch(/\.doc-grip:hover::before \{ background: var\(--text-faint\); \}/)
  })

  it('keeps the reach and the handle that make the divider findable', () => {
    // is her second sentence, and the two things that make the drag reachable
    // are hers from 2026-08-21: a 9 point hit area over a 1 point line, and a
    // capsule handle on hover.
    const grip = css.match(/\n\.doc-grip \{[^}]*\}/)
    expect(grip[0]).toContain('width: 9px')
    expect(grip[0]).toContain('cursor: col-resize')
    expect(css).toContain('.doc-grip::after')
    expect(css).toMatch(/\.doc-grip:hover::after, \.doc-pane\.dragging \.doc-grip::after \{ opacity: 1; \}/)
  })

  it('leaves the travel in both directions exactly where it was', () => {
    // The floors are unchanged from the even split she had, so nothing about
    // dragging is different; three quarters is only where it opens.
    expect(MIN_SPLIT).toBe(0.25)
    expect(MAX_SPLIT).toBe(0.75)
    expect(clampSplit(0.9)).toBe(MAX_SPLIT)
    expect(clampSplit(0.1)).toBe(MIN_SPLIT)
    expect(splitFromPointer(400, 1600)).toBeCloseTo(0.75, 5)
    expect(splitFromPointer(1200, 1600)).toBeCloseTo(0.25, 5)
  })

  it('lets what she dragged outrank where it opens', () => {
    // An unset key is the only case that takes the opening fraction. A window
    // she has already sized is a window she has already answered this on.
    const store = new Map()
    const fake = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
    expect(readSplit(fake)).toBe(OPENING_SPLIT)
    expect(readSplit(null)).toBe(OPENING_SPLIT)
    writeSplit(fake, 0.41)
    expect(store.get(SPLIT_KEY)).toBe('0.41')
    expect(readSplit(fake)).toBe(0.41)
    // Garbage in the key is no preference, not a third state, so it lands where
    // an unset key lands rather than back on the even split she no longer has.
    store.set(SPLIT_KEY, 'three quarters')
    expect(readSplit(fake)).toBe(OPENING_SPLIT)
  })

  it('puts the divider back where it opens, not back to a half', () => {
    // The reset on the divider is a double click (DocPane.tsx). It used to go
    // to 0.5, which was where the pane opened; since her pick that is a fifth
    // position she would have to know about rather than a reset.
    const pane = src('components/DocPane.tsx')
    expect(pane).toContain('onDoubleClick={() => onSplit(OPENING_SPLIT)}')
    expect(pane).not.toContain('onSplit(0.5)')
  })

  it('has no layout switch left anywhere in the app', () => {
    // The whole point of the deletion: there is nothing left to choose, so
    // there is no attribute, no stored key and no module. A later round that
    // wants to offer layouts again writes a new one deliberately rather than
    // finding this one still wired up.
    expect(fs.existsSync(path.join(root, 'renderer/src/doc-layout.ts'))).toBe(false)
    expect(css).not.toMatch(/\[data-doc-layout=/)
    for (const f of ['App.tsx', 'main.tsx', 'doc-pane.ts', 'styles.css']) {
      expect(src(f)).not.toContain('docLayout')
      expect(src(f)).not.toContain('zero.docLayout')
    }
  })

  it('does not leave one of the four she turned down still drawable', () => {
    // Named one by one rather than by pattern, because a rule that survives
    // under a different selector is exactly what a pattern would miss. Each of
    // these was a whole layout; none of their rules may still be reachable.
    for (const dead of ['onecard', 'stacked', 'quiet', 'edge', 'wide', 'column', 'roomy', 'today']) {
      expect(css).not.toContain(`data-doc-layout="${dead}"`)
    }
    // `column` capped the file's words at a reading column and `wide` and
    // `edge` took the card off. Both are gone as behaviour, not just as a name.
    expect(css).not.toMatch(/\.doc-rich \.ProseMirror \{[^}]*max-width/)
    const card = css.match(/\n\.doc-card \{[^}]*\}/)
    expect(card[0]).toContain('margin: 14px 16px 16px 14px')
  })

  it('leaves the light bar as the plain rule, with no way back to charcoal', () => {
    // It shipped as her instruction rather than as an option, and
    // `data-doc-bar="held"` existed for one round so the before and after could
    // be one picture. She has seen it and answered the round.
    expect(css).toContain(':root:not([data-theme="light"]) .doc-pane.doc-html {')
    expect(css).not.toContain('[data-doc-bar="held"] .doc-pane')
    expect(src('main.tsx')).not.toContain('applyDocBar')
  })

  it('changes the panel and nothing above it', () => {
    // The side panel block is about the split and the divider, so it may not
    // reach for the bar or the way out. It used to say .back-esc could not
    // appear anywhere below this heading either, which stopped being true when
    // her 2026-08-22 pick put that control back: the slice ran to the end of
    // the file and swept in a later round's rules. Bounded to this block now,
    // which is what the rule was always about.
    const from = css.indexOf('THE SIDE PANEL TAKES THREE QUARTERS')
    const next = css.indexOf('/* ======', from + 40)
    const block = css.slice(from, next === -1 ? css.length : next)
    expect(block).not.toContain('.topbar ')
    expect(block).not.toContain('.back-esc')
  })
})
