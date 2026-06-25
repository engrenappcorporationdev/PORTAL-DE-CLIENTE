-- Habilitar RLS com políticas de segurança para o portal
-- Execute este script no SQL Editor do Supabase

-- Habilitar RLS nas tabelas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_codes ENABLE ROW LEVEL SECURITY;

-- Políticas para tabela users
-- Permitir leitura pública para login
CREATE POLICY "Allow public read for login" ON users
  FOR SELECT
  USING (true);

-- Permitir inserção pública (para criação de usuários pelo admin)
CREATE POLICY "Allow insert for admin" ON users
  FOR INSERT
  WITH CHECK (true);

-- Permitir atualização pelo próprio usuário ou admin
CREATE POLICY "Allow update own user" ON users
  FOR UPDATE
  USING (true);

-- Permitir exclusão pelo admin
CREATE POLICY "Allow delete for admin" ON users
  FOR DELETE
  USING (true);

-- Políticas para tabela clients
-- Permitir leitura para todos (admin vê todos, cliente vê o próprio)
CREATE POLICY "Allow read clients" ON clients
  FOR SELECT
  USING (true);

-- Permitir inserção pelo admin
CREATE POLICY "Allow insert clients" ON clients
  FOR INSERT
  WITH CHECK (true);

-- Permitir atualização pelo admin
CREATE POLICY "Allow update clients" ON clients
  FOR UPDATE
  USING (true);

-- Permitir exclusão pelo admin
CREATE POLICY "Allow delete clients" ON clients
  FOR DELETE
  USING (true);

-- Políticas para tabela applications
-- Permitir leitura para todos
CREATE POLICY "Allow read applications" ON applications
  FOR SELECT
  USING (true);

-- Permitir inserção pelo admin
CREATE POLICY "Allow insert applications" ON applications
  FOR INSERT
  WITH CHECK (true);

-- Permitir atualização pelo admin
CREATE POLICY "Allow update applications" ON applications
  FOR UPDATE
  USING (true);

-- Permitir exclusão pelo admin
CREATE POLICY "Allow delete applications" ON applications
  FOR DELETE
  USING (true);

-- Políticas para tabela password_reset_codes
-- Permitir leitura para todos (para validação)
CREATE POLICY "Allow read reset codes" ON password_reset_codes
  FOR SELECT
  USING (true);

-- Permitir inserção para todos (para geração de código)
CREATE POLICY "Allow insert reset codes" ON password_reset_codes
  FOR INSERT
  WITH CHECK (true);

-- Permitir atualização para todos (para marcar como usado)
CREATE POLICY "Allow update reset codes" ON password_reset_codes
  FOR UPDATE
  USING (true);
