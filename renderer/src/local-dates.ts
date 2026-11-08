// `toLocaleDateString` builds a new Intl.DateTimeFormat on every call, about
// 0.4 ms each, and a list asks once per row. One formatter per shape, kept.
const kept = new Map<string, Intl.DateTimeFormat>();

export function localDate(ts: number | Date, options: Intl.DateTimeFormatOptions): string {
  const key = JSON.stringify(options);
  let format = kept.get(key);
  if (!format) { format = new Intl.DateTimeFormat(undefined, options); kept.set(key, format); }
  return format.format(ts);
}
