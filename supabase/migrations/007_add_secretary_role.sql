-- Add 'secretary' to the profiles role CHECK constraint
-- The original constraint only allowed: admin, minister, member, applicant
-- RLS policies already reference 'secretary', so this was an oversight

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'secretary', 'minister', 'member', 'applicant'));
