const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'engrenapp_secret_key_2024';

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERRO: Variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.static('.')); // Serve arquivos da raiz também

// Configuração de upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// Inicialização do banco de dados Supabase
async function initializeDatabase() {
  try {
    console.log('Conectado ao Supabase');

    // Verificar se usuário admin existe, se não, criar
    const { data: existingAdmin, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('username', 'renan.divino')
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Erro ao verificar usuário admin:', checkError);
    }

    if (!existingAdmin) {
      const adminPassword = bcrypt.hashSync('Camila2006#', 10);
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          username: 'renan.divino',
          password: adminPassword,
          full_name: 'Renan Divino',
          email: 'renan.divino@engrenapp.com',
          role: 'admin'
        });

      if (insertError) {
        console.error('Erro ao criar usuário admin:', insertError);
      } else {
        console.log('Usuário administrador criado com sucesso');
      }
    } else {
      console.log('Usuário administrador já existe');
    }
  } catch (error) {
    console.error('Erro ao inicializar banco de dados:', error);
  }
}

initializeDatabase();

// Middleware de autenticação
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
}

// Middleware de verificação de admin
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
  next();
}

// Rotas de autenticação
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Rota de registro removida - apenas administrador pode criar usuários

// Rota de recuperação de senha - Solicitar código
app.post('/api/forgot-password', async (req, res) => {
  const { contact } = req.body;

  try {
    // Buscar usuário por email ou telefone
    const { data: user, error } = await supabase
      .from('users')
      .select('*, clients(phone)')
      .eq('email', contact)
      .or(`clients.phone.eq.${contact}`)
      .single();

    if (error || !user) {
      // Por segurança, não informamos se o usuário existe ou não
      return res.json({ message: 'Se o email/telefone estiver cadastrado, você receberá um código de recuperação.' });
    }

    // Gerar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    // Salvar código no banco de dados
    const { error: insertError } = await supabase
      .from('password_reset_codes')
      .insert({
        user_id: user.id,
        code: code,
        expires_at: expiresAt.toISOString()
      });

    if (insertError) {
      return res.status(500).json({ error: 'Erro ao gerar código de recuperação' });
    }

    // Em produção, aqui você enviaria o código por email ou SMS
    console.log(`Código de recuperação gerado para ${user.username}: ${code}`);

    res.json({
      message: 'Código de recuperação enviado com sucesso'
    });
  } catch (error) {
    console.error('Erro na recuperação de senha:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Rota de recuperação de senha - Validar código e redefinir senha
app.post('/api/reset-password', async (req, res) => {
  const { code, new_password, confirm_password } = req.body;

  if (new_password !== confirm_password) {
    return res.status(400).json({ error: 'As senhas não coincidem' });
  }

  try {
    // Buscar código válido e não usado
    const { data: resetCode, error } = await supabase
      .from('password_reset_codes')
      .select('*')
      .eq('code', code)
      .eq('used', 0)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !resetCode) {
      return res.status(400).json({ error: 'Código inválido ou expirado' });
    }

    // Atualizar senha do usuário
    const hashedPassword = bcrypt.hashSync(new_password, 10);
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', resetCode.user_id);

    if (updateError) {
      return res.status(500).json({ error: 'Erro ao atualizar senha' });
    }

    // Marcar código como usado
    const { error: markError } = await supabase
      .from('password_reset_codes')
      .update({ used: 1 })
      .eq('id', resetCode.id);

    if (markError) {
      console.error('Erro ao marcar código como usado:', markError);
    }

    res.json({ message: 'Senha redefinida com sucesso' });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Rotas do painel administrativo
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*, clients(company_name, phone)')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar usuários' });
    }

    res.json(users);
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.get('/api/admin/clients', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*, users(username, full_name, email)')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar clientes' });
    }

    res.json(clients);
  } catch (error) {
    console.error('Erro ao buscar clientes:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  const { username, password, full_name, email, company_name, phone } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  try {
    // Criar usuário
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        username,
        password: hashedPassword,
        full_name,
        email,
        role: 'client'
      })
      .select()
      .single();

    if (userError) {
      if (userError.code === '23505') {
        return res.status(400).json({ error: 'Usuário já existe' });
      }
      return res.status(500).json({ error: 'Erro ao criar usuário' });
    }

    // Criar cliente
    const { error: clientError } = await supabase
      .from('clients')
      .insert({
        user_id: user.id,
        company_name,
        phone
      });

    if (clientError) {
      // Rollback: excluir usuário se cliente falhar
      await supabase.from('users').delete().eq('id', user.id);
      return res.status(500).json({ error: 'Erro ao criar cliente' });
    }

    res.json({ message: 'Usuário criado com sucesso', userId: user.id });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Rota para editar usuário
app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  const { username, full_name, email, password } = req.body;

  try {
    const updateData = {};
    if (username) updateData.username = username;
    if (full_name) updateData.full_name = full_name;
    if (email) updateData.email = email;
    if (password) updateData.password = bcrypt.hashSync(password, 10);

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId);

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Usuário já existe' });
      }
      return res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }

    res.json({ message: 'Usuário atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Rota para editar cliente
app.put('/api/admin/clients/:id', authenticateToken, requireAdmin, async (req, res) => {
  const clientId = req.params.id;
  const { company_name, phone, address, licenses } = req.body;

  try {
    const updateData = {};
    if (company_name !== undefined) updateData.company_name = company_name;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (licenses !== undefined) updateData.licenses = licenses;

    const { error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', clientId);

    if (error) {
      return res.status(500).json({ error: 'Erro ao atualizar cliente' });
    }

    res.json({ message: 'Cliente atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  console.log('=== DELETE /api/admin/users/:id ===');
  console.log('User ID:', userId);
  console.log('Request user:', req.user);

  try {
    console.log('Tentando excluir usuário:', userId);

    // Buscar o cliente associado ao usuário
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', userId)
      .single();

    console.log('Cliente data:', client);
    console.log('Cliente error:', clientError);

    if (clientError && clientError.code !== 'PGRST116') {
      console.error('Erro ao buscar cliente:', clientError);
      return res.status(500).json({ error: 'Erro ao buscar cliente' });
    }

    if (client) {
      console.log('Cliente encontrado:', client.id);

      // Excluir aplicativos do cliente
      const { error: appsError } = await supabase
        .from('applications')
        .delete()
        .eq('client_id', client.id);

      if (appsError) {
        console.error('Erro ao excluir aplicativos:', appsError);
        // Continua mesmo com erro
      }

      // Excluir cliente
      const { error: deleteClientError } = await supabase
        .from('clients')
        .delete()
        .eq('id', client.id);

      if (deleteClientError) {
        console.error('Erro ao excluir cliente:', deleteClientError);
        return res.status(500).json({ error: 'Erro ao excluir cliente' });
      }

      console.log('Cliente excluído com sucesso');
    }

    // Excluir usuário
    const { error: userError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    console.log('User error:', userError);

    if (userError) {
      console.error('Erro ao excluir usuário:', userError);
      return res.status(500).json({ error: 'Erro ao excluir usuário: ' + userError.message });
    }

    console.log('Usuário excluído com sucesso');
    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.status(500).json({ error: 'Erro no servidor: ' + error.message });
  }
});

// Rotas para gerenciar usuários filhos (licenças)
app.post('/api/admin/child-users', authenticateToken, requireAdmin, async (req, res) => {
  const { parent_user_id, username, password, full_name, email } = req.body;

  if (!parent_user_id || !username || !password) {
    return res.status(400).json({ error: 'parent_user_id, username e password são obrigatórios' });
  }

  try {
    // Verificar se o cliente tem licenças disponíveis
    const { data: client } = await supabase
      .from('clients')
      .select('licenses, licenses_used')
      .eq('user_id', parent_user_id)
      .single();

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    if (client.licenses_used >= client.licenses) {
      return res.status(400).json({ error: 'Limite de licenças atingido' });
    }

    // Criar usuário filho
    const hashedPassword = bcrypt.hashSync(password, 10);
    const { data: childUser, error: userError } = await supabase
      .from('users')
      .insert({
        username,
        password: hashedPassword,
        full_name,
        email,
        role: 'client',
        parent_user_id,
        is_child: 1
      })
      .select()
      .single();

    if (userError) {
      if (userError.code === '23505') {
        return res.status(400).json({ error: 'Usuário já existe' });
      }
      return res.status(500).json({ error: 'Erro ao criar usuário filho' });
    }

    // Atualizar contador de licenças usadas
    const { error: updateError } = await supabase
      .from('clients')
      .update({ licenses_used: client.licenses_used + 1 })
      .eq('user_id', parent_user_id);

    if (updateError) {
      console.error('Erro ao atualizar licenças usadas:', updateError);
    }

    res.json({ message: 'Usuário filho criado com sucesso', userId: childUser.id });
  } catch (error) {
    console.error('Erro ao criar usuário filho:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.get('/api/admin/child-users/:parent_id', authenticateToken, requireAdmin, async (req, res) => {
  const parentId = req.params.id;

  try {
    const { data: childUsers, error } = await supabase
      .from('users')
      .select('*')
      .eq('parent_user_id', parentId)
      .eq('is_child', 1);

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar usuários filhos' });
    }

    res.json(childUsers);
  } catch (error) {
    console.error('Erro ao buscar usuários filhos:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.delete('/api/admin/child-users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const childUserId = req.params.id;

  try {
    // Buscar usuário filho
    const { data: childUser, error: childError } = await supabase
      .from('users')
      .select('parent_user_id')
      .eq('id', childUserId)
      .single();

    if (childError || !childUser) {
      return res.status(404).json({ error: 'Usuário filho não encontrado' });
    }

    // Excluir usuário filho
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', childUserId);

    if (deleteError) {
      return res.status(500).json({ error: 'Erro ao excluir usuário filho' });
    }

    // Atualizar contador de licenças usadas
    const { data: client } = await supabase
      .from('clients')
      .select('licenses_used')
      .eq('user_id', childUser.parent_user_id)
      .single();

    if (client && client.licenses_used > 0) {
      const { error: updateError } = await supabase
        .from('clients')
        .update({ licenses_used: client.licenses_used - 1 })
        .eq('user_id', childUser.parent_user_id);

      if (updateError) {
        console.error('Erro ao atualizar licenças usadas:', updateError);
      }
    }

    res.json({ message: 'Usuário filho excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir usuário filho:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Rotas de aplicativos (Admin)
app.post('/api/admin/applications', authenticateToken, requireAdmin, upload.fields([
  { name: 'android_file', maxCount: 1 },
  { name: 'pc_file', maxCount: 1 }
]), async (req, res) => {
  const { client_id, name, description, android_version, pc_version, website_url } = req.body;

  const androidFile = req.files['android_file'] ? req.files['android_file'][0].filename : null;
  const pcFile = req.files['pc_file'] ? req.files['pc_file'][0].filename : null;

  try {
    const { data: application, error } = await supabase
      .from('applications')
      .insert({
        client_id,
        name,
        description,
        android_file: androidFile,
        android_version,
        pc_file: pcFile,
        pc_version,
        website_url
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Erro ao criar aplicativo' });
    }

    // Buscar o user_id do cliente para notificar
    const { data: client } = await supabase
      .from('clients')
      .select('user_id')
      .eq('id', client_id)
      .single();

    if (client && client.user_id) {
      notifyClient(client.user_id, application);
    }

    res.json({ message: 'Aplicativo criado com sucesso', appId: application.id });
  } catch (error) {
    console.error('Erro ao criar aplicativo:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.put('/api/admin/applications/:id', authenticateToken, requireAdmin, upload.fields([
  { name: 'android_file', maxCount: 1 },
  { name: 'pc_file', maxCount: 1 }
]), async (req, res) => {
  const appId = req.params.id;
  const { name, description, android_version, pc_version, website_url } = req.body;

  const androidFile = req.files['android_file'] ? req.files['android_file'][0].filename : null;
  const pcFile = req.files['pc_file'] ? req.files['pc_file'][0].filename : null;

  try {
    const updateData = {
      name,
      description,
      android_version,
      pc_version,
      website_url
    };

    if (androidFile) {
      updateData.android_file = androidFile;
    }

    if (pcFile) {
      updateData.pc_file = pcFile;
    }

    const { error } = await supabase
      .from('applications')
      .update(updateData)
      .eq('id', appId);

    if (error) {
      return res.status(500).json({ error: 'Erro ao atualizar aplicativo' });
    }

    res.json({ message: 'Aplicativo atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar aplicativo:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.delete('/api/admin/applications/:id', authenticateToken, requireAdmin, async (req, res) => {
  const appId = req.params.id;

  try {
    // Primeiro busca o aplicativo para excluir os arquivos
    const { data: app } = await supabase
      .from('applications')
      .select('*')
      .eq('id', appId)
      .single();

    if (app) {
      // Excluir arquivos
      if (app.android_file) {
        fs.unlink(path.join(__dirname, 'uploads', app.android_file), () => {});
      }
      if (app.pc_file) {
        fs.unlink(path.join(__dirname, 'uploads', app.pc_file), () => {});
      }
    }

    const { error } = await supabase
      .from('applications')
      .delete()
      .eq('id', appId);

    if (error) {
      return res.status(500).json({ error: 'Erro ao excluir aplicativo' });
    }

    res.json({ message: 'Aplicativo excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir aplicativo:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.get('/api/admin/applications', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data: applications, error } = await supabase
      .from('applications')
      .select('*, clients(company_name)')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar aplicativos' });
    }

    res.json(applications);
  } catch (error) {
    console.error('Erro ao buscar aplicativos:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Rotas do cliente
app.get('/api/client/applications', authenticateToken, async (req, res) => {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (!client) {
      return res.json([]);
    }

    const { data: applications, error } = await supabase
      .from('applications')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar aplicativos' });
    }

    res.json(applications);
  } catch (error) {
    console.error('Erro ao buscar aplicativos do cliente:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.get('/api/client/profile', authenticateToken, async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('users')
      .select('*, clients(company_name, phone, address)')
      .eq('id', req.user.id)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar perfil' });
    }

    res.json(profile);
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Download de arquivos
app.get('/api/download/:filename', authenticateToken, (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(__dirname, 'uploads', filename);

  if (fs.existsSync(filepath)) {
    res.download(filepath);
  } else {
    res.status(404).json({ error: 'Arquivo não encontrado' });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Quando um cliente se conecta, ele pode se identificar com seu user_id
  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`Usuário ${userId} entrou na sala`);
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Função para notificar cliente sobre novo aplicativo
function notifyClient(userId, application) {
  io.to(`user_${userId}`).emit('new_application', application);
  console.log(`Notificação enviada para usuário ${userId}`);
}

// Iniciar servidor
httpServer.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
});
