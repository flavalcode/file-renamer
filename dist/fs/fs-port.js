import { lstat, rename } from 'node:fs/promises';
export const nodeFsPort = {
    rename: (from, to) => rename(from, to),
    async kind(path) {
        try {
            const stats = await lstat(path);
            return stats.isFile() ? 'file' : 'other';
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return 'missing';
            }
            throw error;
        }
    },
};
