CREATE TABLE activity_rooms (
  code TEXT PRIMARY KEY,
  host_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started INTEGER NOT NULL DEFAULT 0 CHECK(started IN (0,1))
);
--> statement-breakpoint
CREATE TABLE activity_players (
  room_code TEXT NOT NULL REFERENCES activity_rooms(code) ON DELETE CASCADE,
  token TEXT NOT NULL,
  nickname TEXT NOT NULL COLLATE NOCASE,
  round INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  missed INTEGER NOT NULL DEFAULT 0 CHECK(missed IN (0,1)),
  PRIMARY KEY (room_code, token),
  UNIQUE (room_code, nickname)
);
