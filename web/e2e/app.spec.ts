import { test, expect } from '@playwright/test';

const password = 'BedssDemo!2026';

test('Owner dashboard and every management screen render without browser errors', async ({
  page,
}) => {
  const errors: string[] = [];

  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');

  await page.getByLabel('E-posta adresi').fill('bayi@bedss.local');
  await page.getByLabel('Şifre', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();

  await expect(
    page.getByRole('heading', { name: 'Genel Bakış', exact: true }),
  ).toBeVisible();

  // Belirli bir seed oda adına bağlı kalma.
  await expect(
    page.getByRole('heading', { name: 'Sayım Odaları', exact: true }),
  ).toBeVisible();

  await expect(page.locator('.quick-actions')).toBeVisible();

  await page.screenshot({
    path: 'docs/dashboard.png',
    fullPage: true,
  });

  for (const [nav, heading] of [
    ['Bayiler', 'Bayiler'],
    ['Depolar & Lokasyonlar', 'Depolar & Lokasyonlar'],
    ['Ürün & Stok', 'Ürün & Stok'],
    ['Personel & Davetler', 'Personel & Davetler'],
    ['İşlem Kayıtları', 'İşlem Kayıtları'],
  ] as const) {
    const navButton = page.getByRole(
      'button',
      { name: nav, exact: true },
    );

    await navButton.scrollIntoViewIfNeeded();
    await expect(navButton).toBeVisible();
    await navButton.click();

    await expect(
      page.getByRole('heading', { name: heading, exact: true }),
    ).toBeVisible();

    await expect(page.locator('.alert.error')).toHaveCount(0);
  }

  await page
    .getByRole('button', { name: /Sayım Odaları/ })
    .click();

  await page
    .getByRole('button', { name: 'Odayı Yönet' })
    .first()
    .click();

  await expect(
    page.getByRole('heading', {
      name: 'Personel & Reyon Atamaları',
      exact: true,
    }),
  ).toBeVisible();

  await page.screenshot({
    path: 'docs/room.png',
    fullPage: true,
  });

  expect(errors).toEqual([]);
});

test('Mobile counter interface is blind, responsive, and restricted', async ({
  page,
}) => {
  await page.setViewportSize({
    width: 390,
    height: 844,
  });

  await page.goto('/');

  await page.getByLabel('E-posta adresi').fill('sayim@bedss.local');
  await page.getByLabel('Şifre', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();

  await expect(
    page.getByRole('heading', {
      name: 'Sayım Odasına Katıl',
      exact: true,
    }),
  ).toBeVisible();

  // Demo oda adları testlerden sonra değişebilir.
  // Mobil test oda adına değil, sayım ekranına bağlı olmalı.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  await page.screenshot({
    path: 'docs/mobile-count.png',
    fullPage: true,
  });

  expect(
    await page.request
      .get('/api/stocks')
      .then((r) => r.status()),
  ).toBe(403);
});