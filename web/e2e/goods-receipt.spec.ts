import { test, expect } from '@playwright/test';

test.use({
  baseURL: process.env.BEDSS_BROWSER_URL || 'http://127.0.0.1:4100',
});

test('Dashboard and Goods Receipt render with the real API array responses', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.log('BROWSER ERROR:', error.message);
  });

  await page.goto('/');

  await page.getByLabel('E-posta adresi').fill('bayi@bedss.local');
  await page.getByLabel('Şifre', { exact: true }).fill('BedssDemo!2026');

  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/login') &&
      response.request().method() === 'POST',
  );

  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();

  expect((await loginResponse).status()).toBe(200);

  for (const path of [
    '/warehouses',
    '/locations',
    '/products',
    '/goods-receipts',
  ]) {
    const response = await page.request.get('/api' + path);

    expect(response.status(), path).toBe(200);

    expect(
      Array.isArray(await response.json()),
      path + ' must return an array',
    ).toBe(true);
  }

  await expect(
    page.getByRole('heading', {
      name: 'Genel Bakış',
      exact: true,
    }),
  ).toBeVisible();

  await expect(page.locator('.quick-actions')).toBeVisible();

  expect(errors).toEqual([]);

  await page
    .locator('nav')
    .getByRole('button', {
      name: 'Mal Kabul',
      exact: true,
    })
    .click();

  await expect(
    page.getByRole('heading', {
      name: 'Mal Kabul',
      exact: true,
    }),
  ).toBeVisible();

  await expect(
    page.getByRole('heading', {
      name: 'Yeni Mal Kabul',
      exact: true,
    }),
  ).toBeVisible();

  await expect(
    page.getByRole('heading', {
      name: 'Ürünler',
      exact: true,
    }),
  ).toBeVisible();

  await expect(
    page.getByRole('heading', {
      name: 'Mal Kabul Geçmişi',
      exact: true,
    }),
  ).toBeVisible();

  await expect(
    page.getByLabel('Depo'),
  ).toBeVisible();

  await expect(
    page.getByLabel('Tedarikçi'),
  ).toBeVisible();

  await expect(
    page.getByLabel('Belge / İrsaliye No'),
  ).toBeVisible();

  await expect(
    page.getByLabel('Belge Fotoğrafı / PDF'),
  ).toBeVisible();

  await expect(
    page.getByRole('button', {
      name: 'Taslak Oluştur',
      exact: true,
    }),
  ).toBeVisible();

  const productSelect = page.locator('form tbody select').first();

  await expect(
    productSelect.locator('option'),
  ).not.toHaveCount(1);

  await page
    .getByRole('button', {
      name: '+ Satır Ekle',
      exact: true,
    })
    .click();

  await expect(
    page.locator('form tbody tr'),
  ).toHaveCount(2);

  await page.screenshot({
    path: 'docs/goods-receipt.png',
    fullPage: true,
  });

  expect(errors).toEqual([]);
});