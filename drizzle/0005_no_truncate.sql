-- The append-only tables also refuse TRUNCATE, which bypasses row-level UPDATE/DELETE triggers.
-- forbid_mutation() (0001_append_only) reports TG_OP = 'TRUNCATE'.
CREATE TRIGGER ledger_entries_no_truncate
  BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
