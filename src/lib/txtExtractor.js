function readAsText(file, encoding) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Không đọc được tệp TXT.'));
    reader.readAsText(file, encoding);
  });
}

function corruptionScore(text) {
  const replacement = (text.match(/\uFFFD/g) || []).length;
  const controls = (text.match(/[\u0000-\u0008\u000E-\u001F]/g) || []).length;
  return replacement * 4 + controls * 3;
}

export async function extractTextFromTxt(file, onProgress = () => {}, signal) {
  onProgress(0, 1);
  signal?.throwIfAborted();
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  let encoding = header[0] === 0xFF && header[1] === 0xFE ? 'UTF-16LE'
    : header[0] === 0xFE && header[1] === 0xFF ? 'UTF-16BE' : 'UTF-8';
  let text = await readAsText(file, encoding);

  if (encoding === 'UTF-8' && corruptionScore(text) > 0) {
    const candidates = [
      { encoding: 'UTF-8', text },
    ];
    if (header[1] === 0 && header[3] === 0) {
      candidates.push({ encoding: 'UTF-16LE', text: await readAsText(file, 'UTF-16LE') });
    } else if (header[0] === 0 && header[2] === 0) {
      candidates.push({ encoding: 'UTF-16BE', text: await readAsText(file, 'UTF-16BE') });
    }
    candidates.push({ encoding: 'windows-1252', text: await readAsText(file, 'windows-1252') });
    candidates.sort((a, b) => corruptionScore(a.text) - corruptionScore(b.text));
    ({ encoding, text } = candidates[0]);
  }
  signal?.throwIfAborted();
  onProgress(1, 1);
  return { text: text.replace(/^\uFEFF/, ''), encoding };
}
