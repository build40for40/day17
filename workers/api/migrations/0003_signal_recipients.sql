CREATE TABLE signal_recipients (
  signal_id TEXT NOT NULL REFERENCES signals (id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  code INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'not_read' CHECK (state IN ('not_read', 'pending', 'accepted', 'rejected')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (signal_id, person_id)
);

CREATE INDEX signal_recipients_person ON signal_recipients (person_id);

ALTER TABLE signals ADD COLUMN signed_off_person_id TEXT REFERENCES people (id) ON DELETE SET NULL;
