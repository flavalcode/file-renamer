// Copies the static web assets (HTML, CSS) next to the compiled client scripts.
import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve(process.cwd(), 'src/web/public');
const target = resolve(process.cwd(), 'dist/web/public');
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
