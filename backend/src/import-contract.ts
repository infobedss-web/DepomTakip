// Shared by browser and API. No database, Node, or framework dependencies.
export const MAX_BATCH_ROWS = 5000;
export const MAX_BATCH_BYTES = 6 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 50000;
export const MAX_CUSTOM_BYTES = 8192;
export const fields = [
  ['sku', 'SKU'],
  ['barcode', 'Barkod'],
  ['name', 'Ürün Adı'],
  ['category', 'Kategori'],
  ['subcategory', 'Alt Kategori'],
  ['brand', 'Marka'],
  ['model', 'Model'],
  ['variant', 'Varyant'],
  ['supplier', 'Tedarikçi'],
  ['purchase_price', 'Alış Fiyatı'],
  ['sale_price', 'Satış Fiyatı'],
  ['vat', 'KDV %'],
  ['min_stock', 'Minimum Stok'],
  ['max_stock', 'Maksimum Stok'],
  ['abc', 'ABC'],
  ['box_size', 'Koli Adedi'],
  ['pallet_size', 'Palet Adedi'],
] as const;
export type ImportError = {
  row: number;
  field: string;
  type: string;
  message: string;
  first_row?: number;
};
export type ImportRow = Record<string, unknown> & {
  source_row: number;
  sku: string;
  barcode: string;
  name: string;
  custom_fields: Record<string, string | number | boolean | null>;
};
export const byteSize = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
export function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJSON).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stableJSON((value as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
// Deliberately locale-independent; SQL bedss_product_key uses the exact same alphabet.
export function canonical(value: string): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÇĞİÖŞÜı',
    lower = 'abcdefghijklmnopqrstuvwxyzçğiöşüi';
  return value
    .replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '')
    .replace(/[A-ZÇĞİÖŞÜı]/g, (c) => lower[upper.indexOf(c)]);
}
export function identity(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('SKU/barkod metin olmalı; Excel sütununu Metin biçiminde kaydedin.');
  const text = value.trim();
  if (!text || text.length > 80) throw new Error('Kimlik alanı 1–80 karakter olmalı.');
  if (/^[+-]?\d+(?:[.,]\d+)?e[+-]?\d+$/i.test(text))
    throw new Error('Bilimsel gösterimli kimlik kabul edilmez; özgün metin kodunu kullanın.');
  if (!/^[A-Za-z0-9ÇĞİÖŞÜçğıöşü ._/:+\-#()]+$/.test(text))
    throw new Error(
      'Kimlikte yalnızca Latin/Türkçe harf, rakam ve desteklenen ayraçlar kullanılabilir.',
    );
  return text;
}
export function decimal(
  value: unknown,
  scale: number,
  max: number,
  defaultValue: number,
  positive = false,
): number {
  if (value === '' || value == null) return defaultValue;
  if (typeof value !== 'number' && typeof value !== 'string')
    throw new Error('Geçerli sayı girin.');
  let raw = String(value).trim();
  if (typeof value === 'string') {
    if (raw.includes(',') && raw.includes('.')) {
      if (/^[+-]?\d{1,3}(\.\d{3})+,\d+$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.');
      else if (/^[+-]?\d{1,3}(,\d{3})+\.\d+$/.test(raw)) raw = raw.replace(/,/g, '');
      else throw new Error('Binlik ve ondalık ayırıcı biçimi geçersiz.');
    } else if (raw.includes(',')) {
      if (!/^[+-]?\d+,\d+$/.test(raw)) throw new Error('Ondalık biçimi geçersiz.');
      if (/^[+-]?\d{1,3},\d{3}$/.test(raw))
        throw new Error('Belirsiz sayı; 1234 veya 1234,56 gibi açık biçim kullanın.');
      raw = raw.replace(',', '.');
    } else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(raw))
      throw new Error('Belirsiz binlik/ondalık biçimi; binlik ayırıcıyı kaldırın.');
  }
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw))
    throw new Error('Sayı biçimi geçersiz; yüzde veya bilimsel gösterim kullanmayın.');
  const fraction = (raw.split('.')[1] || '').replace(/0+$/, '');
  if (fraction.length > scale)
    throw new Error(`En fazla ${scale} ondalık basamak kullanılabilir; yuvarlama yapılmaz.`);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > max || (positive && n === 0))
    throw new Error(`Sayı ${positive ? '0’dan büyük' : '0 veya büyük'} ve en fazla ${max} olmalı.`);
  return n;
}
export function normalizeRows(rawRows: Record<string, unknown>[]): {
  rows: ImportRow[];
  errors: ImportError[];
} {
  const rows: ImportRow[] = [],
    errors: ImportError[] = [];
  const seen: Record<string, Map<string, number>> = {
    sku: new Map(),
    barcode: new Map(),
    source_row: new Map(),
  };
  rawRows.forEach((raw, index) => {
    const source = Number(raw.source_row);
    const line = Number.isInteger(source) && source >= 2 ? source : index + 2;
    const row: Record<string, unknown> = { source_row: line };
    let bad = false;
    const fail = (field: string, message: string, type = 'VALIDATION', first_row?: number) => {
      bad = true;
      errors.push({ row: line, field, type, message, first_row });
    };
    if (!Number.isInteger(source) || source < 2 || source > 1048576)
      fail('source_row', 'Gerçek Excel satır numarası gerekli.');
    for (const field of ['sku', 'barcode'])
      try {
        row[field] = identity(raw[field]);
      } catch (e) {
        fail(field, (e as Error).message);
      }
    const texts: Record<string, number> = {
      name: 200,
      category: 100,
      subcategory: 100,
      brand: 100,
      model: 100,
      variant: 150,
      supplier: 150,
    };
    for (const [field, max] of Object.entries(texts)) {
      const v = raw[field] ?? '';
      if (
        typeof v !== 'string' ||
        v.trim().length > max ||
        (field === 'name' && v.trim().length < 2)
      )
        fail(field, `Metin ${field === 'name' ? '2–' : '0–'}${max} karakter olmalı.`);
      else row[field] = v.trim();
    }
    const nums: Record<string, [number, number, number, boolean?]> = {
      purchase_price: [2, 999999999, 0],
      sale_price: [2, 999999999, 0],
      vat: [2, 100, 20],
      min_stock: [3, 999999999, 0],
      max_stock: [3, 999999999, 1000],
      box_size: [3, 100000, 12, true],
      pallet_size: [3, 1000000, 144, true],
    };
    for (const [field, args] of Object.entries(nums))
      try {
        row[field] = decimal(raw[field], ...args);
      } catch (e) {
        fail(field, (e as Error).message);
      }
    if (Number(row.min_stock) > Number(row.max_stock))
      fail('max_stock', 'Maksimum stok minimumdan küçük olamaz.');
    row.abc = String(raw.abc || 'C')
      .trim()
      .toUpperCase();
    if (!['A', 'B', 'C'].includes(String(row.abc))) fail('abc', 'ABC sınıfı A, B veya C olmalı.');
    const custom = raw.custom_fields ?? {};
    const safe: Record<string, string | number | boolean | null> = Object.create(null);
    if (!custom || typeof custom !== 'object' || Array.isArray(custom))
      fail('custom_fields', 'Özel alanlar anahtar/değer nesnesi olmalı.');
    else {
      if (Object.keys(custom).length > 32)
        fail('custom_fields', 'En fazla 32 özel alan kullanılabilir.');
      for (const [key, value] of Object.entries(custom)) {
        if (
          !key.trim() ||
          key.length > 100 ||
          ['__proto__', 'constructor', 'prototype'].includes(key)
        )
          fail('custom_fields', 'Özel alan adı geçersiz veya ayrılmış: ' + key);
        else if (value !== null && !['string', 'number', 'boolean'].includes(typeof value))
          fail('custom_fields', 'İç içe nesne/dizi kabul edilmez.');
        else if (
          (typeof value === 'string' && value.length > 2000) ||
          (typeof value === 'number' && !Number.isFinite(value))
        )
          fail('custom_fields', 'Özel alan değeri çok büyük veya geçersiz.');
        else safe[key] = value as string | number | boolean | null;
      }
      if (byteSize(safe) > MAX_CUSTOM_BYTES)
        fail('custom_fields', 'Özel alanlar satır başına en fazla 8 KB olabilir.');
    }
    row.custom_fields = safe;
    for (const field of ['sku', 'barcode', 'source_row'])
      if (row[field] !== undefined) {
        const key = canonical(String(row[field]));
        const first = seen[field].get(key);
        if (first !== undefined)
          fail(field, 'Dosya içinde tekrar; ilk Excel satırı ' + first, 'DUPLICATE_FILE', first);
        else seen[field].set(key, line);
      }
    if (!bad) rows.push(row as ImportRow);
  });
  return { rows, errors };
}
export function splitBatches<T>(
  rows: T[],
  maxRows = MAX_BATCH_ROWS,
  maxBytes = MAX_BATCH_BYTES,
): T[][] {
  const batches: T[][] = [];
  let batch: T[] = [],
    bytes = 1024;
  for (const row of rows) {
    const size = byteSize(row) + 1;
    if (size + 1024 > maxBytes) throw new Error('Tek ürün parti boyut sınırını aşıyor.');
    if (batch.length && (batch.length === maxRows || bytes + size > maxBytes)) {
      batches.push(batch);
      batch = [];
      bytes = 1024;
    }
    batch.push(row);
    bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
