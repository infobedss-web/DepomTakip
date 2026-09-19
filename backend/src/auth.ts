import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { pool, transaction } from './database.js';
import {
  assert,
  hash,
  token,
  authenticate,
  requirePermission,
  tenant,
  effective,
  permissions,
  type User,
} from './security.js';
import { audit } from './helpers.js';
export const auth = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
auth.use(
  '/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    message: { error: 'Çok fazla deneme. Lütfen daha sonra tekrar deneyin.' },
  }),
);
auth.post('/auth/login', async (req, res) => {
  const b = z
    .object({
      email: z.email(),
      password: z.string().min(1).max(128),
      license_key: z.string().trim().max(100).optional(),
    })
    .parse(req.body);
  const r = await pool.query('SELECT * FROM users WHERE email=$1', [b.email.toLowerCase()]);
  const u = r.rows[0];
  const valid = await bcrypt.compare(
    b.password,
    u?.password_hash || '$2b$12$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  );
  assert(
    u && valid && u.status === 'ACTIVE',
    401,
    'E-posta veya şifre hatalı ya da hesabınız henüz onaylanmadı.',
  );

  /* BEDSS_ONE_TIME_LICENSE_ACTIVATION */
  if (
    u.role === 'FIRM_ADMIN' &&
    u.business_id &&
    !u.license_activated_at
  ) {
    const licenseResult = await pool.query(
      `
        SELECT
          license_key,
          status,
          starts_at,
          ends_at
        FROM business_licenses
        WHERE business_id=$1
      `,
      [u.business_id],
    );

    const firmLicense = licenseResult.rows[0];

    assert(
      firmLicense,
      403,
      'Firma lisansı bulunamadı.',
    );

    assert(
      firmLicense.status === 'ACTIVE' &&
        new Date(firmLicense.starts_at) <= new Date() &&
        new Date(firmLicense.ends_at) > new Date(),
      403,
      'Firma lisansı aktif değil veya süresi dolmuş.',
    );

    assert(
      !!b.license_key,
      403,
      'İlk giriş için lisans anahtarını giriniz.',
    );

    assert(
      String(firmLicense.license_key || '')
        .trim()
        .toUpperCase() ===
        String(b.license_key)
          .trim()
          .toUpperCase(),
      403,
      'Lisans anahtarı hatalı.',
    );

    await pool.query(
      'UPDATE users SET license_activated_at=now() WHERE id=$1',
      [u.id],
    );
  }
  /* BEDSS_ONE_TIME_LICENSE_ACTIVATION_END */

  const sid = token();
  await transaction(async (db) => {
    await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '12 hours')", [
      hash(sid),
      u.id,
    ]);
    await audit(db, u, 'LOGIN', 'user', u.id);
  });
  res.cookie('bedss_session', sid, {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 43200000,
    path: '/',
  });
  res.json({
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      business_id: u.business_id,
      permissions: effective(u),
    },
  });
});
auth.post('/auth/pin-login', async (req, res) => {
  const b = z
    .object({
      business_code: z.string().trim().min(1).max(50),
      login_code: z.string().regex(/^\d{6}$/, 'Kullanici/Personel numarasi 6 haneli olmalidir.'),
      pin: z.string().regex(/^\d{6}$/, 'PIN 6 haneli olmalidir.'),
      license_key: z.string().trim().max(100).optional(),
    })
    .parse(req.body);

  const result = await pool.query(
    `
      SELECT
        u.*,
        b.code AS business_code,
        b.status AS business_status
      FROM users u
      JOIN businesses b ON b.id = u.business_id
      WHERE upper(b.code) = upper($1)
        AND u.login_code = $2
        AND u.role IN ('FIRM_ADMIN', 'WAREHOUSE_STAFF')
      LIMIT 1
    `,
    [b.business_code, b.login_code],
  );

  const u = result.rows[0];

  const valid = await bcrypt.compare(
    b.pin,
    u?.password_hash ||
      '$2b$12$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  );

  assert(
    u && valid && u.status === 'ACTIVE',
    401,
    'Firma kodu, kullanici numarasi veya PIN hatali.',
  );

  assert(
    u.business_status === 'ACTIVE',
    403,
    'Firma hesabi aktif degil.',
  );

  const licenseResult = await pool.query(
    `
      SELECT license_key, status, starts_at, ends_at
      FROM business_licenses
      WHERE business_id=$1
      LIMIT 1
    `,
    [u.business_id],
  );

  const firmLicense = licenseResult.rows[0];

  assert(
    firmLicense &&
      firmLicense.status === 'ACTIVE' &&
      new Date(firmLicense.starts_at) <= new Date() &&
      new Date(firmLicense.ends_at) > new Date(),
    403,
    'Firma lisansi aktif degil veya suresi dolmus.',
  );

  if (u.role === 'FIRM_ADMIN' && !u.license_activated_at) {
    assert(
      !!b.license_key,
      403,
      'Ilk giris icin lisans anahtarini giriniz.',
    );

    assert(
      String(firmLicense.license_key || '').trim().toUpperCase() ===
        String(b.license_key || '').trim().toUpperCase(),
      403,
      'Lisans anahtari hatali.',
    );

    await pool.query(
      'UPDATE users SET license_activated_at=now() WHERE id=$1',
      [u.id],
    );
  }

  const sid = token();

  await transaction(async (db) => {
    await db.query(
      "INSERT INTO sessions VALUES($1,$2,now()+interval '12 hours')",
      [hash(sid), u.id],
    );

    await audit(db, u, 'LOGIN', 'user', u.id);
  });

  res.cookie('bedss_session', sid, {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 43200000,
    path: '/',
  });

  res.json({
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      business_id: u.business_id,
      permissions: effective(u),
    },
  });
});
auth.get('/auth/me', authenticate, (req, res) =>
  res.json({ user: { ...req.user, permissions: effective(req.user) } }),
);
auth.post('/auth/logout', async (req, res) => {
  if (req.cookies.bedss_session)
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [hash(req.cookies.bedss_session)]);
  res.clearCookie('bedss_session', { path: '/', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict', secure: process.env.NODE_ENV === 'production' });
  res.json({ ok: true });
});
auth.post('/invitations', authenticate, requirePermission('kullanici_yonet'), async (req, res) => {
  const b = z
    .object({
      name: z.string().min(2).max(120),
      email: z.email(),
      role: z.enum(['OWNER', 'FIRM_ADMIN', 'WAREHOUSE_STAFF', 'COUNTER', 'AUDITOR', 'GUEST']),
      business_id: z.uuid().nullable(),
      permissions: z.array(z.enum(permissions)).default([]),
    })
    .parse(req.body);
  if (req.user.role !== 'SUPER_ADMIN') {
    assert(
      b.role === 'FIRM_ADMIN' ||
        b.role === 'WAREHOUSE_STAFF' ||
        b.role === 'COUNTER' ||
        b.role === 'GUEST',
      403,
      'Bu rolü yalnızca sistem yetkilisi davet edebilir.',
    );
    tenant(req.user, b.business_id);
    assert(b.permissions.length === 0, 403, 'Ek izinleri sistem yetkilisi yönetir.');
  }
  assert(b.role === 'AUDITOR' || !!b.business_id, 400, 'İşletme seçiniz.');
  assert(
    !['WAREHOUSE_STAFF', 'COUNTER', 'AUDITOR', 'GUEST'].includes(b.role) || b.permissions.length === 0,
    400,
    'Saha ve misafir rollerine yönetim izni verilemez.',
  );
  // PERSONEL LISANS LIMITI
  if (
    b.business_id &&
    req.user.role !== 'SUPER_ADMIN'
  ) {
    const license = (
      await pool.query(
        `
        SELECT
          max_users,
          (
            SELECT count(*)
            FROM users
            WHERE business_id=$1
              AND status <> 'REJECTED'
          )::integer AS user_count
        FROM business_licenses
        WHERE business_id=$1
        `,
        [b.business_id],
      )
    ).rows[0];

    assert(
      license,
      403,
      'Firma lisansi bulunamadi.',
    );

    assert(
      Number(license.user_count) < Number(license.max_users),
      409,
      'Lisans personel limiti doldu.',
    );
  }
  const secret = token(),
    otp = String(randomInt(100000, 1000000));
  const u = await transaction(async (db) => {
    const u = (
      await db.query(
        'INSERT INTO users(name,email,role,business_id,permissions,license_activated_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
        [
          b.name,
          b.email.toLowerCase(),
          b.role,
          b.business_id,
          b.permissions,
          b.role === 'FIRM_ADMIN' ? null : new Date(),
        ],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO invitations(user_id,token_hash,otp_hash,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')",
      [u.id, hash(secret), hash(otp)],
    );
    await audit(db, req.user, 'INVITED', 'user', u.id, b.business_id);
    return u;
  });
  // Local development delivery only. No email is sent without a configured provider.
  res.status(201).json({
    id: u.id,
    delivery: 'LOCAL_DEMO',
    invite_url: `/?invite=${secret}`,
    otp,
    message: 'Demo daveti oluşturuldu. Gerçek e-posta gönderimi yapılandırılmadı.',
  });
});
auth.post('/auth/verify', async (req, res) => {
  const b = z
    .object({ token: z.string().length(64), otp: z.string().regex(/^\d{6}$/) })
    .parse(req.body);
  const result = await transaction(async (db) => {
    const r = await db.query('SELECT * FROM invitations WHERE token_hash=$1 FOR UPDATE', [
      hash(b.token),
    ]);
    const i = r.rows[0];
    assert(
      i &&
        !i.consumed_at &&
        !i.verified_at &&
        new Date(i.expires_at) > new Date() &&
        i.attempts < 5,
      400,
      'Davet geçersiz, doğrulanmış veya süresi dolmuş.',
    );
    await db.query('UPDATE invitations SET attempts=attempts+1 WHERE id=$1', [i.id]);
    if (i.otp_hash !== hash(b.otp)) return false;
    await db.query('UPDATE invitations SET verified_at=now() WHERE id=$1', [i.id]);
    await db.query("UPDATE users SET status='VERIFIED' WHERE id=$1", [i.user_id]);
    return true;
  });
  assert(result, 400, 'Doğrulama kodu hatalı.');
  res.json({ ok: true });
});
auth.post('/auth/complete', upload.none(), async (req, res) => {
  const b = z
    .object({
      token: z.string().length(64),
      login_code: z.string().optional(),
      pin: z.string().optional(),
      password: z.string().optional(),
    })
    .parse(req.body);

  await transaction(async (db) => {
    const r = await db.query(
      `
        SELECT
          i.*,
          u.role
        FROM invitations i
        JOIN users u ON u.id = i.user_id
        WHERE i.token_hash=$1
        FOR UPDATE OF i
      `,
      [hash(b.token)],
    );

    const i = r.rows[0];

    assert(
      i && i.verified_at && !i.consumed_at && new Date(i.expires_at) > new Date(),
      400,
      'Davet gecersiz veya suresi dolmus.',
    );

    const pinRole =
      i.role === 'FIRM_ADMIN' ||
      i.role === 'WAREHOUSE_STAFF';

    if (pinRole) {
      assert(
        !!b.login_code && /^\d{6}$/.test(b.login_code),
        400,
        'Kullanici/Personel numarasi tam 6 haneli olmalidir.',
      );

      assert(
        !!b.pin && /^\d{6}$/.test(b.pin),
        400,
        'PIN tam 6 haneli olmalidir.',
      );

      const pw = await bcrypt.hash(b.pin, 12);

      try {
        await db.query(
          `
            UPDATE users
            SET
              login_code=$1,
              password_hash=$2,
              status='ACTIVE'
            WHERE id=$3
          `,
          [b.login_code, pw, i.user_id],
        );
      } catch (e: any) {
        if (e?.code === '23505') {
          assert(false, 409, 'Bu 6 haneli kullanici/personel numarasi bu firmada zaten kullaniliyor.');
        }
        throw e;
      }
    } else {
      assert(
        !!b.password &&
          b.password.length >= 12 &&
          b.password.length <= 72 &&
          /[A-Z]/.test(b.password) &&
          /[a-z]/.test(b.password) &&
          /[0-9]/.test(b.password),
        400,
        'Sifre en az 12 karakter olmali; buyuk harf, kucuk harf ve rakam icermelidir.',
      );

      const pw = await bcrypt.hash(b.password, 12);

      await db.query(
        `
          UPDATE users
          SET
            password_hash=$1,
            status='ACTIVE'
          WHERE id=$2
        `,
        [pw, i.user_id],
      );
    }

    await db.query(
      'UPDATE invitations SET consumed_at=now() WHERE id=$1',
      [i.id],
    );
  });

  res.json({
    ok: true,
    message: 'Kullanici hesabi aktif edildi.',
  });
});
function validFile(f: Express.Multer.File) {
  return (
    (f.mimetype === 'application/pdf' &&
      f.buffer.subarray(0, 5).toString() === '%PDF-') ||
    (f.mimetype === 'image/png' &&
      f.buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') ||
    (f.mimetype === 'image/jpeg' &&
      f.buffer.subarray(0, 3).toString('hex') === 'ffd8ff')
  );
}
auth.get('/users', authenticate, requirePermission('kullanici_yonet'), async (req, res) => {
  const r = await pool.query(
    "SELECT u.id,u.name,u.email,u.role,u.status,u.business_id,u.permissions,u.denied_permissions,b.name business_name,(SELECT json_agg(json_build_object('id',d.id,'name',d.original_name)) FROM documents d WHERE d.user_id=u.id) documents FROM users u LEFT JOIN businesses b ON b.id=u.business_id WHERE u.status <> 'PASSIVE' AND ($1::boolean OR u.business_id=$2) ORDER BY u.created_at DESC",
    [req.user.role === 'SUPER_ADMIN', req.user.business_id],
  );
  res.json(r.rows.map((u) => ({ ...u, effective_permissions: effective(u) })));
});
auth.delete('/users/:id', authenticate, requirePermission('kullanici_yonet'), async (req, res) => {
  const targetId = String(req.params.id);

  assert(targetId !== req.user.id, 400, 'Kendi hesabınızı silemezsiniz.');

  await transaction(async (db) => {
    const r = await db.query(
      'SELECT id,name,role,business_id,status FROM users WHERE id=$1 FOR UPDATE',
      [targetId],
    );

    const target = r.rows[0];

    assert(target, 404, 'Personel bulunamadı.');
    assert(target.role !== 'SUPER_ADMIN', 403, 'Sistem yöneticisi silinemez.');

    if (req.user.role !== 'SUPER_ADMIN') {
      assert(
        target.business_id === req.user.business_id,
        403,
        'Başka firmaya ait personeli silemezsiniz.',
      );
    }

    await db.query(
      'DELETE FROM user_warehouse_assignments WHERE user_id=$1',
      [targetId],
    );

    await db.query(
      'DELETE FROM sessions WHERE user_id=$1',
      [targetId],
    );

    await db.query(
      "UPDATE users SET status='PASSIVE' WHERE id=$1",
      [targetId],
    );

    await audit(
      db,
      req.user,
      'PERSONNEL_DELETED',
      'user',
      targetId,
      target.business_id,
      { name: target.name, role: target.role },
    );
  });

  res.json({ ok: true, message: 'Personel silindi.' });
});
auth.post('/users/:id/review', authenticate, async (req, res) => {
  assert(req.user.role === 'SUPER_ADMIN', 403, 'Yalnızca sistem yetkilisi evrak onaylayabilir.');
  const b = z.object({ approve: z.boolean() }).parse(req.body);
  await transaction(async (db) => {
    const r = await db.query(
      "UPDATE users SET status=$1 WHERE id=$2 AND status='PENDING_APPROVAL' RETURNING *",
      [b.approve ? 'ACTIVE' : 'REJECTED', req.params.id],
    );
    assert(r.rowCount, 409, 'Kullanıcı onay beklemiyor.');
    await audit(
      db,
      req.user,
      b.approve ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
      'user',
      String(req.params.id),
      r.rows[0].business_id,
    );
  });
  res.json({ ok: true });
});
auth.put('/users/:id/permissions', authenticate, async (req, res) => {
  assert(req.user.role === 'SUPER_ADMIN', 403, 'Yalnızca sistem yetkilisi ek izin atayabilir.');
  const b = z
    .object({
      permissions: z.array(z.enum(permissions)),
      denied_permissions: z.array(z.enum(permissions)).default([]),
    })
    .parse(req.body);
  await transaction(async (db) => {
    const r = await db.query(
      "UPDATE users SET permissions=$1,denied_permissions=$3 WHERE id=$2 AND role='OWNER' RETURNING *",
      [b.permissions, req.params.id, b.denied_permissions],
    );
    assert(r.rowCount, 400, 'Ek izinler yalnızca bayi yetkilisine atanabilir.');
    assert(
      !b.permissions.some((p) => ['bayi_yonet', 'sayim_yap'].includes(p)),
      400,
      'Bu izin bayi yetkilisine atanamaz.',
    );
    await audit(
      db,
      req.user,
      'PERMISSIONS_UPDATED',
      'user',
      String(req.params.id),
      r.rows[0].business_id,
      { permissions: b.permissions, denied_permissions: b.denied_permissions },
    );
  });
  res.json({ ok: true });
});
auth.post(
  '/photos',
  authenticate,
  requirePermission('sayim_yap'),
  upload.single('photo'),
  async (req, res) => {
    assert(
      req.file && validFile(req.file) && req.file.mimetype.startsWith('image/'),
      400,
      'JPEG veya PNG fotoğraf yükleyin.',
    );
    const f = req.file,
      filename = token();
    const r = await pool.query(
      'INSERT INTO documents(user_id,filename,original_name,mime_type,content) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [req.user.id, filename, f.originalname, f.mimetype, f.buffer],
    );
    res.status(201).json(r.rows[0]);
  },
);
auth.get('/documents/:id', authenticate, async (req, res) => {
  const r = await pool.query(
    'SELECT d.*,u.business_id FROM documents d JOIN users u ON u.id=d.user_id WHERE d.id=$1',
    [req.params.id],
  );
  assert(r.rowCount, 404, 'Dosya bulunamadı.');
  const d = r.rows[0];
  const linked = effective(req.user).includes('rapor_izle')
    ? await pool.query(
        'SELECT 1 FROM count_entries c JOIN rooms r ON r.id=c.room_id WHERE c.photo_id=$1 AND r.business_id=$2',
        [d.id, req.user.business_id],
      )
    : null;
  assert(
    req.user.role === 'SUPER_ADMIN' || d.user_id === req.user.id || !!linked?.rowCount,
    403,
    'Bu dosyaya erişiminiz yok.',
  );
  assert(d.content, 404, 'Dosya içeriği bulunamadı.');
  res.type(d.mime_type).setHeader('Content-Disposition', 'attachment; filename="bedss-document"');
  res.send(d.content);
});





