# Complete-ledger validation

The authoritative fold includes the complete ledger. The 8 MiB window only
limits which finished items enter the initial snapshot; active work, claims,
and mutation decisions use complete state. Older finished work remains paged.
No on-disk migration is required.

## Regression coverage

`tests/active-work-survives-a-large-ledger.test.mjs` covers old active and
scheduled work, original fields followed by recent patches, create-if-absent,
live and expired claims, the former size boundary, streamed folds, oversized
and multibyte records, old conversations, foreign-line deduplication,
interrupted final records, atomic file replacement, append-during-read byte
snapshots, and descriptor cleanup on early return and read errors.
Existing finished-history tests verify paging without partial placeholder rows.

## Synthetic performance measurement

Measured on macOS arm64 with Node 22 on 2026-10-10. Each size ran in a fresh
Node process with 2,000 synthetic items, half finished, followed by repeated
512-character note updates. No real store or provider was used. Five unchanged
reads and three append/read cycles followed the first read. These are individual
local measurements, not a cross-platform performance guarantee.

| Ledger | First read | Unchanged reads | Reads after append | Peak process RSS |
| --- | --- | --- | --- | --- |
| 8 MiB | 117 ms | 0.58–0.80 ms | 72–85 ms | 166 MiB |
| 50 MiB | 328 ms | 0.50–0.86 ms | 264–292 ms | 149 MiB |
| 100 MiB | 546 ms | 0.58–1.54 ms | 466–515 ms | 151 MiB |

Cold reads and reads after any append remain synchronous and linear in ledger
history. A 100 MiB ledger can therefore block the main process for roughly half
a second on this machine. Streaming bounds raw-record buffering, not the folded
item map or runtime allocation overhead; memory still grows with retained state.
Unchanged reads reuse cached folds. This fixes lost state, but does not solve
large-history latency. Incremental folding or checkpointing needs separate work
that preserves fencing, reactions, conversations, and replacement semantics.

## Desktop smoke check

An isolated synthetic store with an 8.1 MiB ledger was opened in Electron with
`ZERO_NO_SUPERVISOR=1`. The old active item appeared in Needs You. Done showed
both recent and old finished items, and the old finished item's detail view
retained its title, project, and Done status. No worker sessions were started.
