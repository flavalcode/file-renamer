/** Builds a minimal JPEG with an EXIF block holding one date tag. */
export function buildJpeg(date: string, options: { little?: boolean; inExifIfd?: boolean } = {}): Buffer {
  const little = options.little ?? true;
  const inExifIfd = options.inExifIfd ?? true;
  const u16 = (v: number): Buffer => {
    const b = Buffer.alloc(2);
    little ? b.writeUInt16LE(v) : b.writeUInt16BE(v);
    return b;
  };
  const u32 = (v: number): Buffer => {
    const b = Buffer.alloc(4);
    little ? b.writeUInt32LE(v) : b.writeUInt32BE(v);
    return b;
  };
  const ascii = Buffer.from(`${date}\0`, 'latin1'); // 20 bytes
  const header = Buffer.concat([Buffer.from(little ? 'II' : 'MM', 'latin1'), u16(42), u32(8)]);
  let body: Buffer;
  if (inExifIfd) {
    // IFD0 at 8: 1 entry (ExifIFD pointer) -> Exif IFD at 26 with DateTimeOriginal -> data at 44
    const ifd0 = Buffer.concat([u16(1), u16(0x8769), u16(4), u32(1), u32(26), u32(0)]);
    const exifIfd = Buffer.concat([u16(1), u16(0x9003), u16(2), u32(ascii.length), u32(44), u32(0)]);
    body = Buffer.concat([ifd0, exifIfd, ascii]);
  } else {
    // IFD0 only, with DateTime (0x0132) -> data at 26
    const ifd0 = Buffer.concat([u16(1), u16(0x0132), u16(2), u32(ascii.length), u32(26), u32(0)]);
    body = Buffer.concat([ifd0, ascii]);
  }
  const tiff = Buffer.concat([header, body]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), length, payload, Buffer.from([0xff, 0xd9])]);
}

