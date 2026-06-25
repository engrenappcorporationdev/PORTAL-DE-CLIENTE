# Deploy do Portal ENGRENAPP - Render.com

Este guia explica como fazer o deploy do portal no Render.com gratuitamente.

## Pré-requisitos

- Conta no GitHub
- Conta no Render.com (gratuita)

## Passo 1: Preparar o repositório GitHub

1. Crie um novo repositório no GitHub
2. Faça upload dos arquivos do projeto (exceto node_modules e database.sqlite)
3. Certifique-se de que o arquivo .gitignore está configurado corretamente

## Passo 2: Configurar o Render.com

1. Acesse https://render.com e faça login
2. Clique em "New +" → "Web Service"
3. Conecte sua conta do GitHub
4. Selecione o repositório do portal

## Passo 3: Configurar o Web Service

### Build & Deploy

- **Build Command:** `npm install`
- **Start Command:** `node server.js`

### Environment Variables

Adicione as seguintes variáveis de ambiente:

```
PORT=3001
JWT_SECRET=engrenapp_secret_key_2024_production_mude_isto
NODE_ENV=production
```

**IMPORTANTE:** Mude o JWT_SECRET para uma chave secreta forte!

## Passo 4: Deploy

1. Clique em "Create Web Service"
2. Aguarde o processo de build e deploy
3. O Render fornecerá uma URL como: `https://seu-projeto.onrender.com`

## Passo 5: Configurar Banco de Dados

O SQLite funciona no Render, mas os dados serão perdidos se o serviço reiniciar. Para persistência:

### Opção 1: Usar SQLite (simples, mas dados perdidos ao reiniciar)
- Já está configurado
- Funciona para testes

### Opção 2: Usar PostgreSQL (recomendado para produção)
1. No Render, crie um "PostgreSQL" database
2. Adicione a variável de ambiente `DATABASE_URL`
3. Instale o pacote `pg`: `npm install pg`
4. Modifique o código para usar PostgreSQL em vez de SQLite

## Passo 6: Ajustar Frontend para Produção

No arquivo `public/app.js`, altere:

```javascript
const API_BASE = 'https://seu-projeto.onrender.com/api';
```

## Passo 7: Testar

1. Acesse a URL fornecida pelo Render
2. Teste o login com o usuário admin
3. Teste as funcionalidades

## Limitações do Plano Gratuito

- O serviço fica inativo após 15 minutos sem uso
- Demora ~30 segundos para acordar quando inativo
- 512MB RAM
- 0.1 CPU

## Alternativas Gratuitas

### Railway.app
- Similar ao Render
- $5 de crédito gratuito por mês
- Melhor performance

### Glitch.com
- Totalmente gratuito
- Fácil de usar
- Limitações de recursos

### Oracle Cloud Always Free
- VPS gratuito
- Mais complexo de configurar
- Recursos ilimitados

## Notas Importantes

- O sistema de recuperação de senha envia o código apenas para o console em produção
- Para enviar emails/SMS reais, você precisará integrar um serviço como:
  - SendGrid (emails)
  - Twilio (SMS)
  - Firebase Authentication

- Para domínio personalizado, você precisará:
  1. Comprar um domínio
  2. Configurar DNS no Render
  3. O plano gratuito não suporta domínios personalizados
