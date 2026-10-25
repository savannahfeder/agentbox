// Beside the phone website, the phone app's summary was drawn a size up all
// over: its title at 17px where the website's `.ts-title` is 16px, the context
// at 15px where `.ts-line` is 13.5px on 21px, the rows' labels and values at
// 15px where `.ts-label` is 13px and `.ts-value` 13.5px, both on 20px, and on
// the dotted wall where `.ts-panel` is plain `--bg`. Read off the website's
// computed styles on a photograph of each. Its rows were also 38px apart where
// `.ts-props` sets 20px rows 14px apart, 22px under `.ts-rule`, and its title
// sat 5px high: `.ts-panel` pads 20px 16px 40px.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');
const summary = src.slice(src.indexOf('function Summary('), src.indexOf('\n}\n', src.indexOf('function Summary(')));

describe("the phone app's summary is drawn at the website's sizes", () => {
  it('titles it at 16px on 22px', () => expect(summary).toMatch(/fontSize: 16, lineHeight: 22, letterSpacing: -0\.16, fontFamily: font\.medium/));
  it('heads each part at 10.5px', () => expect(summary).toMatch(/fontFamily: font\.mono, fontSize: 10\.5, letterSpacing: 0\.84/));
  it('reads the context and the steps at 13.5px on 21px', () => expect(summary.match(/fontSize: 13\.5, lineHeight: 21, color: color\.dim/g)?.length).toBe(2));
  it("labels its rows at 13px and gives their values 13.5px, on 20px", () => {
    expect(summary).toMatch(/width: 92, fontSize: 13, lineHeight: 20, color: color\.faint/);
    expect(summary).not.toMatch(/<T style=\{\{ fontSize: 15 \}\}>/);
    expect(summary).toMatch(/fontSize: 13\.5, lineHeight: 20 \}/);
  });
  it('sits on the plain ground, not the dotted wall', () => {
    expect(summary).not.toMatch(/<Wall>/);
    expect(summary).toMatch(/backgroundColor: color\.bg/);
  });

  it("spaces its rows and its edges as `.ts-props` and `.ts-panel` do", () => {
    expect(summary).toMatch(/alignItems: 'center', minHeight: 20 \}/);
    expect(summary).toMatch(/paddingTop: 22, marginTop: 28, gap: 14 \}/);
    expect(summary).toMatch(/paddingTop: 21, paddingBottom: 40 \+ inset\.bottom/);
  });
});
