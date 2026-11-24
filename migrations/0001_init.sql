-- Smart Library: core schema. Inventory invariants live here as the last line of defence
-- (architecture §3.4); the application checks first so users get clear errors.

CREATE TABLE staff_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  full_name   text NOT NULL,
  role        text NOT NULL CHECK (role IN ('ADMIN', 'LIBRARIAN', 'SUPERVISOR')),
  status      text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  is_demo     boolean NOT NULL DEFAULT false,  -- the two shared reviewer accounts; locked in the Admin screen
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX staff_users_email_uq ON staff_users (lower(email));

CREATE TABLE books (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL CHECK (length(btrim(title)) > 0),
  author            text NOT NULL CHECK (length(btrim(author)) > 0),
  isbn              text,
  description       text NOT NULL DEFAULT '',
  category          text NOT NULL,
  publisher         text NOT NULL DEFAULT '',
  publication_year  integer,
  cover_image_url   text,
  total_copies      integer NOT NULL,
  available_copies  integer NOT NULL,
  version           integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz,
  CONSTRAINT books_copies_ck CHECK (total_copies >= 0 AND available_copies BETWEEN 0 AND total_copies)
);
CREATE UNIQUE INDEX books_isbn_uq ON books (isbn) WHERE isbn IS NOT NULL AND archived_at IS NULL;
CREATE INDEX books_category_ix ON books (category) WHERE archived_at IS NULL;
CREATE INDEX books_created_ix ON books (created_at DESC);

CREATE SEQUENCE member_number_seq START 1;
CREATE TABLE members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_number  text NOT NULL DEFAULT ('M-' || lpad(nextval('member_number_seq')::text, 6, '0')),
  full_name      text NOT NULL CHECK (length(btrim(full_name)) > 0),
  email          text NOT NULL,
  phone          text,
  status         text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  registered_at  timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX members_number_uq ON members (member_number);
CREATE UNIQUE INDEX members_email_uq ON members (lower(email));

CREATE TABLE loans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id       uuid NOT NULL REFERENCES books (id) ON DELETE RESTRICT,
  member_id     uuid NOT NULL REFERENCES members (id) ON DELETE RESTRICT,
  processed_by  uuid NOT NULL REFERENCES staff_users (id),
  returned_by   uuid REFERENCES staff_users (id),
  borrowed_at   timestamptz NOT NULL DEFAULT now(),
  due_at        timestamptz NOT NULL,
  returned_at   timestamptz,
  CONSTRAINT loans_due_ck CHECK (due_at > borrowed_at),
  CONSTRAINT loans_returned_ck CHECK (returned_at IS NULL OR returned_at >= borrowed_at),
  CONSTRAINT loans_returned_by_ck CHECK ((returned_at IS NULL) = (returned_by IS NULL))
);
-- One open loan per member and title (409 ALREADY_BORROWED on a race).
CREATE UNIQUE INDEX loans_open_member_book_uq ON loans (member_id, book_id) WHERE returned_at IS NULL;
CREATE INDEX loans_open_due_ix ON loans (returned_at, due_at);
CREATE INDEX loans_member_ix ON loans (member_id, borrowed_at DESC);
CREATE INDEX loans_book_ix ON loans (book_id, borrowed_at DESC);
