BEGIN;

ALTER TABLE rooms
ADD COLUMN parent_room_id uuid NULL REFERENCES rooms(id);

ALTER TABLE rooms
ADD COLUMN blind_round integer NOT NULL DEFAULT 1;

ALTER TABLE rooms
ADD CONSTRAINT rooms_blind_round_check
CHECK (blind_round IN (1,2));

CREATE UNIQUE INDEX rooms_second_blind_unique
ON rooms(parent_room_id)
WHERE parent_room_id IS NOT NULL
  AND blind_round = 2;

CREATE INDEX rooms_parent_room_idx
ON rooms(parent_room_id);

INSERT INTO schema_versions(version)
VALUES (17)
ON CONFLICT DO NOTHING;

COMMIT;