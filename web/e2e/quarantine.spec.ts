import { expect, test } from '@playwright/test';

test('Quarantine management screen renders without browser errors', async ({ page }) => {
  const browserErrors: string[] = [];

  page.on('pageerror', (error) => {
    browserErrors.push(error.message);
  });

  await page.goto('/');

  await page.getByLabel('E-posta').fill('bayi@bedss.local');
  await page.getByLabel('Şifre').fill('BedssDemo!2026');

  await page
    .getByRole('button', {
      name: 'Giriş Yap',
      exact: true,
    })
    .click();

  await expect(
    page.getByRole('heading', {
      name: 'Genel Bakış',
      exact: true,
    }),
  ).toBeVisible();

  const sources = await page.request.get('/api/quarantine/sources');
  expect(sources.status()).toBe(200);
  expect(Array.isArray(await sources.json())).toBe(true);

  const history = await page.request.get('/api/quarantine/history');
  expect(history.status()).toBe(200);
  expect(Array.isArray(await history.json())).toBe(true);

  const nav = page.getByRole('button', {
    name: 'Karantina Yönetimi',
    exact: true,
  });

  await expect(nav).toBeVisible();
  await nav.click();

  await expect(
    page.getByRole('heading', {
      name: 'Karantina Yönetimi',
      exact: true,
    }),
  ).toBeVisible();

  expect(browserErrors).toEqual([]);
});