BEGIN;

ALTER TABLE rooms
DROP CONSTRAINT IF EXISTS rooms_count_type_check;

ALTER TABLE rooms
ADD CONSTRAINT rooms_count_type_check
CHECK (
  count_type IN (
    'FULL',
    'PARTIAL',
    'CYCLIC',
    'RACK',
    'BLIND'
  )
);

INSERT INTO schema_versions(version)
VALUES (16)
ON CONFLICT DO NOTHING;

COMMIT;