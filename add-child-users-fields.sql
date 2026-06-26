-- Adicionar campos para usuários filhos na tabela users
-- Execute este script no SQL Editor do Supabase

-- Adicionar campo parent_user_id (referência ao usuário pai)
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Adicionar campo is_child (para identificar usuários filhos)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_child INTEGER DEFAULT 0;

-- Adicionar índices para performance
CREATE INDEX IF NOT EXISTS idx_users_parent ON users(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_users_is_child ON users(is_child);
