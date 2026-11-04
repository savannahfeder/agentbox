export type SlideBox = { x: number; y: number; w: number; h: number } | null;
export type SlidePart =
  | { kind: 'picture'; file: string; box: SlideBox }
  | { kind: 'words'; title: boolean; box: SlideBox; paragraphs: { text: string; pt: number | null }[] };
export type Deck = { size: { w: number; h: number }; slides: SlidePart[][]; picture: (file: string) => Promise<Uint8Array | null> };
type Inflate = (bytes: Uint8Array) => Promise<Uint8Array>;
export function zipEntries(bytes: Uint8Array, inflate: Inflate): Map<string, () => Promise<Uint8Array>>;
export function readSlide(xml: string, rels: Map<string | null, string>, size?: { w: number; h: number }): SlidePart[];
export function readDeck(bytes: Uint8Array, inflate: Inflate): Promise<Deck>;
