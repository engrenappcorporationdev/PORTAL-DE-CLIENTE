-- Adicionar sistema de licenças e usuários filhos
-- Execute este script no SQL Editor do Supabase

-- Adicionar campo de licenças na tabela clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS licenses INTEGER DEFAULT 1;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS licenses_used INTEGER DEFAULT 0;

-- Adicionar campo para identificar usuário pai (para usuários filhos)
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_child INTEGER DEFAULT 0;

-- Adicionar índices para performance
CREATE INDEX IF NOT EXISTS idx_users_parent ON users(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_users_is_child ON users(is_child);

-- Atualizar políticas RLS para usuários filhos
-- Permitir leitura de usuários filhos pelo pai
CREATE POLICY "Allow read child users" ON users
  FOR SELECT
  USING (parent_user_id IS NULL OR parent_user_id IN (
    SELECT id FROM users WHERE id = auth.uid()
  ));

-- Permitir inserção de usuários filhos pelo pai
CREATE POLICY "Allow insert child users" ON users
  FOR INSERT
  WITH CHECK (parent_user_id IN (
    SELECT id FROM users WHERE id = auth.uid()
  ));

-- Permitir atualização de usuários filhos pelo pai
CREATE POLICY "Allow update child users" ON users
  FOR UPDATE
  USING (parent_user_id IN (
    SELECT id FROM users WHERE id = auth.uid()
  ));

-- Permitir exclusão de usuários filhos pelo pai
CREATE POLICY "Allow delete child users" ON users
  FOR DELETE
  USING (parent_user_id IN (
    SELECT id FROM users WHERE id = auth.uid()
  ));
