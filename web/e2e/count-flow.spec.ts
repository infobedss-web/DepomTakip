import { test, expect } from '@playwright/test';
import pg from 'pg';
test('Mobile count: room join, owner approval, rack scan, blind quantity entry and report', async ({
  browser,
}) => {
  const owner = await browser.newContext({ baseURL: 'http://127.0.0.1:4100' });
  const counter = await browser.newContext({
    baseURL: 'http://127.0.0.1:4100',
    viewport: { width: 390, height: 844 },
  });
  let roomId: string | undefined;
  let counterId: string | undefined;
  let originalWarehouses: string[] | undefined;
  try {
    await owner.request.post('/api/auth/login', {
      data: { email: 'bayi@depomtakip.local', password: 'DepomTakip!2026' },
    });
    const stocks = await owner.request.get('/api/stocks').then((r) => r.json());
    const item = stocks[0];
    const locations = await owner.request.get('/api/locations').then((r) => r.json());
    const loc = locations.find((l: any) => l.id === item.location_id);
    const users = await owner.request.get('/api/users').then((r) => r.json());
    const user = users.find((u: any) => u.email === 'sayim@depomtakip.local');
    counterId = user.id;
    const assignedWarehouses = await owner.request
      .get('/api/users/' + user.id + '/warehouses')
      .then((r) => r.json());
    originalWarehouses = assignedWarehouses.filter((w: any) => w.assigned).map((w: any) => w.id);
    expect(
      (
        await owner.request.put('/api/users/' + user.id + '/warehouses', {
          data: { warehouse_ids: [...new Set([...originalWarehouses!, loc.warehouse_id])] },
        })
      ).status(),
    ).toBe(200);
    const created = await owner.request.post('/api/rooms', {
      data: {
        warehouse_id: loc.warehouse_id,
        name: 'Tarayıcı Sayımı ' + Date.now(),
        count_type: 'PARTIAL',
        method: 'INTERNAL',
        starts_at: new Date(Date.now() - 60000).toISOString(),
        ends_at: new Date(Date.now() + 86400000).toISOString(),
        stock_ids: [item.id],
      },
    });
    expect(created.status()).toBe(201);
    const room = await created.json();
    roomId = room.id;
    expect(
      (
        await owner.request.post('/api/rooms/' + room.id + '/assignments', {
          data: { user_id: user.id, location_id: loc.id },
        })
      ).status(),
    ).toBe(200);
    expect((await owner.request.post('/api/rooms/' + room.id + '/open')).status()).toBe(200);
    const page = await counter.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByLabel('E-posta adresi').fill('sayim@depomtakip.local');
    await page.getByLabel('Şifre', { exact: true }).fill('DepomTakip!2026');
    await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
    await page.getByLabel('Oda kodu', { exact: true }).fill(room.code);
    await page.getByRole('button', { name: 'Odaya Gir', exact: true }).click();
    await expect(
      page.getByText('Bayi yetkilisinin başlama onayı bekleniyor.', { exact: false }),
    ).toBeVisible();
    await owner.request.post('/api/rooms/' + room.id + '/approve-person', {
      data: { user_id: user.id },
    });
    await page.getByRole('button', { name: 'Onay Durumunu Yenile' }).click();
    await page.getByRole('button', { name: 'Kabul Et ve Sayıma Başla', exact: true }).click();
    await page.getByLabel('Reyon / lokasyon kodu').fill(loc.code);
    await page.getByRole('button', { name: 'Reyona Gir', exact: true }).click();
    await page.getByLabel('Barkod / SKU', { exact: true }).fill(item.barcode);
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/count/scan') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Tara', exact: true }).click();
    const scanned = await (await response).json();
    expect(scanned).not.toHaveProperty('physical');
    expect(scanned).not.toHaveProperty('expected');
    await expect(page.getByRole('heading', { name: item.name, exact: true })).toBeVisible();
    await page.getByLabel('Fiziksel miktar').fill('2');
    await page.locator('select[name="unit"]').selectOption({ label: 'Koli' });
    await page.screenshot({ path: 'docs/mobile-count-active.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Sayımı Kaydet' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Sayım kaydedildi' })).toBeVisible();
    await page.getByRole('button', { name: 'İlerlememi Gör' }).click();
    await expect(page.getByRole('dialog')).toContainText('2 Koli');
    await page.getByRole('button', { name: 'Kapat', exact: true }).click();
    await page.getByRole('button', { name: 'Sayımı Bitir', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Sayımı Bitir', exact: true })
      .click();
    await expect(page.getByText('Bu odadaki sayımınızı bitirdiniz.')).toBeVisible();
    expect((await owner.request.post('/api/rooms/' + room.id + '/complete')).status()).toBe(200);
    const report = await owner.request
      .get('/api/rooms/' + room.id + '/report')
      .then((r) => r.json());
    expect(Number(report.rows[0].counted)).toBe(24);
    expect(Number(report.rows[0].difference)).toBe(24 - Number(item.physical));
    expect(
      (
        await owner.request.post('/api/rooms/' + room.id + '/review', {
          data: { action: 'REJECT', reason: 'Browser test; demo stock unchanged' },
        })
      ).status(),
    ).toBe(200);
    expect(errors).toEqual([]);
  } finally {
    if (counterId && originalWarehouses)
      await owner.request.put('/api/users/' + counterId + '/warehouses', {
        data: { warehouse_ids: originalWarehouses },
      });
    if (roomId) {
      const connectionString =
        process.env.TEST_DATABASE_URL ||
        'postgresql://depomtakip:depomtakip_local@127.0.0.1:55432/depomtakip_test';
      if (!new URL(connectionString).pathname.endsWith('_test'))
        throw new Error('Test database required');
      const db = new pg.Pool({ connectionString });
      try {
        await db.query('DELETE FROM count_locks WHERE room_id=$1', [roomId]);
        await db.query('DELETE FROM active_locations WHERE room_id=$1', [roomId]);
        await db.query(
          "UPDATE rooms SET status='REJECTED' WHERE id=$1 AND status IN ('OPEN','COMPLETED')",
          [roomId],
        );
      } finally {
        await db.end();
      }
    }
    await owner.close();
    await counter.close();
  }
});
