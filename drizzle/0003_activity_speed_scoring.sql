ALTER TABLE activity_players ADD COLUMN prompt_started_at INTEGER;
--> statement-breakpoint
ALTER TABLE activity_players ADD COLUMN last_speed_bonus INTEGER NOT NULL DEFAULT 0;
