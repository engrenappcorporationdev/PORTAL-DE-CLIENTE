-- Schema SQL simples para sistema de licencas e usuarios filhos
-- Execute este script no SQL Editor do Supabase

-- Adicionar colunas na tabela clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS licenses INTEGER DEFAULT 1;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS licenses_used INTEGER DEFAULT 0;

-- Adicionar colunas na tabela users
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_child INTEGER DEFAULT 0;

-- Adicionar indices para performance
CREATE INDEX IF NOT EXISTS idx_users_parent ON users(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_users_is_child ON users(is_child);

-- Verificar se as colunas foram adicionadas
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name IN ('clients', 'users')
  AND column_name IN ('licenses', 'licenses_used', 'parent_user_id', 'is_child')
ORDER BY table_name, column_name;
