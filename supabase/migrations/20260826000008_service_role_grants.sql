-- ---------------------------------------------------------------------------
-- Devasriya Print - restore the backend role's table privileges
--
-- `service_role` held only REFERENCES, TRIGGER and TRUNCATE on the public
-- tables: no SELECT, INSERT, UPDATE or DELETE anywhere. Every use of the
-- service role therefore failed with 42501.
--
-- That is not only a testing problem. The provision-account Edge Function
-- writes `principals` with the service role - that is the step which fixes a
-- uid as staff or customer - so creating any employee or portal login on the
-- live project would have failed too.
--
-- This restores the platform default (`grant all on tables to service_role`)
-- rather than inventing a narrower one. It weakens nothing: service_role is the
-- server-side administrative role, it already bypasses row level security by
-- design, and its key exists only inside Edge Functions and local admin
-- scripts. The security surface this system actually defends is `anon` and
-- `authenticated`, and neither is touched here.
-- ---------------------------------------------------------------------------

grant usage on schema public to service_role;
grant usage on schema app to service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema app to service_role;

-- Tables added by a later migration inherit the same, so this cannot silently
-- come apart again the next time the schema grows.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- Belt and braces: `anon` is the role a browser holds before signing in, and it
-- has no business reading or writing anything at all.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
