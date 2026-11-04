// What the search page finds besides threads: lines, files, comments and
// decisions, each group under a quiet label and drawn in the list's own rows.
import type { KeyboardEvent } from 'react';
import { stamp } from '../format';
import { parseQuery } from '../search';
import type { InsideGroup, InsideRow } from '../found-inside';
import { Hits } from './Hits';

export function FoundInside({ groups, query, now, onOpen }: {
  groups: InsideGroup[];
  query: string;
  now: number;
  onOpen: (row: InsideRow) => void;
}) {
  if (!groups.length) return null;
  const q = parseQuery(query);
  const press = (row: InsideRow) => (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(row); } };
  return (
    <div className="found-inside">
      {groups.map((g) => (
        <div key={g.key} className="found-group" data-group={g.key}>
          <div className="day-label">{g.label}</div>
          {g.rows.map((row) => (
            <div key={row.id} className="row found-row" role="button" tabIndex={0} onClick={() => onOpen(row)} onKeyDown={press(row)}>
              <span className="mark" aria-hidden="true" />
              <div className="row-main">
                <div className="subject">
                  {row.group === 'files' && !row.file ? <Hits text={row.text} terms={q.terms} phrase={q.phrase} /> : row.group === 'lines' || row.group === 'decisions' ? row.where : row.group === 'comments' ? `${row.who} on ${row.file}` : row.file}
                </div>
                <div className="preview">
                  {row.group === 'files' && !row.file
                    ? [row.who, row.where].filter(Boolean).join(' in ')
                    : <>
                      {row.group !== 'comments' && row.who && <span className="found-who">{row.who}</span>}
                      <Hits text={row.text} terms={q.terms} phrase={q.phrase} />
                    </>}
                </div>
              </div>
              <div className="row-end">
                <span className="time">{row.at ? stamp(row.at, now) : ''}</span>
              </div>
            </div>
          ))}
          {g.more > 0 && <div className="found-more">{g.more} more</div>}
        </div>
      ))}
    </div>
  );
}
