import { expect, test } from '@playwright/test';

test('Stock adjustment page renders and APIs return arrays', async ({ page }) => {
  const browserErrors: string[] = [];

  page.on('pageerror', (error) => {
    browserErrors.push(error.message);
  });

  await page.goto('/');

  await page.getByLabel('E-posta').fill('bayi@depomtakip.local');
  await page.getByLabel('\u015eifre').fill('DepomTakip!2026');

  await page
    .getByRole('button', {
      name: 'Giri\u015f Yap',
      exact: true,
    })
    .click();

  await expect(
    page.getByRole('heading', {
      name: 'Genel Bak\u0131\u015f',
      exact: true,
    }),
  ).toBeVisible();

  const sources = await page.request.get(
    '/api/stock-adjustments/sources',
  );

  expect(sources.status()).toBe(200);
  expect(Array.isArray(await sources.json())).toBe(true);

  const history = await page.request.get(
    '/api/stock-adjustments/history',
  );

  expect(history.status()).toBe(200);
  expect(Array.isArray(await history.json())).toBe(true);

  const nav = page.getByRole('button', {
    name: 'Stok D\u00fczeltme',
    exact: true,
  });

  await expect(nav).toBeVisible();
  await nav.click();

  await expect(
    page.getByRole('heading', {
      name: 'Stok D\u00fczeltme',
      exact: true,
    }),
  ).toBeVisible();

  expect(browserErrors).toEqual([]);
});