const LOCAL_URL = /^http:\/\/127\.0\.0\.1:\d{1,5}\/(#t=[A-Za-z0-9_-]+)?$/u;
export function browserCommand(url, platform) {
    if (!LOCAL_URL.test(url))
        return null;
    switch (platform) {
        case 'darwin':
            return { command: 'open', args: [url] };
        case 'win32':
            return { command: 'cmd', args: ['/c', 'start', '', url] };
        default:
            return { command: 'xdg-open', args: [url] };
    }
}
