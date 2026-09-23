import { useEffect, useRef, useState } from 'react';
import { getCourse, getRawDocument, getSettings, saveCourse, saveRawDocument } from '../lib/db.js';
import { cancelProcessingJob, getProcessingJob, pauseProcessingJob, resumeProcessingJob, startProcessingJob, subscribeProcessingJobs } from '../lib/processingJobs.js';
import { estimateTokens } from '../lib/chunker.js';

export default function ProcessingScreen({ courseId, onBack, onDone, onSettings }) {
  const [course, setCourse] = useState(null);
  const [document, setDocument] = useState(null);
  const [state, setState] = useState('idle');
  const [info, setInfo] = useState({ current: 0, completed: 0, failed: 0, total: 0, percent: 0, message: '' });
  const [error, setError] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [model, setModel] = useState('');
  const [extraText, setExtraText] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    let live = true;
    const unsubscribe = subscribeProcessingJobs((id, snapshot) => {
      if (!live || id !== courseId) return;
      setState(snapshot.state);
      setInfo({ current: snapshot.current, completed: snapshot.completed || 0, failed: snapshot.failed || 0, total: snapshot.total, percent: snapshot.percent, message: snapshot.message });
      setError(snapshot.error || '');
      if (['completed', 'error', 'cancelled'].includes(snapshot.state)) getRawDocument(documentId).then((latest) => { if (live && latest) setDocument(latest); });
      if (snapshot.state === 'completed') onDoneRef.current(courseId);
    });
    let documentId = null;
    Promise.all([getCourse(courseId), getSettings()]).then(async ([item, settings]) => {
      if (!live) return;
      setCourse(item);
      setHasKey(Boolean(settings.geminiApiKey));
      setModel(settings.geminiModel || 'gemini-flash-latest');
      documentId = item?.rawDocumentId;
      if (documentId) {
        const latest = await getRawDocument(documentId);
        if (!live || !latest) return;
        setDocument(latest);
        const job = getProcessingJob(courseId);
        const results = Object.values(latest.generated || {});
        const completed = results.filter((result) => result.output).length;
        const failed = results.filter((result) => result.error && !result.output).length;
        const processed = completed + failed;
        setInfo(job ? { current: job.current, completed: job.completed || 0, failed: job.failed || 0, total: job.total, percent: job.percent, message: job.message } : { current: processed, completed, failed, total: latest.chunkCount, percent: latest.chunkCount ? Math.round(processed / latest.chunkCount * 100) : 0, message: latest.processingError || (processed ? `Đã khôi phục checkpoint: ${completed} đoạn hoàn tất${failed ? ` · ${failed} lỗi sẽ thử lại` : ''}` : '') });
        setState(job?.state || (latest.status === 'paused' ? 'paused' : latest.status === 'processing' ? 'processing' : 'idle'));
        setError(job?.error || latest.processingError || '');
      }
    }).catch((cause) => { if (live) setError(cause.message); });
    return () => { live = false; unsubscribe(); };
  }, [courseId]);
  const start = () => {
    if (!document) return;
    setError('');
    startProcessingJob(courseId, { customInstruction: customInstruction || undefined }).catch((cause) => setError(cause.message));
  };
  const cancel = () => cancelProcessingJob(courseId);
  const editChunks = async (texts) => {
    if (texts.some((text) => estimateTokens(text) > 3000)) { setError('Đoạn sau khi ghép vượt 3000 token.'); return; }
    const fullText = texts.join('\n\n');
    let position = 0;
    const chunks = texts.map((text, index) => {
      const item = { id: `chunk_${String(index + 1).padStart(3, '0')}`, index, text, charStart: position, charEnd: position + text.length, estimatedTokens: estimateTokens(text) };
      position += text.length + 2;
      return item;
    });
    try {
      const updated = { ...document, extractedText: fullText, textLength: fullText.length, chunks, chunkCount: chunks.length, generated: {}, draftChapters: [], status: 'chunked' };
      await saveRawDocument(updated);
      await saveCourse({ ...course, status: 'has-raw' });
      setDocument(updated); setError(''); setExtraText('');
    } catch (cause) { setError(cause.message); }
  };
  const resetGenerated = async (index = null) => {
    try {
      const generated = index === null ? {} : { ...(document.generated || {}) };
      if (index !== null) delete generated[index];
      const updated = { ...document, generated, draftChapters: [], status: 'chunked' };
      await saveRawDocument(updated);
      await saveCourse({ ...course, status: 'has-raw' });
      setDocument(updated); setState('idle'); setInfo({ current: 0, completed: 0, failed: 0, total: updated.chunkCount, percent: 0, message: '' }); setError('');
    } catch (cause) { setError(cause.message); }
  };
  const splitChunk = (index) => {
    const text = document.chunks[index].text;
    const middle = Math.floor(text.length / 2);
    const offset = text.indexOf('\n', middle);
    const point = offset > middle && offset < text.length * 0.75 ? offset : middle;
    const first = text.slice(0, point).trim();
    const second = text.slice(point).trim();
    if (!first || !second) { setError('Đoạn này quá ngắn để chia.'); return; }
    editChunks(document.chunks.flatMap((chunk, at) => at === index ? [first, second] : [chunk.text]));
  };
  return <div className="space-y-5"><button onClick={onBack} className="text-sm text-accent">← Thư viện</button><header><p className="text-xs font-semibold uppercase text-accent">{course?.name || 'Khóa học'}</p><h1 className="mt-1 font-serif text-2xl font-semibold">Sinh bài học từ tài liệu</h1></header>
    {!document && <p className="rounded-md border border-border bg-bg-secondary p-4 text-sm">Chưa có tài liệu. Hãy nhập PDF, DOCX hoặc TXT từ Thư viện.</p>}
    {document && <><div className="rounded-md border border-border bg-bg-secondary p-4 text-sm"><p className="font-semibold">{document.fileName}</p><p className="mt-1 text-text-muted">{document.chunkCount} đoạn · model {model || 'Gemini'} · thường mất khoảng {Math.max(1, Math.ceil(document.chunkCount * 10 / 60))}-{Math.max(2, Math.ceil(document.chunkCount * 30 / 60))} phút tùy model và rate limit. Chỉ văn bản trích xuất được gửi tới Gemini.</p>{/pro/i.test(model) && <p className="mt-2 text-warning">Model Pro ưu tiên chất lượng nên có thể chậm hơn Flash đáng kể.</p>}</div>
      <div className="rounded-md border border-border bg-bg-secondary p-4" aria-live="polite"><div className="flex justify-between text-sm"><strong>{state === 'paused' ? 'Đã tạm dừng' : state === 'processing' ? 'Đang xử lý' : state === 'elsewhere' ? 'Đang chạy ở tab khác' : state === 'completed' ? 'Hoàn tất' : 'Sẵn sàng'}</strong><span>{info.current}/{document.chunkCount}</span></div><progress className="mt-3 w-full" value={info.current} max={document.chunkCount} /><div className="mt-2 flex flex-wrap gap-3 text-xs"><span className="text-success">{info.completed || 0} hoàn tất</span>{Boolean(info.failed) && <span className="text-error">{info.failed} lỗi, sẽ thử lại</span>}</div><p className="mt-1 text-sm text-text-muted">{info.message || 'Checkpoint được lưu sau từng đoạn; có thể rời màn hình trong lúc xử lý.'}</p></div>
      <div className="flex flex-wrap gap-2">{['idle', 'error', 'cancelled'].includes(state) && <button onClick={start} className="btn-primary">{state === 'idle' ? 'Bắt đầu xử lý' : 'Tiếp tục xử lý'}</button>}{state === 'processing' && <button onClick={() => pauseProcessingJob(courseId).catch((cause) => setError(cause.message))} className="btn-secondary">Tạm dừng</button>}{state === 'paused' && <button onClick={() => resumeProcessingJob(courseId).catch((cause) => setError(cause.message))} className="btn-primary">Tiếp tục</button>}{['processing', 'paused'].includes(state) && <button onClick={cancel} className="btn-secondary">Hủy</button>}{!hasKey && <button onClick={onSettings} className="btn-secondary">Mở cài đặt API key</button>}</div><p className="text-xs text-text-muted">Bạn có thể mở mục khác; xử lý vẫn tiếp tục khi tab này còn mở. Nếu đóng tab, app sẽ tiếp tục từ đoạn đã lưu khi mở lại.</p></>}
    {document && ['idle', 'error', 'cancelled'].includes(state) && <details className="rounded-md border border-border bg-bg-secondary p-4"><summary className="cursor-pointer font-semibold">Chỉnh các đoạn tài liệu</summary><p className="mt-2 text-xs text-text-muted">Thay đổi đoạn sẽ xóa kết quả AI tạm của tài liệu này.</p><div className="mt-3 max-h-60 space-y-2 overflow-auto">{document.chunks.map((chunk, index) => <div key={chunk.id} className="flex flex-wrap justify-between gap-3 border-b border-border pb-2 text-sm"><span className="min-w-0 flex-1 truncate">{index + 1}. {chunk.text.slice(0, 70)} · ~{chunk.estimatedTokens} token</span><span className="flex gap-2">{document.generated?.[index] && <button onClick={() => resetGenerated(index)} className="text-accent">Sinh lại</button>}{chunk.text.length > 100 && <button onClick={() => splitChunk(index)} className="text-accent">Chia đôi</button>}{index < document.chunks.length - 1 && <button onClick={() => editChunks(document.chunks.filter((_, at) => at !== index + 1).map((item, at) => at === index ? `${chunk.text}\n${document.chunks[index + 1].text}` : item.text))} className="text-accent">Ghép với sau</button>}</span></div>)}</div><label className="mt-4 block text-sm">Thêm đoạn mới<textarea className="input mt-1 w-full" rows={3} value={extraText} onChange={(event) => setExtraText(event.target.value)} /></label><button disabled={!extraText.trim() || estimateTokens(extraText) > 3000} onClick={() => editChunks([...document.chunks.map((chunk) => chunk.text), extraText.trim()])} className="btn-secondary mt-2">Thêm đoạn</button><label className="mt-4 block text-sm">Hướng dẫn bổ sung cho Gemini<textarea className="input mt-1 w-full" rows={3} maxLength={1000} value={customInstruction} onChange={(event) => setCustomInstruction(event.target.value)} placeholder="Ví dụ: ưu tiên mẫu câu giao tiếp trong tài liệu" /></label><button onClick={() => resetGenerated()} className="btn-secondary mt-2">Xóa kết quả AI tạm và chạy lại</button></details>}
    {error && <p role="alert" className="rounded-md bg-error-subtle p-3 text-sm text-error">{error}</p>}
  </div>;
}
