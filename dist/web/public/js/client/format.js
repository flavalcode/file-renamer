const sizeFormat = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
export function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${sizeFormat.format(value)} ${units[unit]}`;
}
export function formatDateTime(isoOrMs) {
    const date = new Date(isoOrMs);
    if (Number.isNaN(date.getTime()))
        return '';
    return date.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
}
export function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}
export function displayPath(dir, name) {
    return dir === '' ? name : `${dir}/${name}`;
}
