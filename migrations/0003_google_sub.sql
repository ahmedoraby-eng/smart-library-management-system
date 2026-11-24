-- SLM-8 follow-up (Yousef): bind a staff user to Google's stable subject id, not the email alone.
ALTER TABLE staff_users ADD COLUMN google_sub text;
CREATE UNIQUE INDEX staff_users_google_sub_key ON staff_users (google_sub) WHERE google_sub IS NOT NULL;
