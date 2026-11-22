// The permission card hung in mid-air over an opened thread's answer options, well above
// the bottom-right corner. Measured on the screenshot (3420 x 2110, a 1710 px wide window):
// the Reply box's right edge reached about 7 px under the card's left edge, so the card
// stood up over the whole Reply box and covered the options above it. A card that can
// clear the box by giving up a little width now stays in its corner, narrower; only a box
// that reaches far under it still lifts it.
import { describe, expect, it } from 'vitest';
import { cardPlace, CARD_FOOT, CARD_WIDTH, NARROWEST, SIDE_GAP } from '../renderer/src/room-for-the-card.ts';

const VIEW = 900;
const card = { left: 1248, right: 1688, height: 230 };
const replyBox = (right: number) => ({ left: 300, right, top: 820, bottom: 870 });

describe('where the card stands beside a Reply box', () => {
  it('stays in its corner, a little narrower, when the box reaches a few pixels under it', () => {
    expect(cardPlace(card, [replyBox(1255)], VIEW)).toEqual({ lift: CARD_FOOT, width: 1688 - 1255 - SIDE_GAP });
  });

  it('keeps its full width when the box ends short of it', () => {
    expect(cardPlace(card, [replyBox(1240)], VIEW)).toEqual({ lift: CARD_FOOT, width: CARD_WIDTH });
  });

  it('narrows as far as its narrowest and no further', () => {
    const right = 1688 - SIDE_GAP - NARROWEST;
    expect(cardPlace(card, [replyBox(right)], VIEW)).toEqual({ lift: CARD_FOOT, width: NARROWEST });
  });

  it('stands above the box at full width when narrowing would not clear it', () => {
    const right = 1688 - SIDE_GAP - NARROWEST + 1;
    expect(cardPlace(card, [replyBox(right)], VIEW)).toEqual({ lift: VIEW - 820 + 8, width: CARD_WIDTH });
  });

  it('stands above a box that starts under it, however little it reaches', () => {
    expect(cardPlace(card, [{ left: 1300, right: 1400, top: 820, bottom: 870 }], VIEW).lift).toBe(VIEW - 820 + 8);
  });

  it('ignores a box wholly above it', () => {
    expect(cardPlace(card, [{ left: 300, right: 1600, top: 100, bottom: 140 }], VIEW)).toEqual({ lift: CARD_FOOT, width: CARD_WIDTH });
  });
});
