// WHAT KEEPS ELEMENTS THAT LEFT THE PAGE ALIVE, read from a saved heap.
//
//   node --max-old-space-size=3500 scripts/who-holds-detached.mjs after.heapsnapshot
//
// The file is the one scripts/measure-long-run.mjs --heap saves, or one saved
// from the Memory tab of the developer tools. Prints each way a detached
// element is still reached from the roots, most elements first, as the chain
// of holders from the element back towards the root.
import fs from 'node:fs';

const snap = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { meta } = snap.snapshot;
const NF = meta.node_fields.length;
const EF = meta.edge_fields.length;
const nType = meta.node_fields.indexOf('type');
const nName = meta.node_fields.indexOf('name');
const nEdges = meta.node_fields.indexOf('edge_count');
const nDetached = meta.node_fields.indexOf('detachedness');
const eType = meta.edge_fields.indexOf('type');
const eName = meta.edge_fields.indexOf('name_or_index');
const eTo = meta.edge_fields.indexOf('to_node');
const edgeTypes = meta.edge_types[0];
const nodeTypes = meta.node_types[0];
const { nodes, edges, strings } = snap;
const count = nodes.length / NF;
if (nDetached < 0) throw new Error('This heap does not say which elements are detached; save it from a newer browser.');
const firstEdge = new Uint32Array(count + 1);
for (let i = 0, e = 0; i < count; i += 1) { firstEdge[i] = e; e += nodes[i * NF + nEdges]; firstEdge[i + 1] = e; }
const nameOf = (i) => strings[nodes[i * NF + nName]];
const typeOf = (i) => nodeTypes[nodes[i * NF + nType]];
const detached = (i) => nodes[i * NF + nDetached] === 2;

// Breadth first from the root, so each chain is a shortest one. A weak edge holds nothing.
const parent = new Int32Array(count).fill(-1);
const via = new Array(count);
const seen = new Uint8Array(count);
const queue = new Int32Array(count);
let head = 0;
let tail = 0;
queue[tail++] = 0;
seen[0] = 1;
while (head < tail) {
  const i = queue[head++];
  for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += 1) {
    const type = edgeTypes[edges[e * EF + eType]];
    if (type === 'weak') continue;
    const to = edges[e * EF + eTo] / NF;
    if (seen[to]) continue;
    seen[to] = 1;
    parent[to] = i;
    via[to] = type === 'element' || type === 'hidden' ? `[${edges[e * EF + eName]}]` : strings[edges[e * EF + eName]];
    queue[tail++] = to;
  }
}

let total = 0;
const ways = new Map();
for (let i = 0; i < count; i += 1) {
  if (!detached(i) || !seen[i]) continue;
  total += 1;
  // Up to the first holder that is still on the page or is not an element at all.
  let top = i;
  while (parent[top] >= 0 && detached(parent[top])) top = parent[top];
  const chain = [];
  for (let at = top, hops = 0; at > 0 && hops < 14; at = parent[at], hops += 1) chain.push(`${via[at]} <- ${typeOf(parent[at])}:${String(nameOf(parent[at])).slice(0, 60)}`);
  const key = `${nameOf(top)} via ${chain.join(' | ')}`;
  const way = ways.get(key) ?? { tops: new Set(), n: 0 };
  way.tops.add(top);
  way.n += 1;
  ways.set(key, way);
}
console.log(`${total} detached elements still held, ${ways.size} ways`);
for (const [key, way] of [...ways].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) console.log(`\n${way.n} elements under ${way.tops.size} detached trees:\n  ${key.replace(/ \| /g, '\n     ')}`);
