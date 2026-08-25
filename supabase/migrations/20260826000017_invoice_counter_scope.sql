-- ---------------------------------------------------------------------------
-- Devasriya Print - Module 10, step 1: the invoice counter scope
--
-- ALTER TYPE ... ADD VALUE cannot be used by the same transaction that adds it,
-- so the enum value gets a migration of its own. The billing schema that uses
-- it follows in 00018, in a later transaction.
-- ---------------------------------------------------------------------------

alter type app.counter_scope add value if not exists 'invoices';
