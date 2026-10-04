import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { extractDocx, validateDocxArchive } from '../src/lib/docx';
import { finalizeRecording, blobToBase64 } from '../src/lib/recording';

function zip(entries: Record<string,string>, lie = false) {
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name,text] of Object.entries(entries)) {
    const nameBytes=Buffer.from(name), raw=Buffer.from(text), packed=deflateRawSync(raw);
    const local=Buffer.alloc(30); local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(nameBytes.length,26);
    locals.push(local,nameBytes,packed);
    const header=Buffer.alloc(46);header.writeUInt32LE(0x02014b50);header.writeUInt16LE(20,4);header.writeUInt16LE(20,6);header.writeUInt16LE(8,10);header.writeUInt32LE(packed.length,20);header.writeUInt32LE(lie?1:raw.length,24);header.writeUInt16LE(nameBytes.length,28);header.writeUInt32LE(offset,42);
    central.push(header,nameBytes);offset+=local.length+nameBytes.length+packed.length;
  }
  const directory=Buffer.concat(central), end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
test('DOCX extraction reads document text and rejects false sizes and decompression abuse',async()=>{
 const file=zip({
  '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/document.xml':'<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Engineering experience</w:t></w:r></w:p></w:body></w:document>'
 });
 assert.match(await extractDocx(file),/Engineering experience/);
 assert.throws(()=>validateDocxArchive(Buffer.from('not a zip')));
 assert.throws(()=>validateDocxArchive(zip({'word/document.xml':'x'.repeat(8000001)},true)));
 assert.throws(()=>validateDocxArchive(zip({'word/document.xml':'real text'},true)));
});
test('recording waits for final data and stops paused recorders',async()=>{
 class Recorder extends EventTarget {state='paused';mimeType='audio/webm';stop(){this.state='inactive';queueMicrotask(()=>{chunks.push(new Blob(['last chunk']));this.dispatchEvent(new Event('stop'));});}}
 const chunks:Blob[]=[new Blob(['first '])];
 const result=await finalizeRecording(new Recorder() as unknown as MediaRecorder,chunks);
 assert.equal(await result.text(),'first last chunk');
 assert.equal((await finalizeRecording(null,[])).size,0);
 await assert.rejects(blobToBase64(new Blob([new Uint8Array(2000001)])),/too long/);
});
