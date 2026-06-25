-- Schema SQL para Supabase - Portal de Clientes ENGRENAPP
-- Execute este script no SQL Editor do Supabase

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela de usuários (adaptada para o portal)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'client', -- 'admin' ou 'client'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabela de clientes (adaptada para o portal)
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_name TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabela de aplicativos (adaptada para o portal)
CREATE TABLE IF NOT EXISTS applications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  android_file TEXT,
  android_version TEXT,
  pc_file TEXT,
  pc_version TEXT,
  website_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabela de códigos de recuperação de senha
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_client_id ON applications(client_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_code ON password_reset_codes(code);

-- Inserir usuário administrador padrão
-- Senha: Camila2006# (hash será gerado pelo bcrypt)
-- Primeiro remove se existir
DELETE FROM users WHERE username = 'renan.divino';

INSERT INTO users (username, password, full_name, email, role) VALUES
('renan.divino', '$2a$10$placeholder_hash_will_be_replaced', 'Renan Divino', 'renan.divino@engrenapp.com', 'admin');
