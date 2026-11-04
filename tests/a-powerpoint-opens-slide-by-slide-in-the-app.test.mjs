// A POWERPOINT OPENS SLIDE BY SLIDE IN THE APP.
//
// A .pptx on a thread was handed to the operating system: no view, no comment on
// slide 3, and on a machine with no PowerPoint a click that did nothing. Measured
// with reviewKind and servable: neither the view nor the window could read one.
import { it, expect, describe } from 'vitest';
import zlib from 'node:zlib';
import { readDeck, readSlide } from '../shared/pptx-slides.mjs';
import { reviewKind } from '../shared/artifact-marks.mjs';
import { servable } from '../main/img-scheme.mjs';

function zip(files) {
  const parts = [];
  const central = [];
  let at = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.isBuffer(text) ? text : Buffer.from(text);
    const packed = zlib.deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nameBytes.length, 28); c.writeUInt32LE(at, 42);
    central.push(c, nameBytes);
    at += 30 + nameBytes.length + packed.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(at, 16);
  return new Uint8Array(Buffer.concat([...parts, centralBytes, end]));
}
const inflate = async (b) => new Uint8Array(zlib.inflateRawSync(Buffer.from(b)));

const title = (words) => `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="685800"/><a:ext cx="7315200" cy="1143000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:rPr sz="4000"/><a:t>${words}</a:t></a:r></a:p></p:txBody></p:sp>`;
const pic = '<p:pic><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="3429000"/><a:ext cx="4572000" cy="3429000"/></a:xfrm></p:spPr></p:pic>';

const DECK = zip({
  'ppt/presentation.xml': '<p:presentation><p:sldSz cx="9144000" cy="6858000"/></p:presentation>',
  'ppt/slides/slide10.xml': `<p:sld>${title('Ten')}</p:sld>`,
  'ppt/slides/slide2.xml': `<p:sld>${title('Two &amp; more')}${pic}</p:sld>`,
  'ppt/slides/slide1.xml': `<p:sld>${title('One')}</p:sld>`,
  'ppt/slides/_rels/slide2.xml.rels': '<Relationships><Relationship Id="rId2" Target="../media/image1.png"/></Relationships>',
  'ppt/media/image1.png': Buffer.from('PNGBYTES'),
});

describe('reading a deck', () => {
  it('finds every slide in order, ten after two', async () => {
    const deck = await readDeck(DECK, inflate);
    expect(deck.slides.map((s) => s[0].paragraphs[0].text)).toEqual(['One', 'Two & more', 'Ten']);
  });
  it('places a box as a part of the slide and keeps its size', async () => {
    const [first] = (await readDeck(DECK, inflate)).slides;
    expect(first[0].box.x).toBeCloseTo(0.1);
    expect(first[0].title).toBe(true);
    expect(first[0].paragraphs[0].pt).toBe(40);
  });
  it('reads a picture out of the file', async () => {
    const deck = await readDeck(DECK, inflate);
    const part = deck.slides[1].find((p) => p.kind === 'picture');
    expect(part.file).toBe('ppt/media/image1.png');
    expect(Buffer.from(await deck.picture(part.file)).toString()).toBe('PNGBYTES');
  });
  it('leaves out an empty box and a picture it cannot find', () => {
    expect(readSlide('<p:sp><p:txBody><a:p><a:r><a:t>  </a:t></a:r></a:p></p:txBody></p:sp>', new Map())).toEqual([]);
    expect(readSlide(pic, new Map())).toEqual([]);
  });
  it('says a file that is not a deck is not one', async () => {
    await expect(readDeck(new Uint8Array(Buffer.from('not a zip at all, not even close')), inflate)).rejects.toThrow();
  });
});

describe('what the window may open', () => {
  it('opens a pptx big and may load it, and still not an old binary ppt', () => {
    expect(reviewKind('attachments/a-b-deck.pptx')).toBe('deck');
    expect(reviewKind('deck.ppt')).toBeNull();
    expect(servable('/root/deck.pptx', ['/root'])).toBe(true);
    expect(servable('/elsewhere/deck.pptx', ['/root'])).toBe(false);
  });
});
