-- Desabilitar Row Level Security (RLS) nas tabelas do portal
-- Execute este script no SQL Editor do Supabase

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE applications DISABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_codes DISABLE ROW LEVEL SECURITY;
