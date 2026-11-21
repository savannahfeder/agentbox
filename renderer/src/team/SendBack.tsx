// On an agent thread started from a teammate's task or thread: send the agent's
// new version of the file to them, which answers the comments the hand-over carried.
import { useContext, useEffect, useState } from 'react';
import type { WorkItem } from '../types';
import type { FileVersion } from '../../../shared/artifact-marks.mts';
import { api } from '../api';
import { persistAttachments } from '../attachments';
import { TeamContext, firstName } from './people';
import { fileToSendBack, handedComments, markSentBack, sendBackWords, sentBack, whereItGoesBack } from '../threads/send-back';

export function SendBack({ item, items }: { item: WorkItem; items: readonly WorkItem[] }) {
  const team = useContext(TeamContext);
  const back = team ? whereItGoesBack(item, items, team.me) : null;
  const [file, setFile] = useState<FileVersion | null>(null);
  const [sent, setSent] = useState<string | null>(() => sentBack(item.product, item.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!back) return undefined;
    let live = true;
    void api.itemHistory({ product: item.product, id: item.id }).then((r) => { if (live) setFile(fileToSendBack(r?.lines ?? [])); });
    return () => { live = false; };
  }, [item.product, item.id, item.updatedAt, !!back]);
  if (!team || !back || !file || item.status === 'claimed') return null;
  const who = firstName(team.byId.get(back.to) ?? null) || 'them';
  const answers = handedComments(item.product, item.id);
  const done = sent === file.path;
  const send = async () => {
    setBusy(true); setError(null);
    try {
      const found = await api.resolveDoc({ product: item.product, src: file.path, thread: item.id });
      if (!found.ok || !found.opened) throw new Error(found.error ?? `${file.name} is not on this computer.`);
      const words = sendBackWords(file.name, answers.length);
      if ('task' in back) {
        const links = await persistAttachments(back.task.product, [{ name: file.name, srcPath: found.opened, image: /\.(png|jpe?g|gif|webp)$/i.test(file.name) }]);
        await api.answer({ product: back.task.product, id: back.task.id, answer: `${words}\n\n${links}` });
        const version = /\]\((attachments\/[^)\s]+)\)/.exec(links)?.[1]?.split('/').pop();
        for (const on of answers) await api.fileMark({ product: back.task.product, id: back.task.id, mark: { do: 'resolve', on, ...(version ? { in: version } : {}) } });
      } else {
        const out = await api.teamMessage(back.to, words, undefined, [{ name: file.name, srcPath: found.opened }]);
        if (!out?.ok) throw new Error(out?.error ?? `That did not reach ${who}.`);
        for (const on of answers) await api.teamMarkFile({ personId: back.thread.personId, threadId: back.thread.threadId, mark: { do: 'resolve', on } });
      }
      markSentBack(item.product, item.id, file.path);
      setSent(file.path);
    } catch (err) {
      setError((err as Error)?.message ?? 'That did not send.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="opt-strip">
    <button type="button" className="opt-row" disabled={busy || done} onClick={() => void send()}>
      <span className="opt-text">{done ? `Sent ${file.name} to ${who}` : `Send ${file.name} to ${who}`}</span>
      {!done && answers.length > 0 && <span className="tm-with-thread">{answers.length === 1 ? 'Answers 1 comment' : `Answers ${answers.length} comments`}</span>}
    </button>
    {error && <div className="opt-head"><span className="tm-error">{error}</span></div>}
  </div>;
}
