/** Session-only LRU. Visible previews are never evicted; no task content is persisted. */
export class ThumbnailCache<T extends {dispose: () => void}> {
  private entries = new Map<string, {value:T; users:number}>();
  constructor(private limit = 12) {}
  acquire(key:string, create:()=>T):T {
    let entry = this.entries.get(key);
    if (!entry) entry = {value:create(), users:0};
    entry.users++;
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.trim();
    return entry.value;
  }
  release(key:string) {
    const entry = this.entries.get(key);
    if (entry) entry.users = Math.max(0, entry.users - 1);
    this.trim();
  }
  private trim() {
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= this.limit) break;
      if (entry.users) continue;
      this.entries.delete(key);
      entry.value.dispose();
    }
  }
}
