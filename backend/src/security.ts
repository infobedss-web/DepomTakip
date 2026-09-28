import type { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { pool } from './database.js';
export type User = {
  id: string;
  business_id: string | null;
  name: string;
  email: string;
  role: string;
  status: string;
  permissions: string[];
  denied_permissions?: string[];
};
declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}
export const permissions = [
  'sayim_olustur',
  'sayim_onayla',
  'stok_duzelt',
  'depo_operasyon',
  'rapor_izle',
  'kullanici_yonet',
  'qr_yonet',
  'bayi_yonet',
  'depo_yonet',
  'urun_yonet',
  'sayim_yap',
  'log_izle',
] as const;
export const rolePermissions: Record<string, string[]> = {
  SUPER_ADMIN: [...permissions],
  OWNER: [
    'sayim_olustur',
    'sayim_onayla',
    'stok_duzelt',
    'depo_operasyon',
    'rapor_izle',
    'kullanici_yonet',
    'qr_yonet',
    'depo_yonet',
    'urun_yonet',
    'log_izle',
  ],  FIRM_ADMIN: [
    'sayim_olustur',
    'sayim_onayla',
    'stok_duzelt',
    'depo_operasyon',
    'rapor_izle',
    'kullanici_yonet',
    'qr_yonet',
    'depo_yonet',
    'urun_yonet',
    'log_izle',
  ],
  WAREHOUSE_STAFF: ['depo_operasyon', 'rapor_izle'],
  COUNTER: ['sayim_yap'],
  AUDITOR: ['sayim_yap'],
  GUEST: ['rapor_izle'],
};
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assert(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
export function effective(u: User) {
  return [...new Set([...(rolePermissions[u.role] || []), ...u.permissions])].filter(
    (p) => !(u.denied_permissions || []).includes(p),
  );
}
export function can(u: User, p: string) {
  return effective(u).includes(p);
}
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const sid = req.cookies?.depomtakip_session;
    assert(sid, 401, 'Oturum açmanız gerekiyor.');
    const r = await pool.query(
      'SELECT u.id,u.business_id,u.name,u.email,u.role,u.status,u.permissions,u.denied_permissions FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status=$2',
      [hash(sid), 'ACTIVE'],
    );
    assert(r.rowCount, 401, 'Oturumunuz sona erdi.');
    req.user = r.rows[0];
    next();
  } catch (e) {
    next(e);
  }
}
export const requirePermission =
  (p: string) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      assert(can(req.user, p), 403, 'Bu işlem için yetkiniz bulunmuyor.');
      next();
    } catch (e) {
      next(e);
    }
  };
export function tenant(u: User, businessId: string | null) {
  assert(
    u.role === 'SUPER_ADMIN' || (!!businessId && u.business_id === businessId),
    403,
    'Bu bayiye erişiminiz bulunmuyor.',
  );
}
export function management(u: User) {
  assert(
    !['WAREHOUSE_STAFF', 'COUNTER', 'AUDITOR'].includes(u.role),
    403,
    'Sayım görevlileri stok ve yönetim verilerine erişemez.',
  );
}



