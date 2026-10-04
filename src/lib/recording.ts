export async function finalizeRecording(recorder: MediaRecorder | null, chunks: Blob[]) {
  if (!recorder || recorder.state === 'inactive') return new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
  await new Promise<void>((resolve,reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Recording could not be finalized. Please retry.')); }, 5000);
    const cleanup = () => { clearTimeout(timeout); recorder.removeEventListener('stop', done); recorder.removeEventListener('error', failed); };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('Recording failed. Please retry.')); };
    recorder.addEventListener('stop', done, { once: true });
    recorder.addEventListener('error', failed, { once: true });
    try { recorder.stop(); } catch (error) { cleanup(); reject(error); }
  });
  return new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
}
export function blobToBase64(blob: Blob): Promise<string> {
  if (blob.size > 2000000) return Promise.reject(new Error('Recording is too long. Please use a shorter answer.'));
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Recording could not be read.'));
    reader.readAsDataURL(blob);
  });
}
