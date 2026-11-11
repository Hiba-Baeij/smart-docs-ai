import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { DocumentSummary, Message, SourceReference } from '@smartdocs/contracts';
import { signOut } from './support';

const fixture = (name: string) => join(__dirname, '..', 'apps', 'api', 'test', 'fixtures', name);
const files = ['text-3-pages.pdf', 'headings.docx', 'budget.xlsx'] as const;

for (const locale of ['en', 'ar'] as const) {
  test(`documents upload and preflight in ${locale}`, async ({ page }) => {
    const documents: DocumentSummary[] = [];
    const uploaded: string[] = [];
    await page.addInitScript((language) => localStorage.setItem('smartdocs.locale', language), locale);
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/auth/me') {
        await route.fulfill({ json: { id: 'browser-user', name: 'Browser User', email: 'browser@example.com', createdAt: '2026-01-01T00:00:00.000Z' } });
      } else if (url.pathname === '/api/documents' && request.method() === 'GET') {
        await route.fulfill({ json: { items: [...documents].reverse(), page: 1, pageSize: 20, total: documents.length } });
      } else if (url.pathname === '/api/documents/upload' && request.method() === 'POST') {
        const body = request.postData() ?? '';
        const name = files.find((item) => body.includes(item));
        if (!name) throw new Error('Unexpected upload payload');
        uploaded.push(name);
        const document: DocumentSummary = {
          id: `doc-${uploaded.length}`,
          originalName: name,
          fileType: name.split('.').at(-1) as DocumentSummary['fileType'],
          status: 'COMPLETED',
          errorCode: null,
          chunkCount: 2,
          createdAt: new Date().toISOString(),
        };
        documents.push(document);
        await route.fulfill({ json: document });
      } else {
        throw new Error(`Unexpected API request: ${request.method()} ${url.pathname}`);
      }
    });

    await page.goto('/documents');
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('app-document-upload')).toBeVisible();
    const input = page.locator('input[type="file"]');

    for (const name of files) {
      await input.setInputFiles(fixture(name));
      await expect(page.locator('tbody tr').filter({ hasText: name })).toContainText(locale === 'ar' ? 'جاهز' : 'Ready');
    }
    expect(uploaded).toEqual(files);

    for (const selected of [
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') },
      { name: 'empty.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) },
      { name: 'large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
    ]) {
      await input.setInputFiles(selected);
      await expect(page.locator('.upload .failure')).toBeVisible();
    }
    expect(uploaded).toEqual(files);
    await expect(page.locator('.upload .reason')).toContainText(locale === 'ar' ? '10 ميغابايت' : '10 MB');
  });
}

test('protected deep link restores a cookie session after login and reload', async ({ page, context }) => {
  const user = { id: 'browser-user', name: 'Browser User', email: 'browser@example.com', createdAt: '2026-01-01T00:00:00.000Z' };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const signedIn = (request.headers()['cookie'] ?? '').includes('sid=browser-session');
    if (url.pathname === '/api/auth/me') {
      await route.fulfill(signedIn ? { json: user } : { status: 401, json: { code: 'AUTH_REQUIRED', message: 'Sign in required.' } });
    } else if (url.pathname === '/api/auth/login' && request.method() === 'POST') {
      await route.fulfill({ json: { user }, headers: { 'set-cookie': 'sid=browser-session; Path=/; HttpOnly; SameSite=Lax' } });
    } else if (url.pathname === '/api/auth/logout' && request.method() === 'POST') {
      await route.fulfill({ status: 204, headers: { 'set-cookie': 'sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' } });
    } else if (url.pathname === '/api/documents' && signedIn) {
      await route.fulfill({ json: { items: [], page: 1, pageSize: 20, total: 0 } });
    } else {
      throw new Error(`Unexpected API request: ${request.method()} ${url.pathname}`);
    }
  });

  await page.goto('/documents');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdocuments/);
  await page.locator('#login-email').fill('browser@example.com');
  await page.locator('#login-password').fill('browser-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/documents$/);
  expect((await context.cookies()).find((cookie) => cookie.name === 'sid')?.httpOnly).toBe(true);

  await page.reload();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();

  await signOut(page);
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/documents');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdocuments/);
});

test('long chat opens at recent messages, loads older ones, and recovers a failed question', async ({ page }) => {
  const now = '2026-01-01T00:00:00.000Z';
  const user = { id: 'browser-user', name: 'Browser User', email: 'browser@example.com', createdAt: now };
  const source: SourceReference = { documentId: 'gone', documentName: 'Removed.pdf', chunkIndex: 0, pageNumber: 2, sheetName: null };
  const messages: Message[] = Array.from({ length: 100 }, (_, index) => ({
    id: `message-${index + 1}`,
    role: index === 99 ? 'assistant' : 'user',
    content: `Message ${index + 1}`,
    sources: index === 99 ? [source] : [],
    createdAt: now,
  }));
  let sends = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') {
      await route.fulfill({ json: user });
    } else if (url.pathname === '/api/documents') {
      await route.fulfill({ json: { items: [], page: 1, pageSize: 100, total: 0 } });
    } else if (url.pathname === '/api/documents/gone') {
      await route.fulfill({ status: 404, json: { code: 'DOCUMENT_NOT_FOUND', message: 'Gone' } });
    } else if (url.pathname === '/api/conversations') {
      await route.fulfill({ json: { items: [{ id: 'conv-1', title: 'Long thread', createdAt: now, updatedAt: now }], page: 1, pageSize: 100, total: 1 } });
    } else if (url.pathname === '/api/conversations/conv-1/messages' && request.method() === 'GET') {
      const number = Number(url.searchParams.get('page') ?? '1');
      await route.fulfill({ json: { items: messages.slice((number - 1) * 50, number * 50), page: number, pageSize: 50, total: 100 } });
    } else if (url.pathname === '/api/conversations/conv-1/messages' && request.method() === 'POST') {
      sends++;
      if (sends === 1) {
        await route.fulfill({ status: 503, json: { code: 'AI_UNAVAILABLE', message: 'Try again.' } });
      } else {
        await route.fulfill({ json: {
          userMessage: { id: 'saved-question', role: 'user', content: 'Unknown fact?', sources: [], createdAt: now },
          message: { id: 'fallback', role: 'assistant', content: 'ليس لدي معلومات كافية للإجابة عن سؤالك.', sources: [], createdAt: now },
        } });
      }
    } else {
      throw new Error(`Unexpected API request: ${request.method()} ${url.pathname}`);
    }
  });

  await page.goto('/chat');
  await page.getByRole('button', { name: 'Long thread' }).click();
  const bubbles = page.locator('article.msg');
  await expect(bubbles).toHaveCount(50);
  await expect(bubbles.first()).toContainText('Message 51');
  await expect(bubbles.last()).toContainText('Message 100');
  await expect(page.locator('.source-chip.unavailable')).toContainText('Removed.pdf');

  await page.getByRole('button', { name: 'Load more messages' }).click();
  await expect(bubbles).toHaveCount(100);
  await expect(bubbles.first()).toContainText('Message 1');
  await expect(bubbles.last()).toContainText('Message 100');

  await page.locator('#question').fill('Unknown fact?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry question' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry question' }).click();
  const lastAnswer = page.locator('article.msg:not(.me)').last();
  await expect(lastAnswer.locator('app-assistant-markdown p')).toHaveText('ليس لدي معلومات كافية للإجابة عن سؤالك.');
  await expect(lastAnswer.locator('.source-chip')).toHaveCount(0);
  expect(sends).toBe(2);

  await page.setViewportSize({ width: 320, height: 720 });
  await page.evaluate(() => localStorage.setItem('smartdocs.locale', 'ar'));
  await page.reload();
  await page.getByRole('button', { name: 'Long thread' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('label[for="question"]')).toHaveText('سؤالك');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
