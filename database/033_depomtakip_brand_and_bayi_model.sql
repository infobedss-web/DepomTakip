-- DepomTakip V2: bayi bazlı lisans ve yeni marka varsayılanları.
-- Personel (WAREHOUSE_STAFF / COUNTER) ayrı lisans anahtarı kullanmaz;
-- erişim, bağlı oldukları bayinin aktif lisansı üzerinden doğrulanır.

ALTER TABLE rooms
  ALTER COLUMN code SET DEFAULT ('DT-' || upper(substr(gen_random_uuid()::text,1,8)));

-- Bayi sahibi/yetkilisi ilk aktivasyonda bayi lisansını doğrular.
UPDATE users
SET license_activated_at = NULL
WHERE role = 'OWNER' AND business_id IS NOT NULL;

CREATE OR REPLACE FUNCTION bedss_default_business_license()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO business_licenses(
    business_id, plan_code, status, starts_at, ends_at,
    max_warehouses, max_users, features, note
  )
  VALUES(
    NEW.id, 'TRIAL', 'ACTIVE', now(), now() + interval '14 days',
    1, 10,
    '{"offline":true,"blind_count":true,"mobile_pwa":true}'::jsonb,
    'Otomatik 14 günlük DepomTakip deneme lisansı'
  )
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$;

INSERT INTO schema_versions(version) VALUES(33) ON CONFLICT (version) DO NOTHING;
