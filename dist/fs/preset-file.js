import { readFile, stat } from 'node:fs/promises';
import { PresetError } from '../core/errors.js';
import { MAX_PRESET_BYTES, parsePresetJson } from '../core/preset.js';
export async function loadPresetFile(filePath) {
    let size;
    try {
        const stats = await stat(filePath);
        if (!stats.isFile()) {
            throw new PresetError([`"${filePath}" non è un file`]);
        }
        size = stats.size;
    }
    catch (error) {
        if (error instanceof PresetError)
            throw error;
        throw new PresetError([`file non leggibile: ${filePath}`]);
    }
    if (size > MAX_PRESET_BYTES) {
        throw new PresetError([`il file supera ${MAX_PRESET_BYTES / 1024} KB`]);
    }
    return parsePresetJson(await readFile(filePath, 'utf8'));
}
