import { open } from 'node:fs/promises';

/**
 * Minimal, dependency-free EXIF reader: only the capture date of JPEG files.
 * Every read is bounds-checked: malformed or hostile files return `null`,
 * they never throw and never loop forever.
 */

const EXIF_READ_BYTES = 256 * 1024;
const MAX_IFD_ENTRIES = 512;

const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME = 0x0132;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;
const TYPE_ASCII = 2;

export const EXIF_EXTENSIONS: readonly string[] = ['.jpg', '.jpeg'];

class TiffReader {
  constructor(
    private readonly buf: Buffer,
    private readonly little: boolean,
  ) {}

  u16(offset: number): number | null {
    if (offset < 0 || offset + 2 > this.buf.length) return null;
    return this.little ? this.buf.readUInt16LE(offset) : this.buf.readUInt16BE(offset);
  }

  u32(offset: number): number | null {
    if (offset < 0 || offset + 4 > this.buf.length) return null;
    return this.little ? this.buf.readUInt32LE(offset) : this.buf.readUInt32BE(offset);
  }

  /** Reads an IFD and returns tag -> date string (ASCII) or tag -> numeric value. */
  readIfd(ifdOffset: number): Map<number, { ascii?: string; value?: number }> {
    const result = new Map<number, { ascii?: string; value?: number }>();
    const count = this.u16(ifdOffset);
    if (count === null || count > MAX_IFD_ENTRIES) return result;

    for (let i = 0; i < count; i += 1) {
      const entry = ifdOffset + 2 + i * 12;
      const tag = this.u16(entry);
      const type = this.u16(entry + 2);
      const length = this.u32(entry + 4);
      const raw = this.u32(entry + 8);
      if (tag === null || type === null || length === null || raw === null) break;

      if (type === TYPE_ASCII) {
        const dataOffset = length <= 4 ? entry + 8 : raw;
        if (length > 0 && length <= 64 && dataOffset >= 0 && dataOffset + length <= this.buf.length) {
          result.set(tag, { ascii: this.buf.toString('latin1', dataOffset, dataOffset + length).replace(/\0.*$/su, '') });
        }
      } else {
        result.set(tag, { value: raw });
      }
    }
    return result;
  }
}

/** "YYYY:MM:DD HH:MM:SS" (camera local time) -> epoch ms, or null if implausible. */
export function parseExifDateString(text: string): number | null {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/u.exec(text);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [
    number, number, number, number, number, number,
  ];
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function parseTiff(tiff: Buffer): number | null {
  if (tiff.length < 8) return null;
  const order = tiff.toString('latin1', 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const reader = new TiffReader(tiff, order === 'II');
  if (reader.u16(2) !== 42) return null;
  const ifd0Offset = reader.u32(4);
  if (ifd0Offset === null) return null;

  const ifd0 = reader.readIfd(ifd0Offset);
  const exifPointer = ifd0.get(TAG_EXIF_IFD)?.value;
  const exifIfd = exifPointer === undefined ? new Map() : reader.readIfd(exifPointer);

  const candidates = [
    exifIfd.get(TAG_DATE_TIME_ORIGINAL)?.ascii,
    exifIfd.get(TAG_DATE_TIME_DIGITIZED)?.ascii,
    ifd0.get(TAG_DATE_TIME)?.ascii,
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined) {
      const parsed = parseExifDateString(candidate);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

/** Extracts the capture date from the first bytes of a JPEG file. */
export function parseExifDate(buf: Buffer): number | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1] as number;
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2; // markers without payload
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan

    const length = buf.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > buf.length) return null;

    const payloadStart = offset + 4;
    if (marker === 0xe1 && buf.toString('latin1', payloadStart, payloadStart + 6) === 'Exif\0\0') {
      return parseTiff(buf.subarray(payloadStart + 6, end));
    }
    offset = end;
  }
  return null;
}

/** Reads the EXIF capture date of a file on disk; `null` if absent or unreadable. */
export async function readExifDate(filePath: string): Promise<number | null> {
  let handle;
  try {
    handle = await open(filePath, 'r');
    const buffer = Buffer.alloc(EXIF_READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, EXIF_READ_BYTES, 0);
    return parseExifDate(buffer.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
