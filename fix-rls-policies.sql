-- Corrigir políticas RLS para remover recursão infinita
-- Execute este script no SQL Editor do Supabase

-- Remover políticas problemáticas
DROP POLICY IF EXISTS "Allow read child users" ON users;
DROP POLICY IF EXISTS "Allow insert child users" ON users;
DROP POLICY IF EXISTS "Allow update child users" ON users;
DROP POLICY IF EXISTS "Allow delete child users" ON users;

-- As políticas existentes já permitem acesso público (USING (true))
-- Não precisamos de políticas específicas para usuários filhos
-- O controle de acesso é feito no nível da aplicação (JWT)
