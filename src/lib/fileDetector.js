const MAX_SIZE = 100 * 1024 * 1024;
const WARNING_SIZE = 50 * 1024 * 1024;
const MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

export function detectFileType(file) {
  const extension = file?.name?.split('.').pop()?.toLowerCase();
  return Object.hasOwn(MIME_TYPES, extension) ? extension : 'unknown';
}

export function validateFile(file) {
  if (!file) return { ok: false, error: 'Vui lòng chọn một tệp.' };
  const type = detectFileType(file);
  if (type === 'unknown') return { ok: false, error: 'Định dạng không hỗ trợ. Chỉ nhận PDF, DOCX, TXT.' };
  if (file.size > MAX_SIZE) {
    return { ok: false, error: `File quá lớn (${(file.size / 1048576).toFixed(1)} MB). Vui lòng chọn file dưới 100 MB.` };
  }
  if (file.size === 0) return { ok: false, error: 'Tệp trống. Vui lòng chọn tệp khác.' };
  if (file.type && file.type !== 'application/octet-stream' && file.type !== MIME_TYPES[type]) {
    return { ok: false, error: 'Loại nội dung không khớp với phần mở rộng tệp.' };
  }
  return {
    ok: true,
    type,
    warning: file.size > WARNING_SIZE ? 'File trên 50 MB có thể mất vài phút để trích xuất.' : null,
  };
}
