CREATE TABLE rooms (
  code TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  created INTEGER NOT NULL,
  round INTEGER NOT NULL DEFAULT -1,
  deadline INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE players (
  room TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  token TEXT NOT NULL,
  nickname TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (room, token),
  UNIQUE (room, nickname)
);
--> statement-breakpoint
CREATE TABLE scores (
  room TEXT NOT NULL,
  token TEXT NOT NULL,
  round INTEGER NOT NULL,
  points INTEGER NOT NULL,
  PRIMARY KEY (room, token, round),
  FOREIGN KEY (room, token) REFERENCES players(room, token) ON DELETE CASCADE
);
