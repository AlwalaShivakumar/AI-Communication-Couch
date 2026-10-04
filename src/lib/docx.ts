import { inflateRawSync } from 'node:zlib';
import mammoth from 'mammoth';
import { AppError } from './errors';
export function validateDocxArchive(buffer: Buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end+22 > buffer.length || buffer.readUInt16LE(end+4) || buffer.readUInt16LE(end+6)) throw new AppError('Invalid DOCX file.');
  const entries = buffer.readUInt16LE(end+10), start = buffer.readUInt32LE(end+16);
  if (!entries || entries > 500 || start >= end) throw new AppError('DOCX file is too complex.');
  let offset = start, total = 0;
  for (let count=0; count<entries; count++) {
    if (offset+46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) throw new AppError('Invalid DOCX archive.');
    const flags = buffer.readUInt16LE(offset+8), method = buffer.readUInt16LE(offset+10);
    const compressed = buffer.readUInt32LE(offset+20), size = buffer.readUInt32LE(offset+24), local = buffer.readUInt32LE(offset+42);
    if (flags & 1 || ![0,8].includes(method) || size > 8000000-total || local+30 > start || buffer.readUInt32LE(local) !== 0x04034b50) throw new AppError('Unsupported or oversized DOCX archive.');
    const dataStart = local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
    if (dataStart+compressed > start) throw new AppError('Invalid DOCX archive.');
    const packed = buffer.subarray(dataStart,dataStart+compressed);
    let actual: Buffer;
    try { actual = method === 8 ? inflateRawSync(packed,{maxOutputLength: Math.max(1,8000000-total)}) : packed; }
    catch { throw new AppError('Invalid or oversized DOCX content.'); }
    if (actual.length !== size) throw new AppError('Invalid DOCX content size.');
    total += actual.length;
    offset += 46+buffer.readUInt16LE(offset+28)+buffer.readUInt16LE(offset+30)+buffer.readUInt16LE(offset+32);
  }
  if (offset > end) throw new AppError('Invalid DOCX archive.');
}
export async function extractDocx(buffer: Buffer) {
  validateDocxArchive(buffer);
  return (await mammoth.extractRawText({buffer})).value;
}
