import { lstat, rename } from 'node:fs/promises';

/**
 * Minimal file-system surface used by the executor. Having it as an interface
 * lets tests inject failures (to verify rollback) without touching real disks.
 */
export interface FsPort {
  rename(from: string, to: string): Promise<void>;
  /** `file` = regular file, `other` = directory/symlink/..., `missing` = does not exist. */
  kind(path: string): Promise<'file' | 'other' | 'missing'>;
}

export const nodeFsPort: FsPort = {
  rename: (from, to) => rename(from, to),
  async kind(path) {
    try {
      const stats = await lstat(path);
      return stats.isFile() ? 'file' : 'other';
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return 'missing';
      }
      throw error;
    }
  },
};
