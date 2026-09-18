export class ApiError extends Error {
  constructor(
    public status: number,
    public data: any,
  ) {
    super(
      (data.error || 'İstek tamamlanamadı.') + (data.details ? ' ' + data.details.join(' / ') : ''),
    );
  }
}
export const API_BASE = import.meta.env.VITE_API_URL || '';

export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(API_BASE + '/api' + path, {
    method,
    credentials: 'include',
    headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await r.json();
  
if (!r.ok) {
  const err = new ApiError(r.status, data);
  err.message = '[HTTP ' + r.status + '] ' + path + ' -> ' + err.message;
  throw err;
}
  return data;
}
export type Row = Record<string, any>;
export const roles: Record<string, string> = {
  SUPER_ADMIN: 'Sistem Yetkilisi',
  FIRM_ADMIN: 'Firma Yöneticisi',
  WAREHOUSE_STAFF: 'Depo Personeli',
  OWNER: 'Bayi Yetkilisi',
  COUNTER: 'Sayım Görevlisi',
  AUDITOR: 'Bilirkişi',
  GUEST: 'Misafir / Denetçi',
};
export const labels: Record<string, string> = {
  DRAFT: 'Taslak',
  OPEN: 'Sayım sürüyor',
  COMPLETED: 'Onay bekliyor',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
  ACTIVE: 'Aktif',
  INVITED: 'Davet edildi',
  VERIFIED: 'Doğrulandı',
  PENDING_APPROVAL: 'Evrak onayı bekliyor',
  FULL: 'Tam sayım',
  PARTIAL: 'Kısmi sayım',
  CYCLIC: 'Döngüsel sayım',
  RACK: 'Reyon / Raf',
  INTERNAL: 'İç personel',
  AUDITOR: 'Bilirkişi',
  HYBRID: 'Hibrit',
  ZONE: 'Bölüm',
  FLOOR: 'Kat',
  BIN: 'Hücre',
  BUFFER: 'Sanal raf',
  QUARANTINE: 'Karantina',
  NORMAL: 'Normal',
  DAMAGED: 'Hasarlı',
  RETURNED: 'İade',
  DISPLAY: 'Sergi',
  BROKEN: 'Bozuk',
  BREAK: 'Mola talebi',
  DAMAGE: 'Hasar',
  ACCIDENT: 'Kaza',
};
export const date = (v: string) =>
  new Date(v).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
export const num = (v: any) => Number(v || 0).toLocaleString('tr-TR', { maximumFractionDigits: 3 });
export const money = (v: any) =>
  Number(v || 0).toLocaleString('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  });
