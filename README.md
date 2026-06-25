# Portal de Clientes - ENGRENAPP

Sistema de portal de clientes para a ENGRENAPP com autenticação, painel administrativo e área para download de aplicativos.

## 🚀 Funcionalidades

### Para Administradores
- Login com credenciais de administrador
- Gerenciamento de clientes (adicionar, visualizar, excluir)
- Gerenciamento de aplicativos (adicionar, visualizar, excluir)
- Upload de arquivos APK (Android) e EXE (PC)
- Configuração de links para sites dos clientes
- Visualização de todos os usuários do sistema
- Atualizações em tempo real com WebSockets

### Para Clientes
- Login com credenciais de cliente
- Recuperação de senha com código
- Visualização dos aplicativos disponíveis
- Download de aplicativos Android (APK)
- Download de aplicativos PC (EXE)
- Acesso aos links dos sites
- Atualizações automáticas em tempo real
- Interface responsiva para mobile e desktop

## 🔐 Credenciais Padrão

**Administrador:**
- Usuário: `renan.divino`
- Senha: `Camila2006#`

## 📋 Pré-requisitos

- Node.js (v14 ou superior)
- npm ou yarn

## 🛠️ Instalação Local

1. Navegue até a pasta do projeto:
```bash
cd engrenapp-portal
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o servidor:
```bash
npm start
```

O servidor estará disponível em: `http://localhost:3001`

## 🌐 Deploy em Produção

Para colocar o portal no ar gratuitamente, siga as instruções em [DEPLOY.md](DEPLOY.md)

**Opções de hospedagem gratuita:**
- **Render.com** - Recomendado, plano gratuito para Node.js
- **Railway.app** - $5 de crédito gratuito por mês
- **Glitch.com** - Totalmente gratuito, mas com limitações

## 📁 Estrutura do Projeto

```
engrenapp-portal/
├── server.js              # Servidor backend Express
├── package.json           # Dependências do projeto
├── .env                   # Variáveis de ambiente
├── .gitignore             # Arquivos ignorados pelo Git
├── DEPLOY.md              # Instruções de deploy
├── database.sqlite        # Banco de dados SQLite (criado automaticamente)
├── uploads/               # Arquivos enviados (criado automaticamente)
└── public/
    ├── index.html         # Página principal
    ├── styles.css         # Estilos CSS
    └── app.js             # JavaScript frontend
```

## 🎯 Uso

### Acesso Administrativo

1. Acesse a URL do portal
2. Faça login com as credenciais de administrador
3. Você será redirecionado para o painel administrativo
4. Use as abas para gerenciar clientes e aplicativos

### Acesso do Cliente

1. Acesse a URL do portal
2. Faça login com suas credenciais (fornecidas pelo administrador)
3. Você será redirecionado para a área do cliente
4. Visualize e baixe seus aplicativos disponíveis

### Recuperação de Senha

1. Clique em "Esqueceu a senha?" na tela de login
2. Digite seu email ou telefone cadastrado
3. Receba o código de recuperação (no console para teste, por email/SMS em produção)
4. Use o código para redefinir sua senha

## 📱 Responsividade

O sistema é totalmente responsivo e otimizado para:
- Desktop
- Tablet
- Mobile (principal foco)

## 🔧 Configuração

### Alterar porta do servidor

Edite o arquivo `.env`:
```
PORT=3001
```

### Alterar chave secreta JWT

Edite o arquivo `.env`:
```
JWT_SECRET=sua_chave_secreta_aqui
```

## 🗄️ Banco de Dados

O sistema utiliza SQLite como banco de dados. O arquivo `database.sqlite` é criado automaticamente na primeira execução.

### Estrutura das Tabelas

**users:** Usuários do sistema
- id, username, password, full_name, email, role, created_at

**clients:** Informações dos clientes
- id, user_id, company_name, phone, address, created_at

**applications:** Aplicativos dos clientes
- id, client_id, name, description, android_file, android_version, pc_file, pc_version, website_url, created_at

**password_reset_codes:** Códigos de recuperação de senha
- id, user_id, code, expires_at, used, created_at

## 🔒 Segurança

- Senhas criptografadas com bcrypt
- Tokens JWT para autenticação
- Validação de inputs
- Proteção contra SQL injection (parâmetros preparados)
- WebSockets para atualizações em tempo real
- Códigos de recuperação com expiração

## 🎨 Design

- Interface moderna com gradientes animados
- Partículas flutuantes no fundo
- Efeitos visuais suaves
- Cores douradas e azuis da marca ENGRENAPP
- Totalmente responsivo

## 📝 Funcionalidades Implementadas

- ✅ Sistema de login/autenticação
- ✅ Painel administrativo completo
- ✅ Gerenciamento de clientes
- ✅ Gerenciamento de aplicativos
- ✅ Upload de arquivos (APK/EXE)
- ✅ Download de aplicativos
- ✅ Links para sites
- ✅ Recuperação de senha com código
- ✅ Atualizações em tempo real (WebSockets)
- ✅ Design responsivo mobile-first
- ✅ Apenas administrador cria usuários

## 📞 Suporte

Para suporte, entre em contato:
- Email: engrenappcorporationdev@gmail.com
- WhatsApp: (19) 99690-6995
