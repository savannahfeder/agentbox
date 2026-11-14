// A COMMENT THAT WENT IN IS NEVER SAID TO HAVE FAILED.
//
// Reported 2026-11-13 (w-f6095cf2b9) as the per-minute comment limit showing
// "That did not go through. Try again." The live database's rows said
// otherwise: the commenter never posted more than three in a minute, and one
// comment was stored twice, 31 seconds apart. The page posted the comment and
// then read the list again inside the same try, so a failed read after a saved
// comment kept the words in the box and said the comment failed; sending again
// saved it twice. Measured on renderer/src/shared-file/shared-file.ts with a
// stand-in rpc: what a post, then a read that fails, becomes.
import { describe, it, expect } from 'vitest';
import { sendComment, takeBackComment, saidOf } from '../renderer/src/shared-file/shared-file.ts';

const TOK = 'pR3nY0q7Lw2Xc9Vb5Tz1';
const LIST = [{ id: 'c1', by_name: 'Maya Chen', body: 'B: c9', created_at: '2026-11-13T20:31:34Z', mine: true }];
const rpcOf = (answers: Record<string, unknown>) => {
  const asked: string[] = [];
  const rpc = async (name: string) => { asked.push(name); const a = answers[name]; if (a instanceof Error) throw a; return a; };
  return { rpc, asked };
};
const lost = () => new Error('signal timed out');

describe('sending a comment', () => {
  it('is the new list when the post and the read both go through', async () => {
    const { rpc, asked } = rpcOf({ comment_on_file_link: 'c1', file_link_comments_of: LIST });
    const list = await sendComment(rpc, rpc, TOK, 'B: c9');
    expect(list?.map((c) => c.body)).toEqual(['B: c9']);
    expect(asked).toEqual(['comment_on_file_link', 'file_link_comments_of']);
  });

  it('still counts as sent when only the read after it fails, so the box empties and nothing is sent twice', async () => {
    const { rpc } = rpcOf({ comment_on_file_link: 'c1', file_link_comments_of: lost() });
    await expect(sendComment(rpc, rpc, TOK, 'B: c9')).resolves.toBeNull();
  });

  it('fails when the post itself fails, and does not read the list', async () => {
    const { rpc, asked } = rpcOf({ comment_on_file_link: lost(), file_link_comments_of: LIST });
    await expect(sendComment(rpc, rpc, TOK, 'B: c9')).rejects.toThrow('timed out');
    expect(asked).toEqual(['comment_on_file_link']);
  });

  it('says the limit in its own words when the database refuses the eleventh in a minute', async () => {
    const { rpc } = rpcOf({ comment_on_file_link: new Error('too many comments for now; try again in a minute') });
    const err = await sendComment(rpc, rpc, TOK, 'B: c11').catch((e: unknown) => e);
    expect(saidOf(err)).toBe('Too many comments for now. Try again in a minute.');
  });
});

describe('taking a comment back', () => {
  it('still counts as taken back when only the read after it fails', async () => {
    const { rpc } = rpcOf({ remove_file_link_comment: null, file_link_comments_of: lost() });
    await expect(takeBackComment(rpc, rpc, TOK, 'c1')).resolves.toBeNull();
  });

  it('fails when the removal itself fails', async () => {
    const { rpc } = rpcOf({ remove_file_link_comment: new Error('that comment is not yours'), file_link_comments_of: LIST });
    await expect(takeBackComment(rpc, rpc, TOK, 'c1')).rejects.toThrow('not yours');
  });
});
