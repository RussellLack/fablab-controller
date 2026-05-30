import { Page, expect } from '@playwright/test';

/** Test seed user — must exist in the database (created via `npm run db:seed`). */
export const TEST_EMAIL = 'seed@fablab.no';

/** Hit the test-only login endpoint to mint a session for the seed user. */
export async function loginAsSeedUser(page: Page) {
  const res = await page.request.post('/api/test/login', {
    data: { email: TEST_EMAIL }
  });
  if (!res.ok()) {
    throw new Error(
      `Test login failed: ${res.status()} ${await res.text()}\n` +
      `Make sure ENABLE_TEST_LOGIN=1 + SUPABASE_SERVICE_ROLE_KEY are set when running the dev server.`
    );
  }
}

/** Switch the UI language via the EN/NO toggle. */
export async function setLanguage(page: Page, locale: 'en' | 'no') {
  await page.locator(`button[data-lang-set="${locale}"]`).first().click().catch(async () => {
    // Fallback: the toggle in our app uses inline state, click by visible text
    await page.getByRole('button', { name: locale.toUpperCase() }).first().click();
  });
}

/** Wait for the page to settle (post-RSC stream + revalidation). */
export async function waitForReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => { /* allow live sockets */ });
}
