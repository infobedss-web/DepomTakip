import { test, expect } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
const csv = (tag: string) =>
  Buffer.from(
    `SKU;Barkod;Ürün Adı;Renk;Renk;__proto__\n${tag};001234567890123456${tag};Deneme Ürün;mavi;sarı;güvenli\n`,
  );
test('Explicit business, safe mapping, stale-file reset, lost response and persisted resume', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('E-posta adresi').fill('admin@bedss.local');
  await page.getByLabel('Şifre', { exact: true }).fill('BedssDemo!2026');
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  await page
    .locator('nav')
    .getByRole('button', { name: 'Excel / CSV Ürün Aktar', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Toplu Ürün Aktarımı', exact: true }),
  ).toBeVisible();
  const business = page.getByLabel('Aktarım işletmesi'),
    input = page.getByLabel('Excel / CSV Dosyası'),
    save = page.getByRole('button', { name: 'Doğrula ve Kaydet', exact: true });
  await expect(business).toHaveValue('');
  const tag = randomUUID().slice(0, 8);
  const file = { name: `browser-${tag}.csv`, mimeType: 'text/csv', buffer: csv(tag) };
  await input.setInputFiles(file);
  await expect(page.getByRole('heading', { name: 'Kolon Eşleştirme' })).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(page.getByLabel('Sütun 1 eşleştirme')).toHaveValue('sku');
  await expect(page.getByLabel('Sütun 2 eşleştirme')).toHaveValue('barcode');
  await expect(page.getByLabel('Sütun 4 eşleştirme')).toHaveValue('custom');
  await expect(page.getByLabel('Sütun 5 eşleştirme')).toHaveValue('custom');
  await input.setInputFiles({
    name: 'broken.xlsx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not a workbook'),
  });
  await expect(page.getByRole('alert')).toContainText('uyuşmuyor');
  await expect(page.getByRole('heading', { name: 'Kolon Eşleştirme' })).toHaveCount(0);
  await expect(save).toHaveCount(0);
  await input.setInputFiles(file);
  await expect(save).toBeVisible();
  const list = await (await page.request.get('/api/businesses')).json();
  const target = list.find((b: any) => b.name === 'Anadolu Demo Bayi') || list[0];
  await business.selectOption(target.id);
  await expect(save).toBeEnabled();
  let confirmed = '';
  page.on('dialog', async (d) => {
    confirmed = d.message();
    await d.accept();
  });
  let lose = true;
  await page.route('**/api/products/bulk', async (route) => {
    const body = route.request().postDataJSON();
    if (body.mode === 'COMMIT' && lose) {
      lose = false;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await save.click();
  await expect(page.getByRole('region', { name: 'Aktarım ilerlemesi' })).toContainText(
    'Kaydedilen: 1',
  );
  expect(confirmed).toContain(target.name);
  await expect(save).toBeDisabled();
  expect(errors).toEqual([]);
  const imports = await (await page.request.get('/api/products/bulk/jobs')).json();
  const job = imports.find((j: any) => j.filename === file.name);
  expect(job.status).toBe('COMPLETED');
  expect(job.inserted).toBe(1);
  await page.reload();
  await page
    .locator('nav')
    .getByRole('button', { name: 'Excel / CSV Ürün Aktar', exact: true })
    .click();
  await expect(page.getByText(new RegExp(file.name)).first()).toBeVisible();
  await page.getByLabel('Excel / CSV Dosyası').setInputFiles(file);
  await page.getByLabel('Aktarım işletmesi').selectOption(target.id);
  await page.getByRole('button', { name: 'Doğrula ve Kaydet', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Aktarım ilerlemesi' })).toContainText(
    'Kaydedilen: 1',
  );
  await expect(page.getByRole('button', { name: 'Doğrula ve Kaydet', exact: true })).toBeDisabled();
  const products = await (await page.request.get('/api/products?business_id=' + target.id)).json();
  const matches = products.filter((p: any) => p.sku === tag);
  expect(matches).toHaveLength(1);
  expect(matches[0].barcode).toBe('001234567890123456' + tag);
  expect(matches[0].custom_fields.column_4_Renk).toBe('mavi');
  expect(matches[0].custom_fields.column_5_Renk).toBe('sarı');
  expect(matches[0].custom_fields.column_6___proto__).toBe('güvenli');
  expect(errors).toEqual([]);
});
test('Only the latest selected file can become importable', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('E-posta adresi').fill('bayi@bedss.local');
  await page.getByLabel('Şifre', { exact: true }).fill('BedssDemo!2026');
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  await page
    .locator('nav')
    .getByRole('button', { name: 'Excel / CSV Ürün Aktar', exact: true })
    .click();
  await page.evaluate(() => {
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    for (const [name, text] of [
      ['old.csv', 'SKU;Barkod;Ürün Adı\nOLD;0001;Eski Ürün'],
      ['new.csv', 'SKU;Barkod;Ürün Adı\nNEW;0002;Yeni Ürün'],
    ]) {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], name, { type: 'text/csv' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await expect(page.getByRole('cell', { name: 'NEW', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'OLD', exact: true })).toHaveCount(0);
});
test('Resume button finishes a persisted partial job without repeating batch one', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('E-posta adresi').fill('bayi@bedss.local');
  await page.getByLabel('Şifre', { exact: true }).fill('BedssDemo!2026');
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  await expect(page.locator('nav')).toBeVisible();
  const business = (await (await page.request.get('/api/businesses')).json())[0],
    tag = randomUUID().slice(0, 8),
    filename = 'resume-' + tag + '.csv';
  const response = await page.request.post('/api/products/bulk', {
    data: {
      mode: 'START',
      business_id: business.id,
      file_hash: createHash('sha256').update(tag).digest('hex'),
      mapping_hash: 'a'.repeat(64),
      filename,
      total_rows: 2,
      total_batches: 2,
    },
  });
  expect(response.status()).toBe(200);
  const job = (await response.json()).job;
  for (let n = 1; n <= 2; n++)
    expect(
      (
        await page.request.post('/api/products/bulk', {
          data: {
            mode: 'VALIDATE',
            job_id: job.id,
            batch_no: n,
            rows: [
              {
                source_row: n + 1,
                sku: tag + '-' + n,
                barcode: '00' + tag + '-' + n,
                name: 'Resume Ürün',
              },
            ],
          },
        })
      ).status(),
    ).toBe(200);
  await page
    .locator('nav')
    .getByRole('button', { name: 'Excel / CSV Ürün Aktar', exact: true })
    .click();
  page.on('dialog', (d) => d.accept());
  let stop = true;
  await page.route('**/api/products/bulk', async (route) => {
    const body = route.request().postDataJSON();
    if (body.mode === 'COMMIT' && body.batch_no === 2 && stop) {
      stop = false;
      await route.abort('failed');
    } else await route.continue();
  });
  await page
    .getByText(new RegExp(filename))
    .locator('..')
    .getByRole('button', { name: 'Devam Et' })
    .click();
  const progress = page.getByRole('region', { name: 'Aktarım ilerlemesi' });
  await expect(progress).toContainText('Aktarım durdu');
  await expect(progress).toContainText('Kaydedilen: 1');
  await expect(progress).toContainText('Kalan: 1');
  await progress.getByRole('button', { name: 'Devam Et' }).click();
  await expect(progress).toContainText('Aktarım tamamlandı');
  await expect(progress).toContainText('Kaydedilen: 2');
  await expect(progress).toContainText('Kalan: 0');
  const current = await (await page.request.get('/api/products/bulk/jobs/' + job.id)).json();
  expect(current.inserted).toBe(2);
  expect(current.batches.map((b: any) => b.status)).toEqual(['COMMITTED', 'COMMITTED']);
});
