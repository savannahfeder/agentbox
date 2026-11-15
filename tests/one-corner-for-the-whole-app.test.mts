/*
 * ONE CORNER FOR THE WHOLE APP.
 *
 * The rule started with an exception for two cards, and after living with the
 * merged build HALF the exception was retired. The inbox's own card takes
 * var(--radius) like everything else. The reply card is the other half of the
 * exception, and it stays at 0 until that is changed on purpose.
 *
 * Before this there were TEN different corner sizes on one opened task at the
 * same time, measured in the running app. The failure mode this file guards is
 * not "somebody typed the wrong number" — it is the slow one: a future session
 * adds a control with its own 8px because that is what the rule beside it said,
 * and a year later there are ten again. So the assertion is not on any single
 * rule, it is on the WHOLE FILE: every corner in the app is the token, 0, a
 * circle, or on the short list of shapes that are deliberately not rectangles.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(root, 'renderer/src/styles.css'), 'utf8')

/*
 * The shapes that are not corners, and why each one is allowed to stay round.
   A new entry here is a real decision and should be argued for on a work item,
   not added to make a test pass. */
const NOT_A_CORNER = [
  '50%',              // true circles: status dots, avatars, the switch knob
  '22px',             // the settings switch TRACK — a capsule is that control's shape
  '1.5px 3px 1.5px 1.5px', // the attached-file glyph, a drawn mark and not a box
  '1px',              // the priority bars, 3px wide
  '2px',              // the compose caret, 2px wide
  '10px',             // two things: *::-webkit-scrollbar-thumb, which is browser
                      // chrome rather than a component, and the DOCUMENT CARD,
                      // whose corner was picked as card one of eleven in a
                      // design round. It is pinned by name
                      // in tests/theme-tokens.test.mts so it cannot drift to 8
                      // or 16.
  '5px',              // ::-webkit-scrollbar-thumb, same
  '12px',             // THE WALK'S COACHING CARD, `.fr-tether`, picked out of five.
                      // It is the one thing in the app that floats free over
                      // the window with a shadow under it and nothing holding
                      // its edges, so it is a card in the sense the document
                      // card is, not a panel. Argued on, not added to pass a
                      // test.
]

function radiiIn(text) {
  return [...text.matchAll(/border-radius:\s*([^;}]+)[;}]/g)].map((m) => m[1].trim())
}

/*
 * The rule for a selector as it is written at the START of a line, so that
   `.app.flat .rail { }` cannot answer a question asked about `.rail { }`. */
function ruleFor(sel) {
  const m = css.match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`))
  return m && m[0]
}

describe('one corner for the whole app', () => {
  it('defines the corner exactly once, as the small artifact corner', () => {
    // It was 3px and read as square beside round faces and soft tiles (2026-10-31,
    // tests/buttons-chips-cards-and-menus-are-soft-and-an-ai-teammate-is-round).
    expect(css).toMatch(/--radius:\s*var\(--artifact-corner-small\);/)
    // NO THEME SQUARES IT. Ember Grid turned it to 0px for the launch film's
    // look, which left square buttons inside round cards; the owner, 2026-11-02:
    // "You've changed everything so that it is rounded so just keep that
    // consistent throughout."
    const grid = css.slice(css.indexOf(':root[data-skin="ember-grid"] {'))
    expect(grid.slice(0, grid.indexOf('\n}'))).not.toMatch(/--radius:/)
    expect(css.match(/--radius:\s*[^;]+;/g)).toHaveLength(1)
  })

  it('leaves no loose number anywhere in the stylesheet', () => {
    const loose = radiiIn(css).filter(
      // --tag-radius is the token tags name
      // (tests/the-threads-header-is-quieter-and-every-tag-names-one-corner.test.mts).
      (v) => v !== 'var(--radius)' && v !== 'var(--tag-radius)' && v !== 'var(--artifact-corner)' && v !== 'var(--artifact-corner-small)' && v !== '0' && !NOT_A_CORNER.includes(v) &&
             v !== '0 0 var(--radius) var(--radius)' && v !== 'var(--radius) var(--radius) 0 0',
    )
    // If this fails it prints the offenders, which is the whole point.
    expect(loose).toEqual([])
  })

  it('gives the inbox card the standard corner, which she asked for second', () => {
    // The list pane is the only surface on that page that paints a box, so it
    // is the whole of the change.
    expect(ruleFor('.list-pane')).toMatch(/border-radius:\s*var\(--radius\)/)
  })

  it('leaves the surfaces that paint no box at 0, because they have no corner', () => {
    // A tab has no background and no border in any state; the panel is
    // transparent with no shadow. Their radius would be a declaration about a
    // box that is not drawn, so it stays 0 and this is not the old exception.
    for (const sel of ['.tab', '.rail']) {
      const rule = ruleFor(sel)
      expect(rule, `${sel} has no rule`).toBeTruthy()
      expect(rule, `${sel} must stay at 0`).toMatch(/border-radius:\s*0/)
      // The reason has to hold, not just the value: if either of these ever
      // paints a box, this test fails and the box gets var(--radius).
      expect(rule, `${sel} must paint no box`).toMatch(/background:\s*(none|transparent)/)
    }
    // Fullscreen has no card at all. A corner on a full-bleed pane rounds the
    // window's own edges, which is a bug and not a taste call.
    expect(css).toMatch(/\.app\.flat \.list-pane\.pinned \{[^}]*border-radius:\s*0/)
  })

  it('does not move the cards she settled separately, on their own yeses', () => {
    // Not the inbox page and not part of that change: the ⌘K and new-task card
    // and the project shelf card. `.shelf-card` was the second of those and it
    // went with the inbox-zero shelf, so there is no rule left to hold at 0.
    for (const sel of ['.modal']) {
      const rule = ruleFor(sel)
      expect(rule, `${sel} has no rule`).toBeTruthy()
      expect(rule, `${sel} must stay at 0`).toMatch(/border-radius:\s*0/)
    }
  })

  it('keeps the reply card and its parts at 0, not at the standard', () => {
    // The Send button and the key chips live inside the reply card, so they go
    // with it. The second change covered the inbox page and not this, so this
    // half of the exception stands. One line each to change if it is retired.
    for (const sel of ['.dock-card', '.dock-send']) {
      const rule = ruleFor(sel)
      expect(rule, `${sel} has no rule`).toBeTruthy()
      expect(rule, `${sel} must stay at 0`).toMatch(/border-radius:\s*0/)
    }
    // The key chip in the reply box takes the corner like every other chip
    // since 2026-11-02; the card and Send are rounded in soft-corners.css.
    expect(ruleFor('.focus-dock kbd')).toMatch(/border-radius:\s*var\(--radius\)/)
  })

  it('never paints a solid ink around the reply card again', () => {
    // The actual problem: the border was repainted in --text-faint
    // on focus, 4.10:1 against the card, as much contrast as body text. A
    // hairline at rest, one step up while typing, and nothing stronger.
    const card = ruleFor('.dock-card')
    const typing = ruleFor('.dock-card:focus-within')
    expect(card).toMatch(/border:\s*1px solid var\(--line\)/)
    expect(typing).toMatch(/border-color:\s*var\(--line-strong\)/)
    expect(typing).not.toMatch(/--text-faint/)
    // Focus reads as the card lifting to the white of the page instead.
    expect(typing).toMatch(/background:\s*var\(--surface\)/)
  })

  it('gives pictures their own token, because "the artifacts themselves would do cleaner with rounded corners"', () => {
    // This test used to hold pictures at 0. The owner reversed that in 2026-10,
    // and tests/a-persons-face-is-drawn-by-the-one-component holds the rest.
    expect(ruleFor('.inline-image')).toMatch(/border-radius:\s*var\(--artifact-corner\)/)
    expect(ruleFor('.attach-thumb img')).toMatch(/border-radius:\s*var\(--artifact-corner-small\)/)
  })
})
