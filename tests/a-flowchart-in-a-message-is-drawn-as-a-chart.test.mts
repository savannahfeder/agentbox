// A FLOWCHART IN A MESSAGE IS DRAWN AS A CHART, NOT AS ITS SOURCE.
//
// Reported 2026-10-09 with a screenshot: a worker explained an engine refactor
// with a Mermaid flowchart (`flowchart TD`, nine boxes, one dotted "Proposed"
// path), and the card showed eleven lines of `A["..."] --> B["..."]` in a grey
// code block. Nothing in the renderer knew the word "mermaid": a search of
// renderer/src for it found zero hits, and the library was not installed.
//
// The decision of WHICH blocks are charts is here, as a pure function, because
// getting it wrong either way costs her: a chart left as source is the bug, and
// a JavaScript block that happens to contain `graph TD` drawn as a broken
// diagram would be a new one.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagramSource } from '../renderer/src/diagram-fence.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');

// The chart from the screenshot, as the worker wrote it.
const REPORTED = [
  'flowchart TD',
  '    A["Your task in Agentbox"] --> B["Existing task runner<br/>Scheduling, folders, delivery"]',
  '    B --> C["Shared engine interface"]',
  '    C --> D["Claude adapter"]',
  '    C --> E["Codex adapter"]',
  '    C -. "Proposed" .-> F["Hermes adapter"]',
].join('\n');

describe('which code blocks are drawn as charts', () => {
  it('draws the reported flowchart when it is tagged mermaid', () => {
    expect(diagramSource('mermaid', REPORTED)).toBe(REPORTED);
  });

  it('draws it when the worker left the block untagged', () => {
    expect(diagramSource(undefined, REPORTED)).toBe(REPORTED);
    expect(diagramSource(undefined, `\n\n${REPORTED}\n`)).toBe(REPORTED);
  });

  it('draws the other chart kinds a worker reaches for, untagged', () => {
    for (const head of ['graph LR', 'graph TD;', 'sequenceDiagram', 'stateDiagram-v2', 'classDiagram', 'erDiagram', 'gantt', 'pie title Pets', 'mindmap', 'timeline']) {
      expect(diagramSource(undefined, `${head}\n  a`), head).not.toBeNull();
    }
  });

  it('ignores the case of the tag', () => {
    expect(diagramSource('Mermaid', REPORTED)).toBe(REPORTED);
  });

  it('leaves a block tagged as another language alone, whatever it says', () => {
    expect(diagramSource('js', 'graph TD\nconst a = 1;')).toBeNull();
    expect(diagramSource('text', REPORTED)).toBeNull();
  });

  it('leaves untagged words alone when they only start like a chart', () => {
    expect(diagramSource(undefined, 'graph of the results shows a drop')).toBeNull();
    expect(diagramSource(undefined, 'flowcharts are not rendering')).toBeNull();
    expect(diagramSource(undefined, 'npm run build\nflowchart TD')).toBeNull();
    expect(diagramSource(undefined, '')).toBeNull();
  });

  it('draws nothing for an empty mermaid block', () => {
    expect(diagramSource('mermaid', '   \n')).toBeNull();
  });
});

describe('how the card draws one', () => {
  const focus = read('renderer', 'src', 'components', 'Focus.tsx');
  const block = read('renderer', 'src', 'components', 'DiagramBlock.tsx');

  it('sends every fenced block through the chart check', () => {
    expect(focus).toMatch(/diagramSource\(/);
    expect(focus).toMatch(/<DiagramBlock\b/);
  });

  it('loads the chart library only when a chart is on screen', () => {
    // It is about a megabyte; a static import would put it in every window.
    expect(block).not.toMatch(/^import\s[^;]*from\s+['"]mermaid['"]/m);
    expect(block).toMatch(/import\(\s*['"]mermaid['"]\s*\)/);
  });

  it('runs the library in its strict mode, so a chart cannot carry script', () => {
    expect(block).toMatch(/securityLevel:\s*['"]strict['"]/);
  });

  it('falls back to the source when a chart will not draw', () => {
    expect(block).toMatch(/\.catch\(\(\) => \{ if \(live\) setFailed\(true\)/);
    expect(block).toMatch(/if \(failed\) return <>\{fallback\}<\/>/);
    expect(focus).toMatch(/fallback=\{<CodePre>/);
  });
});
