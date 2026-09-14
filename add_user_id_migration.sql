-- Migration to add user_id to sessions
-- and link it to the existing profiles table

-- 1. Ensure profiles table exists and has UUID as primary key
-- In case it was created differently, we make sure it has 'id UUID PRIMARY KEY'
-- (Assuming it already has id UUID, we ensure it's primary key)
ALTER TABLE profiles ADD PRIMARY KEY (id);

-- 2. Add user_id to sessions
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS user_id UUID;
