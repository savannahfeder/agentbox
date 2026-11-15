import React from 'react';
import ReactDOM from 'react-dom/client';
import { cloudClient, type CloudConfig } from '../cloud-rest';
import { finishComingBack } from '../shared-file/boot';
import { SharedThreadPage } from './SharedThreadPage';

export function bootSharedThread(thread: { owner: string; id: string }, cfg: CloudConfig) {
  const client = cloudClient(cfg, { storage: localStorage, fetchImpl: (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(15_000) }) });
  const finishing = finishComingBack(client, location, (to) => history.replaceState(history.state, '', to));
  document.documentElement.dataset.page = 'shared-file';
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><SharedThreadPage owner={thread.owner} id={thread.id} client={client} finishing={finishing} /></React.StrictMode>,
  );
}
