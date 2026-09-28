import * as XLSX from 'xlsx';
import {
  fields,
  normalizeRows,
  MAX_IMPORT_ROWS,
  type ImportError,
} from '../../backend/src/import-contract.js';
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
// Inspect the ZIP directory before SheetJS allocates decompressed worksheet data.
export function inspectXlsxZip(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  let end = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--)
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === buffer.byteLength
    ) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('XLSX ZIP dizini geçersiz.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true),
    total = 0,
    sheets = 0;
  if (count > 2048 || view.getUint16(end + 4, true) !== 0 || offset === 0xffffffff)
    throw new Error('XLSX arşiv sınırı aşıldı veya arşiv biçimi desteklenmiyor.');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error('XLSX ZIP girdisi geçersiz.');
    const length = view.getUint16(offset + 28, true),
      size = view.getUint32(offset + 24, true);
    total += size;
    if (total > 80 * 1024 * 1024) throw new Error('Açılmış XLSX içeriği en fazla 80 MB olabilir.');
    const next =
      offset + 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (next > end) throw new Error('XLSX ZIP uzunluğu geçersiz.');
    const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, length));
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(name) && ++sheets > 10)
      throw new Error('Dosya en fazla 10 çalışma sayfası içerebilir.');
    offset = next;
  }
}
export type Cell = {
  value: string | number | boolean;
  type: string;
  formatted?: string;
  formula?: boolean;
};
export type Column = { id: string; title: string; index: number };
export type SheetData = {
  names: string[];
  sheet: string;
  columns: Column[];
  rows: { source_row: number; cells: Cell[] }[];
};
const fold = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]/g, '');
const aliases: Record<string, string[]> = {
  sku: ['stok kodu', 'ürün kodu', 'malzeme kodu'],
  barcode: ['barkod', 'ean', 'ean13', 'gtin'],
  name: ['ürün', 'ürün adı', 'malzeme adı'],
  variant: ['çeşit'],
  purchase_price: ['alış', 'maliyet'],
  sale_price: ['satış'],
  vat: ['kdv', 'kdv oranı'],
  min_stock: ['min stok'],
  max_stock: ['max stok'],
  box_size: ['koli', 'koli içi adet', 'koli miktarı'],
  pallet_size: ['palet', 'palet içi adet', 'palet miktarı'],
};
export function defaultMapping(columns: Column[]): Record<string, string> {
  const used = new Set<string>();
  return Object.fromEntries(
    columns.map((c) => {
      const match = fields.find(([key, label]) =>
        [key, label, ...(aliases[key] || [])].some((a) => fold(a) === fold(c.title)),
      )?.[0];
      const target = match && !used.has(match) ? match : 'custom';
      if (match) used.add(match);
      return [c.id, target];
    }),
  );
}
export function identityCell(cell: Cell): string {
  if (cell.formula)
    throw new Error('SKU/barkod formül olamaz; özgün kodları metin olarak yapıştırın.');
  if (cell.type === 'n') {
    const n = Number(cell.value);
    if (!Number.isSafeInteger(n) || n < 0 || String(n).length > 15)
      throw new Error(
        'Sayısal Excel kimliğinde hassasiyet kaybı riski (16+ hane). Özgün barkodu Metin hücresinde yeniden girin.',
      );
    // Recover zero padding only when the actual Excel number format supplies it.
    return cell.formatted && /^0\d+$/.test(cell.formatted) && Number(cell.formatted) === n
      ? cell.formatted
      : String(n);
  }
  return String(cell.value);
}
export function parseWorkbook(
  buffer: ArrayBuffer,
  filename: string,
  sheetName?: string,
): SheetData {
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error('Dosya en fazla 20 MB olabilir.');
  const ext = filename.split('.').pop()?.toLowerCase();
  const bytes = new Uint8Array(buffer);
  if (!['xlsx', 'xls', 'csv'].includes(ext || ''))
    throw new Error('Yalnızca XLSX, XLS ve UTF-8 CSV desteklenir.');
  if (
    (ext === 'xlsx' && (bytes[0] !== 0x50 || bytes[1] !== 0x4b)) ||
    (ext === 'xls' && (bytes[0] !== 0xd0 || bytes[1] !== 0xcf))
  )
    throw new Error('Excel dosya içeriği uzantısıyla uyuşmuyor.');
  if (ext === 'xlsx') inspectXlsxZip(buffer);
  let input: ArrayBuffer | string = buffer;
  if (ext === 'csv') {
    try {
      input = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new Error('CSV dosyasını UTF-8 olarak kaydedin.');
    }
    if (String(input).includes('\0')) throw new Error('CSV içeriği geçersiz.');
  }
  const book = XLSX.read(input, {
    type: typeof input === 'string' ? 'string' : 'array',
    raw: true,
    cellNF: true,
    cellText: true,
    sheetRows: MAX_IMPORT_ROWS + 2,
  });
  if (book.SheetNames.length > 10) throw new Error('Dosya en fazla 10 çalışma sayfası içerebilir.');
  const sheet = sheetName || book.SheetNames[0];
  const ws = book.Sheets[sheet];
  if (!ws || !ws['!ref']) throw new Error('Çalışma sayfası boş.');
  const range = XLSX.utils.decode_range(ws['!fullref'] || ws['!ref']);
  if (range.e.c >= 64 || range.e.r > MAX_IMPORT_ROWS || (range.e.r + 1) * (range.e.c + 1) > 2000000)
    throw new Error(
      'Çalışma sayfası sınırı: 50.000 veri satırı, 64 sütun ve 2 milyon hücre. Boş satırlar da sınıra dahildir.',
    );
  const cell = (r: number, c: number): Cell => {
    const v = ws[XLSX.utils.encode_cell({ r, c })];
    return { value: v?.v ?? '', type: v?.t || 's', formatted: v?.w, formula: !!v?.f };
  };
  const columns = Array.from({ length: range.e.c + 1 }, (_, index) => ({
    id: 'column-' + index,
    index,
    title: String(cell(0, index).value) || 'Sütun ' + (index + 1),
  }));
  const rows: SheetData['rows'] = [];
  for (let r = 1; r <= range.e.r; r++) {
    const cells = columns.map((c) => cell(r, c.index));
    if (cells.some((c) => c.value !== '')) rows.push({ source_row: r + 1, cells });
  }
  if (!rows.length)
    throw new Error('Aktarılacak veri satırı yok. İlk satır sütun başlıkları olmalı.');
  return { names: book.SheetNames, sheet, columns, rows };
}
export function mapSheet(data: SheetData, mapping: Record<string, string>) {
  const errors: ImportError[] = [];
  const used = new Set<string>();
  for (const col of data.columns) {
    const target = mapping[col.id];
    if (!target || target === 'custom') continue;
    if (!fields.some(([key]) => key === target))
      errors.push({ row: 1, field: target, type: 'MAPPING', message: 'Geçersiz DepomTakip alanı.' });
    if (used.has(target))
      errors.push({
        row: 1,
        field: target,
        type: 'MAPPING',
        message: 'Bir standart alana yalnızca bir sütun bağlanabilir.',
      });
    used.add(target);
  }
  for (const required of ['sku', 'barcode', 'name'])
    if (!used.has(required))
      errors.push({
        row: 1,
        field: required,
        type: 'MAPPING',
        message: required + ' sütununu eşleştirin.',
      });
  if (errors.length) return { rows: [], errors };
  const titles = new Map<string, number>();
  for (const col of data.columns) titles.set(col.title, (titles.get(col.title) || 0) + 1);
  const keys = new Set<string>(),
    customKeys = new Map<string, string>();
  for (const col of data.columns)
    if (mapping[col.id] === 'custom') {
      const special =
        ['__proto__', 'constructor', 'prototype'].includes(col.title) ||
        (titles.get(col.title) || 0) > 1;
      let key = special ? `column_${col.index + 1}_${col.title}` : col.title;
      while (keys.has(key)) key += '_' + (col.index + 1);
      keys.add(key);
      customKeys.set(col.id, key);
    }
  const raw = data.rows.map((source) => {
    const result: Record<string, unknown> = { source_row: source.source_row };
    const custom: Record<string, string | number | boolean> = Object.create(null);
    for (const col of data.columns) {
      const target = mapping[col.id];
      if (!target) continue;
      const cell = source.cells[col.index];
      if (target === 'custom') {
        // Keep readable headers when unique; dangerous and duplicate headers receive stable column IDs.
        custom[customKeys.get(col.id)!] = cell.value;
      } else if (target === 'sku' || target === 'barcode') {
        try {
          result[target] = identityCell(cell);
        } catch (e) {
          errors.push({
            row: source.source_row,
            field: target,
            type: 'IDENTITY_PRECISION',
            message: (e as Error).message,
          });
          result[target] = '';
        }
      } else
        result[target] = [
          'name',
          'category',
          'subcategory',
          'brand',
          'model',
          'variant',
          'supplier',
          'abc',
        ].includes(target)
          ? String(cell.value)
          : cell.value;
    }
    result.custom_fields = custom;
    return result;
  });
  const normalized = normalizeRows(raw);
  return { rows: normalized.rows, errors: [...errors, ...normalized.errors] };
}
