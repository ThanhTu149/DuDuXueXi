const pendingScripts = new Map();

export function loadExternalScript(url, globalName) {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Chỉ có thể trích xuất tài liệu trong trình duyệt.'));
  }
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (pendingScripts.has(url)) return pendingScripts.get(url);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => fail('Quá thời gian tải thư viện.'), 30000);

    function fail(message) {
      clearTimeout(timeout);
      script.remove();
      pendingScripts.delete(url);
      reject(new Error(`${message} Kiểm tra kết nối mạng rồi thử lại.`));
    }

    script.src = url;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      clearTimeout(timeout);
      if (window[globalName]) resolve(window[globalName]);
      else fail('Thư viện tải xong nhưng không khởi tạo được.');
    };
    script.onerror = () => fail('Không tải được thư viện trích xuất.');
    document.head.appendChild(script);
  });
  pendingScripts.set(url, promise);
  return promise;
}
