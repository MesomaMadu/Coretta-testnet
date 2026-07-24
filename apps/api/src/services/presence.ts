const TTL_MS = 60_000;
const sessions = new Map<string, number>();

function prune(now: number) {
  for (const [id, seen] of sessions) {
    if (now - seen > TTL_MS) sessions.delete(id);
  }
}

export function touchPresence(sessionId: string): number {
  const now = Date.now();
  sessions.set(sessionId, now);
  prune(now);
  return sessions.size;
}

export function getActiveCount(): number {
  const now = Date.now();
  prune(now);
  return sessions.size;
}
