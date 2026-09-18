ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS agreement_accepted_at timestamptz;

ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS visibility_state text
NOT NULL DEFAULT 'VISIBLE'
CHECK(visibility_state IN ('VISIBLE','HIDDEN'));

ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS activity_status text
NOT NULL DEFAULT 'IDLE'
CHECK(activity_status IN ('IDLE','ACTIVE','BREAK','FINISHED'));

ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS break_started_at timestamptz;

CREATE TABLE IF NOT EXISTS count_breaks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    room_id uuid NOT NULL
        REFERENCES rooms(id) ON DELETE CASCADE,

    user_id uuid NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    reason text NOT NULL,

    started_at timestamptz NOT NULL DEFAULT now(),

    ended_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),

    CHECK(length(trim(reason)) >= 3)
);

CREATE INDEX IF NOT EXISTS count_breaks_room_user
ON count_breaks(room_id,user_id,started_at DESC);

INSERT INTO schema_versions(version)
VALUES(13);