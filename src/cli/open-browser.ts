/** Command that opens a URL in the default browser, per platform. Pure: nothing is executed here. */

const LOCAL_URL = /^http:\/\/127\.0\.0\.1:\d{1,5}\/(#t=[A-Za-z0-9_-]+)?$/u;

export interface BrowserCommand {
  readonly command: string;
  readonly args: readonly string[];
}

export function browserCommand(url: string, platform: NodeJS.Platform): BrowserCommand | null {
  // Only our own local address is ever passed to a system command.
  if (!LOCAL_URL.test(url)) return null;
  switch (platform) {
    case 'darwin':
      return { command: 'open', args: [url] };
    case 'win32':
      return { command: 'cmd', args: ['/c', 'start', '', url] };
    default:
      return { command: 'xdg-open', args: [url] };
  }
}
