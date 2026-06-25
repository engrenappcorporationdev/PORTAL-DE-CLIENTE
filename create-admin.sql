-- Criar usuário administrador manualmente
-- Execute este script no SQL Editor do Supabase

-- Primeiro, remover se existir
DELETE FROM users WHERE username = 'renan.divino';

-- Inserir usuário admin com senha hash correta
-- Senha: Camila2006#
-- Hash gerado com bcrypt (10 rounds)
INSERT INTO users (username, password, full_name, email, role) 
VALUES (
  'renan.divino', 
  '$2a$10$emOdHrFAeGage6wyMJw9Huu.i3ZpPxJJyL0zyD3Pfr/zG7CjNJCT.', 
  'Renan Divino', 
  'renan.divino@engrenapp.com', 
  'admin'
);
