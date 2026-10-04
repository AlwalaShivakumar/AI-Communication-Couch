import 'server-only';
import { extractDocx } from './docx';
import { createRequire } from 'node:module';
import { AppError } from './errors';
const requirePdf = createRequire(import.meta.url);
export async function extractResume(file: File | null) {
  if (!file || !file.size) return '';
  if (file.size > 2000000) throw new AppError('Resume must be smaller than 2 MB.');
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.name.toLowerCase().split('.').at(-1);
  let text: string;
  if (extension === 'pdf') {
    if (!buffer.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new AppError('Invalid PDF file.');
    const parse = requirePdf('pdf-parse/lib/pdf-parse.js') as (data: Buffer, options: { max: number }) => Promise<{text: string}>;
    text = (await parse(buffer, { max: 20 })).text;
  } else if (extension === 'docx') {
    text = await extractDocx(buffer);
  } else if (extension === 'txt') {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } else throw new AppError('Choose a PDF, DOCX or UTF-8 text resume.');
  if (text.length > 20000) throw new AppError('Resume text is too long. Please use a shorter resume.');
  return text.trim();
}
