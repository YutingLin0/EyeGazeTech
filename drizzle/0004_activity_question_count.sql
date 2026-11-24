ALTER TABLE activity_rooms ADD COLUMN question_count INTEGER NOT NULL DEFAULT 10 CHECK(question_count > 0);
