import { useEffect, useRef, useState } from 'react';
import { validateFile } from '../lib/fileDetector.js';
import { extractTextFromPdf } from '../lib/pdfExtractor.js';
import { extractTextFromDocx } from '../lib/docxExtractor.js';
import { extractTextFromTxt } from '../lib/txtExtractor.js';
import { chunkText } from '../lib/chunker.js';
import { detectChapters } from '../lib/chapterDetector.js';
import { attachRawDocument, getCourse } from '../lib/db.js';

export default function ImportScreen({ courseId, onBack, onSaved }) {
  const [course, setCourse] = useState(null);
  const [file, setFile] = useState(null);
  const [stage, setStage] = useState('choose');
  const [progress, setProgress] = useState({ current: 0, total: 1 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const controller = useRef(null);
  useEffect(() => { getCourse(courseId).then(setCourse).catch((cause) => setError(cause.message)); return () => controller.current?.abort(); }, [courseId]);
  const choose = (selected) => {
    const check = validateFile(selected);
    setError(check.ok ? '' : check.error);
    setFile(check.ok ? selected : null);
    setResult(null);
    if (check.warning) setError(check.warning);
  };
  const extract = async () => {
    const check = validateFile(file);
    if (!check.ok) { setError(check.error); return; }
    controller.current = new AbortController();
    setStage('extract'); setError('');
    try {
      const onProgress = (current, total) => setProgress({ current, total });
      const extracted = check.type === 'pdf' ? await extractTextFromPdf(file, onProgress, controller.current.signal)
        : check.type === 'docx' ? await extractTextFromDocx(file, onProgress, controller.current.signal)
          : await extractTextFromTxt(file, onProgress, controller.current.signal);
      if (extracted.isScanned) throw new Error('PDF scan ảnh chưa được hỗ trợ. Hãy dùng PDF có lớp chữ hoặc tệp TXT/DOCX.');
      if (!extracted.text?.trim()) throw new Error('Không tìm thấy văn bản trong tài liệu.');
      const chunks = chunkText(extracted.text);
      const chapters = detectChapters(extracted.text).map((chapter) => ({ ...chapter, chunkIndex: chunks.findIndex((chunk) => chunk.charEnd > chapter.charStart) }));
      setResult({ ...extracted, chunks, chapters, fileType: check.type });
      setStage('preview');
    } catch (cause) { if (cause.name !== 'AbortError') setError(cause.message); setStage('choose'); }
  };
  const save = async () => {
    if (!result) return;
    setStage('save'); setError('');
    try {
      const doc = { id: `doc-${crypto.randomUUID()}`, courseId, fileName: file.name, fileSize: file.size, fileType: result.fileType, extractedText: result.text, textLength: result.text.length, chunks: result.chunks, chunkCount: result.chunks.length, status: 'chunked', detectedStructure: { chapters: result.chapters }, extractedAt: new Date().toISOString(), error: null, generated: {} };
      await attachRawDocument(courseId, doc);
      onSaved(courseId);
    } catch (cause) { setError(cause.message); setStage('preview'); }
  };
  return <div className="space-y-5"><button onClick={onBack} className="text-sm text-accent">← Thư viện</button><header><p className="text-xs font-semibold uppercase text-accent">{course?.name || 'Khóa học'}</p><h1 className="mt-1 font-serif text-2xl font-semibold">Nhập tài liệu</h1><p className="mt-2 text-sm text-text-secondary">PDF có lớp chữ, DOCX hoặc TXT. Tối đa 100 MB. Tài liệu lưu trên trình duyệt này.</p></header>
    {error && <p role="alert" className="rounded-md bg-error-subtle p-3 text-sm text-error">{error}</p>}
    {stage === 'choose' && <div className={`rounded-lg border border-dashed bg-bg-secondary p-6 transition-colors duration-200 ${dragging ? 'border-accent bg-accent-subtle' : 'border-border-strong'}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files?.[0]); }}><label htmlFor="document-upload" className="mb-3 block text-sm font-semibold">Kéo thả tài liệu vào đây hoặc chọn tệp</label><input id="document-upload" aria-label="Chọn tài liệu PDF, DOCX hoặc TXT" type="file" accept=".pdf,.docx,.txt" onChange={(event) => choose(event.target.files?.[0])} className="block w-full text-sm" /><p role="status" className="mt-3 text-sm text-text-secondary">{file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : 'PDF có lớp chữ, DOCX hoặc TXT.'}</p><button disabled={!file} onClick={extract} className="btn-primary mt-4">Trích xuất văn bản</button></div>}
    {stage === 'extract' && <div className="rounded-lg border border-border bg-bg-secondary p-5"><p className="font-semibold">Đang đọc tài liệu…</p><progress className="mt-3 w-full" value={progress.current} max={progress.total} /><p className="text-sm text-text-muted">{progress.current}/{progress.total} trang hoặc bước</p><button onClick={() => controller.current?.abort()} className="btn-secondary mt-3">Hủy</button></div>}
    {result && (stage === 'preview' || stage === 'save') && <><div className="grid grid-cols-3 gap-2 text-center text-sm"><div className="rounded-md bg-bg-secondary p-3"><strong className="block text-lg">{result.text.length.toLocaleString()}</strong>Ký tự</div><div className="rounded-md bg-bg-secondary p-3"><strong className="block text-lg">{result.chunks.length}</strong>Đoạn</div><div className="rounded-md bg-bg-secondary p-3"><strong className="block text-lg">{result.chapters.length}</strong>Chương nhận diện</div></div><section><h2 className="mb-2 font-semibold">Văn bản trích xuất</h2><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-bg-secondary p-4 text-sm">{result.text.slice(0, 5000)}</pre></section><section><h2 className="mb-2 font-semibold">Các đoạn sẽ xử lý</h2><div className="max-h-52 space-y-1 overflow-auto">{result.chunks.map((chunk) => <div key={chunk.id} className="flex justify-between border-b border-border py-2 text-sm"><span>Đoạn {chunk.index + 1}: {chunk.text.slice(0, 65)}…</span><span className="shrink-0 text-text-muted">~{chunk.estimatedTokens} token</span></div>)}</div></section><button disabled={stage === 'save'} onClick={save} className="btn-primary">Lưu tài liệu và tiếp tục</button></>}
  </div>;
}
