/** Pure display helpers (no DOM). */

const sizeFormat = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${sizeFormat.format(value)} ${units[unit]}`;
}

export function formatDateTime(isoOrMs: string | number): string {
  const date = new Date(isoOrMs);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** "a/b/c.txt" for a file in sub-folder "a/b"; just the name for the root. */
export function displayPath(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`;
}
