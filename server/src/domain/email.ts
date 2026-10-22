export function retryDelay(attempt: number) {
  return Math.min(3600000, 60000 * 2 ** Math.max(0, Math.min(10, attempt - 1)));
}
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export function emailTemplate(name: string, title: string, message: string) {
  return {
    text:
      'ShiftSync\n\nHi ' +
      name +
      ',\n\n' +
      title +
      '\n' +
      message +
      '\n\nOpen ShiftSync to see the details.',
    html:
      '<!doctype html><html><body style="margin:0;background:#f6f7f4;font-family:Arial,sans-serif;color:#183e36"><main style="max-width:560px;margin:24px auto;padding:32px;background:white;border-radius:16px"><h1>ShiftSync.</h1><p>Hi ' +
      escapeHtml(name) +
      ',</p><h2>' +
      escapeHtml(title) +
      '</h2><p style="white-space:pre-wrap">' +
      escapeHtml(message) +
      '</p><p>Open ShiftSync to see the details.</p></main></body></html>',
  };
}
