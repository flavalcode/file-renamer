// Cross-platform "rm -rf" for build folders (no external dependencies).
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

for (const target of process.argv.slice(2)) {
  rmSync(resolve(process.cwd(), target), { recursive: true, force: true });
}
