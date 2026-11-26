-- SLM-18 loan renewal. A loan can be renewed once: renewed_at records when, renewed_by who.
-- Additive and backward compatible: two nullable columns with no default (no table rewrite); existing rows
-- read as "never renewed". The CHECK holds for every existing row, since both columns start NULL.
ALTER TABLE loans
  ADD COLUMN renewed_at timestamptz,
  ADD COLUMN renewed_by uuid REFERENCES staff_users (id),
  ADD CONSTRAINT loans_renewed_ck
    CHECK ((renewed_at IS NULL) = (renewed_by IS NULL) AND (renewed_at IS NULL OR renewed_at >= borrowed_at));
