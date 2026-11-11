import type { Page } from '@playwright/test';

/** Signs out through the header's user menu (the avatar + name button), like a person would. */
export async function signOut(page: Page): Promise<void> {
  await page.locator('button.user-trigger').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
}
