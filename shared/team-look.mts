// THE TEAM LOOK: one document in the team's own group, the colours, fonts,
// logo and voice every agent on the team reads before visual work. Anyone on
// the team edits it, and each edit is its next version in the group.
import { shownName } from './artifact-marks.mts';

export const TEAM_LOOK = 'team-look.md';

export const TEAM_LOOK_TEMPLATE = [
  '# Team look',
  '',
  'What every agent on the team reads before it makes a design, a page, a picture or a film. Anyone on the team can edit it.',
  '',
  '## Colours',
  '',
  '- Main:',
  '- Text:',
  '- Background:',
  '',
  '## Fonts',
  '',
  '- Headings:',
  '- Body:',
  '',
  '## Logo',
  '',
  'Where it is, and how it is used.',
  '',
  '## Voice',
  '',
  'How we write on screen.',
  '',
].join('\n');

export const TEAM_LOOK_POSTED = `Team look: our colours, fonts, logo and voice, which every agent reads before visual work. Open it and press Edit to change it.\n\n[${TEAM_LOOK}](attachments/${TEAM_LOOK})`;

/** The stored name of the newest version a group's messages carry, or null. */
export function newestTeamLook(messages: readonly { body?: string | null; at: number; deleted?: boolean }[] | null | undefined): string | null {
  let newest: string | null = null;
  for (const m of [...(messages ?? [])].filter((x) => !x.deleted).sort((a, b) => a.at - b.at)) {
    for (const hit of String(m.body ?? '').matchAll(/\]\(attachments\/([A-Za-z0-9][\w.-]*)\)/g)) {
      if (shownName(`attachments/${hit[1]}`) === TEAM_LOOK) newest = hit[1];
    }
  }
  return newest;
}

/** The line a worker on a team is given when its project has the document. */
export const TEAM_LOOK_LINE = `Before visual work (a design, a page, a picture, a film), read ${TEAM_LOOK} in the project's docs folder: the team's colours, fonts, logo and voice. Use them rather than guessing, and say so when it is still blank.`;
