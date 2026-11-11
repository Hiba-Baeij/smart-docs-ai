import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { signOut } from './support';

/** The fixed answer when the evidence is not enough (docs/integration/api-contract.md). Exact, no extras. */
const INSUFFICIENT_EVIDENCE = 'ليس لدي معلومات كافية للإجابة عن سؤالك.';

const DOCUMENT = join(__dirname, '..', 'apps', 'api', 'test', 'fixtures', 'headings.docx');

/**
 * The whole product in one pass, in a real browser, against an empty database:
 * register, sign in, upload, ask something the document answers (and see the source), ask something
 * it does not (and see the exact fallback with no sources), sign out.
 *
 * The answers come from the deterministic mock provider, so this proves the plumbing end to end
 * (upload, extraction, chunking, search, the evidence rule, the citation, the page), not the quality
 * of a language model.
 */
test('register, upload, ask with a citation, ask without evidence, sign out', async ({ page }) => {
  const password = `e2e-${randomUUID()}`;

  await test.step('register', async () => {
    await page.goto('/register');
    await page.locator('#register-name').fill('Journey User');
    await page.locator('#register-email').fill('journey@example.com');
    await page.locator('#register-password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Account created')).toBeVisible();
  });

  await test.step('sign in', async () => {
    await page.locator('#login-email').fill('journey@example.com');
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByText('You have no documents yet')).toBeVisible();
  });

  await test.step('upload a document and see it ready', async () => {
    await page.locator('input[type="file"]').setInputFiles(DOCUMENT);

    // The text is in the page and in the toast; the page's own status is what this step is about.
    await expect(page.getByRole('main').getByText('headings.docx was uploaded.')).toBeVisible();
    const row = page.getByRole('row', { name: /headings\.docx/ });
    await expect(row).toContainText('Ready');
    await expect(row).toContainText('DOCX');
  });

  await test.step('ask a question the document answers: an answer and a source', async () => {
    await page.goto('/chat');
    await page.getByRole('button', { name: 'New conversation' }).click();
    await page.locator('#question').fill('When are invoices due?');
    await page.locator('#question').press('Enter');

    const answer = page.locator('article.msg:not(.me)').last();
    await expect(answer).toContainText('Invoices are due within 30 days');
    const source = answer.locator('a.source-chip');
    await expect(source).toHaveText(/headings\.docx/);

    await source.click();
    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('headings.docx');
  });

  await test.step('ask a question the document does not answer: the exact fallback, no sources', async () => {
    await page.goto('/chat');
    await page.getByRole('button', { name: /When are invoices due/ }).click();
    await page.locator('#question').fill('What is the airspeed velocity of an unladen swallow?');
    await page.locator('#question').press('Enter');

    const bubbles = page.locator('article.msg:not(.me)');
    await expect(bubbles).toHaveCount(2);
    const fallback = bubbles.last();
    await expect(fallback.locator('p').first()).toHaveText(INSUFFICIENT_EVIDENCE);
    await expect(fallback.locator('a.source-chip, .source-chip')).toHaveCount(0);
  });

  await test.step('delete the document from its row: a confirmation first, then a toast and an empty list', async () => {
    await page.goto('/documents');
    await page.getByRole('button', { name: 'Actions for headings.docx' }).click();
    await page.getByRole('menuitem', { name: 'Delete this document' }).click();

    // Nothing is deleted until the dialog is confirmed, and it starts on the safe choice.
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('headings.docx');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Yes, delete it' }).click();

    await expect(page.getByText('Document deleted.')).toBeVisible();
    await expect(page.getByText('You have no documents yet')).toBeVisible();
  });

  await test.step('sign out, and the protected pages are closed again', async () => {
    await signOut(page);
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/chat');
    await expect(page).toHaveURL(/\/login/);
  });
});
