-- BEDSS 021
-- 001-020 migrationlarina dokunmaz.
-- Eski seed/test/API INSERT'lerinin code gondermemesi durumunda
-- firma ve depo kodlarini PostgreSQL otomatik olusturur.

CREATE OR REPLACE FUNCTION bedss_business_code_default()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
    SELECT 'FIR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

CREATE OR REPLACE FUNCTION bedss_warehouse_code_default()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
    SELECT 'DEP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

ALTER TABLE businesses
    ALTER COLUMN code
    SET DEFAULT bedss_business_code_default();

ALTER TABLE warehouses
    ALTER COLUMN code
    SET DEFAULT bedss_warehouse_code_default();

-- Mevcut NULL/boş değer varsa güvenli şekilde tamamla.
UPDATE businesses
SET code = bedss_business_code_default()
WHERE code IS NULL OR btrim(code) = '';

UPDATE warehouses
SET code = bedss_warehouse_code_default()
WHERE code IS NULL OR btrim(code) = '';

ALTER TABLE businesses
    ALTER COLUMN code SET NOT NULL;

ALTER TABLE warehouses
    ALTER COLUMN code SET NOT NULL;
