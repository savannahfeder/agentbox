// WHAT A TEAM IS TOLD ABOUT YOUR CONNECTIONS: which tools you have, so a teammate
// knows who to ask. Tool ids and nothing else, whatever the caller hands over.
export const MAX_CONNECTIONS = 40;
const AN_ID = /^[a-z0-9-]{1,40}$/;

export function cleanConnections(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id) => typeof id === 'string' && AN_ID.test(id)))].slice(0, MAX_CONNECTIONS);
}
