import { it, expect } from 'vitest';
import { retryDelay, emailTemplate, escapeHtml } from './email.js';
it('backs off exponentially with a one-hour cap', () => {
  expect([1, 2, 3, 4, 5].map(retryDelay)).toEqual([60000, 120000, 240000, 480000, 960000]);
  expect(retryDelay(100)).toBe(3600000);
  expect(retryDelay(0)).toBe(60000);
});
it('escapes all user text and retains readable plain text', () => {
  const result = emailTemplate('<Sam>', 'Time off approved', '<script>"Hi" & \'bye\'</script>');
  expect(result.html).not.toContain('<script>');
  expect(result.html).toContain('&lt;Sam&gt;');
  expect(result.text).toContain('<Sam>');
  expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
});
