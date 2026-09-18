import { Router } from 'express';
import { pool } from './database.js';

export const mobileDevices = Router();

const ADMIN_ROLES = ['SUPER_ADMIN', 'OWNER', 'FIRM_ADMIN'];

function isAdmin(role: unknown) {
  return ADMIN_ROLES.includes(String(role || '').toUpperCase());
}

mobileDevices.get('/mobile-devices', async (req, res) => {
  if (!isAdmin(req.user.role)) {
    res.status(403).json({
      error: 'Mobil cihazları görüntüleme yetkiniz yok.',
    });
    return;
  }

  const businessId = req.user.business_id || null;

  if (!businessId && req.user.role !== 'SUPER_ADMIN') {
    res.status(400).json({
      error: 'Firma bilgisi bulunamadı.',
    });
    return;
  }

  const params: unknown[] = [];

  let where = '';

  if (businessId) {
    params.push(businessId);
    where = 'WHERE md.business_id = $1';
  }

  const result = await pool.query(
    `
      SELECT
        md.id,
        md.business_id,
        md.user_id,
        md.device_id,
        md.device_name,
        md.platform,
        md.status,
        md.paired_at,
        md.last_seen_at,
        md.revoked_at,
        u.name AS user_name,
        u.email AS user_email,
        u.role AS user_role
      FROM mobile_devices md
      LEFT JOIN users u
        ON u.id = md.user_id
      ${where}
      ORDER BY md.paired_at DESC
    `,
    params,
  );

  res.json({
    devices: result.rows,
    total: result.rowCount || 0,
  });
});

mobileDevices.patch('/mobile-devices/:id/status', async (req, res) => {
  if (!isAdmin(req.user.role)) {
    res.status(403).json({
      error: 'Mobil cihaz yönetim yetkiniz yok.',
    });
    return;
  }

  const status = String(req.body?.status || '').toUpperCase();

  if (!['ACTIVE', 'DISABLED', 'REVOKED'].includes(status)) {
    res.status(400).json({
      error: 'Geçersiz cihaz durumu.',
    });
    return;
  }

  const businessId = req.user.business_id || null;
  const params: unknown[] = [status, req.params.id];

  let businessFilter = '';

  if (businessId) {
    params.push(businessId);
    businessFilter = 'AND business_id = $3';
  }

  const result = await pool.query(
    `
      UPDATE mobile_devices
      SET
        status = $1,
        revoked_at =
          CASE
            WHEN $1 = 'REVOKED' THEN now()
            WHEN $1 = 'ACTIVE' THEN NULL
            ELSE revoked_at
          END
      WHERE id = $2
      ${businessFilter}
      RETURNING *
    `,
    params,
  );

  if (!result.rowCount) {
    res.status(404).json({
      error: 'Mobil cihaz bulunamadı.',
    });
    return;
  }

  res.json({
    device: result.rows[0],
  });
});