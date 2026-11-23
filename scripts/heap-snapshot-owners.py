#!/usr/bin/env python3
"""Says which objects hold a V8 heap snapshot's memory, as a tree from the roots.

For the snapshots the app saves beside its memory log (main-*.heapsnapshot).
Each object is given to the first holder a breadth-first walk from the roots
reaches it by, and sizes are summed up that tree. It is not the exact
dominator tree DevTools draws, but it runs where DevTools would not fit: a
400 MB snapshot of 3.7 million objects took 650 MB and 35 seconds, so check
free memory first. A holder whose one child holds nearly all of it is skipped
along ("+N hops"), which is how a timer list or a chain of scopes reads.

Needs numpy.

Usage: heap-snapshot-owners.py <file.heapsnapshot> [min share, default 0.012] [depth, default 14]
"""
import json
import re
import sys
from array import array
from collections import deque

import numpy as np

path = sys.argv[1]
MIN_SHARE = float(sys.argv[2]) if len(sys.argv) > 2 else 0.012
MAX_DEPTH = int(sys.argv[3]) if len(sys.argv) > 3 else 14
CHUNK = 2 << 20

f = open(path, 'rb')
head = f.read(1 << 16)
nodes_at = head.index(b'"nodes":[')
meta = json.loads(head[head.index(b'{"meta"'):nodes_at].rstrip(b',\n '))
m = meta['meta']
NF, EF = len(m['node_fields']), len(m['edge_fields'])
N, E = meta['node_count'], meta['edge_count']
node_types, edge_types = m['node_types'][0], m['edge_types'][0]
I_TYPE, I_NAME, I_SIZE, I_EC = (m['node_fields'].index(x) for x in ('type', 'name', 'self_size', 'edge_count'))
print(f"nodes {N:,} edges {E:,}", file=sys.stderr)


def read_ints(start_marker_offset, count):
    """Reads `count` comma-separated ints starting at a file offset."""
    out = np.empty(count, dtype=np.int32)
    f.seek(start_marker_offset)
    got = 0
    carry = b''
    while got < count:
        chunk = f.read(CHUNK)
        if not chunk:
            break
        data = carry + chunk
        end = data.find(b']')
        if end != -1:
            data, carry = data[:end], b''
        else:
            cut = data.rfind(b',')
            data, carry = data[:cut], data[cut + 1:]
        part = np.array(data.replace(b'\n', b'').split(b','), dtype=np.int64)
        out[got:got + len(part)] = part
        got += len(part)
        if end != -1:
            break
    assert got == count, (got, count)
    return out, f.tell()


nodes, _ = read_ints(nodes_at + len(b'"nodes":['), N * NF)
nodes = nodes.reshape(N, NF)
ntype = nodes[:, I_TYPE].copy()
nname = nodes[:, I_NAME].copy()
nsize = nodes[:, I_SIZE].astype(np.int64)
ecount = nodes[:, I_EC].astype(np.int64)
del nodes
first_edge = np.zeros(N + 1, dtype=np.int64)
np.cumsum(ecount, out=first_edge[1:])
del ecount

# Find the edge table: it follows the node table.
f.seek(0)
offset, carry, edges_at = 0, b'', -1
MARK = b'"edges":['
while True:
    chunk = f.read(CHUNK)
    if not chunk:
        break
    data = carry + chunk
    i = data.find(MARK)
    if i != -1:
        edges_at = offset - len(carry) + i + len(MARK)
        break
    carry = data[-len(MARK):]
    offset += len(chunk)
edges, _ = read_ints(edges_at, E * EF)
edges = edges.reshape(E, EF)
etype = array('b', edges[:, 0].astype(np.int8).tobytes())
ename = array('i', edges[:, 1].tobytes()) if edges[:, 1].flags['C_CONTIGUOUS'] else array('i', edges[:, 1].copy().tobytes())
eto = array('i', (edges[:, 2] // NF).astype(np.int32).tobytes())
del edges
print("graph loaded", file=sys.stderr)

WEAK = edge_types.index('weak')
SHORTCUT = edge_types.index('shortcut')
fe = array('q', first_edge.tobytes())
parent = array('i', [-1]) * N
via = array('i', [-1]) * N          # the edge that reached it
order = array('i')
seen = bytearray(N)
seen[0] = 1
queue = deque([0])
while queue:
    n = queue.popleft()
    order.append(n)
    for e in range(fe[n], fe[n + 1]):
        t = etype[e]
        if t == WEAK or t == SHORTCUT:
            continue
        to = eto[e]
        if not seen[to]:
            seen[to] = 1
            parent[to] = n
            via[to] = e
            queue.append(to)
print(f"reached {len(order):,} of {N:,}", file=sys.stderr)

held = nsize.copy()
size_list = array('q', held.tobytes())
for n in reversed(order):
    p = parent[n]
    if p >= 0:
        size_list[p] += size_list[n]
total = size_list[0]

children = {}
for n in order:
    p = parent[n]
    if p >= 0 and size_list[n] >= total * MIN_SHARE * 0.25:
        children.setdefault(p, []).append(n)

# Which strings to name: every printed node's name and edge name.
printed = []


def walk(n, depth):
    # A holder whose one child holds nearly all of it is a link in a chain
    # (a timer list, a scope): skip along it without spending depth.
    hops = 0
    while True:
        kids = sorted(children.get(n, []), key=lambda k: -size_list[k])
        if kids and size_list[kids[0]] >= size_list[n] * 0.93 and hops < 5000:
            n = kids[0]
            hops += 1
            continue
        break
    printed.append((n, depth, hops))
    if depth >= MAX_DEPTH:
        return
    for k in kids:
        if size_list[k] >= total * MIN_SHARE:
            walk(k, depth + 1)


sys.setrecursionlimit(10000)
walk(0, 0)
need = set()
NUMERIC = {edge_types.index('element'), edge_types.index('hidden')}
for n, _, _ in printed:
    need.add(int(nname[n]))
    e = via[n]
    if e >= 0 and etype[e] not in NUMERIC:
        need.add(ename[e])

f.seek(0)
offset, carry, found = 0, b'', -1
MARK = b'"strings":['
while True:
    chunk = f.read(CHUNK)
    if not chunk:
        break
    data = carry + chunk
    i = data.find(MARK)
    if i != -1:
        found = offset - len(carry) + i + len(MARK)
        break
    carry = data[-len(MARK):]
    offset += len(chunk)
names = {}
f.seek(found)
pat = re.compile(rb'"((?:[^"\\]|\\.)*)"')
carry, idx, last = b'', 0, max(need)
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
            names[idx] = mm.group(1)[:90].decode('utf8', 'replace')
        idx += 1
        end = mm.end()
        if idx > last:
            break
    carry = data[end:]

print(f"total held from the roots: {total / 1048576:.1f} MB")
for n, depth, hops in printed:
    e = via[n]
    if e < 0:
        edge = ''
    elif etype[e] in NUMERIC:
        edge = f"[{ename[e]}]"
    else:
        edge = names.get(ename[e], '?')
    kids = len(children.get(n, []))
    label = names.get(int(nname[n]), '').replace('\\n', ' ')[:70]
    skipped = f"(+{hops} hops) " if hops else ''
    print(f"{'  ' * depth}{size_list[n] / 1048576:7.1f} MB  {skipped}{edge} -> {node_types[ntype[n]]} {label}  (self {nsize[n] / 1048576:.1f}, {kids} kids)")
