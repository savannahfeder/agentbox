#!/usr/bin/env python3
"""Names the function each pending timer in a V8 heap snapshot will call.

A timer keeps whatever its callback can reach, so thousands pending from one
file is a leak: 3,325 of 3,820 came from the folder walk on 2026-11-22 and
held 176 MB between them. Streams the snapshot: the node table once, the edge
table three times (timer -> its callback, callback -> its function record,
function record -> its script). A 400 MB snapshot took 670 MB and 22 seconds,
so check free memory first.

Needs numpy.

Usage: heap-snapshot-timers.py <file.heapsnapshot>
"""
import json
import re
import sys
import warnings
from collections import Counter

import numpy as np

warnings.simplefilter('ignore')
path = sys.argv[1]
CHUNK = 4 << 20

f = open(path, 'rb')
head = f.read(1 << 16)
nodes_at = head.index(b'"nodes":[') + len(b'"nodes":[')
meta = json.loads(head[head.index(b'{"meta"'):head.index(b'"nodes":[')].rstrip(b',\n '))
m = meta['meta']
NF, EF = len(m['node_fields']), len(m['edge_fields'])
N, E = meta['node_count'], meta['edge_count']
node_types, edge_types = m['node_types'][0], m['edge_types'][0]
I_TYPE, I_NAME, I_SIZE, I_EC = (m['node_fields'].index(x) for x in ('type', 'name', 'self_size', 'edge_count'))


def find(mark):
    f.seek(0)
    offset, carry = 0, b''
    while True:
        chunk = f.read(CHUNK)
        if not chunk:
            return -1
        data = carry + chunk
        i = data.find(mark)
        if i != -1:
            return offset - len(carry) + i + len(mark)
        carry = data[-len(mark):]
        offset += len(chunk)


def ints(at):
    """Yields numpy arrays of the ints of the array starting at a file offset."""
    f.seek(at)
    carry = b''
    while True:
        chunk = f.read(CHUNK)
        if not chunk:
            return
        data = carry + chunk
        end = data.find(b']')
        if end != -1:
            yield np.fromstring(data[:end].decode('ascii'), dtype=np.int64, sep=',')
            return
        cut = data.rfind(b',')
        carry = data[cut + 1:]
        yield np.fromstring(data[:cut].decode('ascii'), dtype=np.int64, sep=',')


ntype = np.empty(N, dtype=np.int8)
nname = np.empty(N, dtype=np.int32)
ecount = np.empty(N, dtype=np.int32)
got = 0
left = np.empty(0, dtype=np.int64)
for part in ints(nodes_at):
    part = np.concatenate([left, part])
    whole = (len(part) // NF) * NF
    rows = part[:whole].reshape(-1, NF)
    left = part[whole:]
    n = len(rows)
    ntype[got:got + n] = rows[:, I_TYPE]
    nname[got:got + n] = rows[:, I_NAME]
    ecount[got:got + n] = rows[:, I_EC]
    got += n
assert got == N, (got, N)
first_edge = np.zeros(N + 1, dtype=np.int64)
np.cumsum(ecount, out=first_edge[1:])
edges_at = find(b'"edges":[')
strings_at = find(b'"strings":[')


def strings(need):
    f.seek(strings_at)
    pat = re.compile(rb'"((?:[^"\\]|\\.)*)"')
    out, carry, idx, last = {}, b'', 0, max(need)
    while idx <= last:
        chunk = f.read(CHUNK)
        if not chunk:
            break
        data = carry + chunk
        end = 0
        for mm in pat.finditer(data):
            if mm.end() >= len(data) - 1 and len(chunk) == CHUNK:
                break
            if idx in need:
                out[idx] = mm.group(1)[:160].decode('utf8', 'replace')
            idx += 1
            end = mm.end()
            if idx > last:
                break
        carry = data[end:]
    return out


def edges_of(sources):
    """Every edge leaving the given nodes: (source, type, name_or_index, to)."""
    mask = np.zeros(E, dtype=bool)
    owner = {}
    for s in sources:
        mask[first_edge[s]:first_edge[s + 1]] = True
    src_sorted = np.array(sorted(sources), dtype=np.int64)
    starts = first_edge[src_sorted]
    out = []
    at = 0
    left = np.empty(0, dtype=np.int64)
    for part in ints(edges_at):
        part = np.concatenate([left, part])
        whole = (len(part) // EF) * EF
        rows = part[:whole].reshape(-1, EF)
        left = part[whole:]
        n = len(rows)
        keep = mask[at:at + n]
        if keep.any():
            idx = np.nonzero(keep)[0]
            who = src_sorted[np.searchsorted(starts, idx + at, side='right') - 1]
            for i, w in zip(idx, who):
                out.append((int(w), int(rows[i, 0]), int(rows[i, 1]), int(rows[i, 2]) // NF))
        at += n
    return out


OBJECT = node_types.index('object')
# Every node name is a string index: find the one for "Timeout" among objects.
cand = Counter(nname[ntype == OBJECT].tolist()).most_common(4000)
names = strings({n for n, _ in cand})
timeout_names = [n for n, _ in cand if names.get(n) == 'Timeout']
timers = np.nonzero((ntype == OBJECT) & np.isin(nname, timeout_names))[0].tolist()
print(f"{len(timers):,} timers pending")

e1 = edges_of(timers)
field = strings({e[2] for e in e1 if e[1] in (edge_types.index('property'), edge_types.index('internal'))})
PROP = edge_types.index('property')
callback = {}
for src, t, name, to in e1:
    if t == PROP and field.get(name) == '_onTimeout':
        callback[src] = to
closures = set(callback.values())
print(f"{len(closures):,} different callbacks")

e2 = edges_of(closures)
f2 = strings({e[2] for e in e2 if e[1] != edge_types.index('element') and e[1] != edge_types.index('hidden')})
shared = {src: to for src, t, name, to in e2 if f2.get(name) == 'shared'}
e3 = edges_of(set(shared.values()))
f3 = strings({e[2] for e in e3 if e[1] != edge_types.index('element') and e[1] != edge_types.index('hidden')})
script = {src: to for src, t, name, to in e3 if f3.get(name) == 'script'}

# Where each callback is in its script.
loc_at = find(b'"locations":[')
loc = {}
want = np.array(sorted(c * NF for c in closures), dtype=np.int64)
left = np.empty(0, dtype=np.int64)
for part in ints(loc_at):
    part = np.concatenate([left, part])
    whole = (len(part) // 4) * 4
    rows = part[:whole].reshape(-1, 4)
    left = part[whole:]
    hit = np.isin(rows[:, 0], want)
    for r in rows[hit]:
        loc[int(r[0]) // NF] = (int(r[2]) + 1, int(r[3]) + 1)

need = set()
for c in closures:
    need.add(int(nname[c]))
    s = script.get(shared.get(c))
    if s is not None:
        need.add(int(nname[s]))
label = strings(need)
tally = Counter()
for t in timers:
    c = callback.get(t)
    if c is None:
        tally['(no callback)'] += 1
        continue
    s = script.get(shared.get(c))
    file = label.get(int(nname[s]), '?') if s is not None else '?'
    line = loc.get(c)
    tally[f"{'/'.join(file.split('/')[-2:])}:{line[0] if line else '?'}  {label.get(int(nname[c]), '') or '(arrow)'}"] += 1
for k, v in tally.most_common(25):
    print(f"{v:6,}  {k}")
