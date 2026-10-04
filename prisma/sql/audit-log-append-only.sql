-- Makes "AuditLog" append-only at the database level.
--
-- Blocks UPDATE, DELETE and TRUNCATE on audit rows, so a bug, a bad script or
-- someone using the app's own database login can't rewrite or wipe the record
-- of who viewed patient data. New rows can still be added as normal.
--
-- One exception: when a User is deleted, the foreign key (onDelete: SetNull)
-- blanks "userId" on that user's audit rows. That single change is allowed so
-- deleting a client still works; every other column must stay the same.
--
-- Prisma doesn't manage triggers, and `prisma db push` leaves them in place.
-- Apply with: npx tsx scripts/protect-audit-log.ts   (idempotent)
-- The database owner can still drop the trigger on purpose; this guards
-- against accidents and app-level tampering, not a rogue DB owner.

CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."userId" IS NOT NULL AND NEW."userId" IS NULL
       AND NEW.id = OLD.id
       AND NEW.action = OLD.action
       AND NEW.resource IS NOT DISTINCT FROM OLD.resource
       AND NEW."ipAddress" IS NOT DISTINCT FROM OLD."ipAddress"
       AND NEW."userAgent" IS NOT DISTINCT FROM OLD."userAgent"
       AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
       AND NEW."createdAt" = OLD."createdAt" THEN
      RETURN NEW; -- user deleted: FK sets userId to NULL
    END IF;
  END IF;
  RAISE EXCEPTION 'AuditLog is append-only: % is not allowed', TG_OP;
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit_log_no_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: TRUNCATE is not allowed';
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_append_only ON "AuditLog";
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

DROP TRIGGER IF EXISTS audit_log_no_truncate ON "AuditLog";
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_no_truncate();
