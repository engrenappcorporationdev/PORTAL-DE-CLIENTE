const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const crypto = require('crypto');
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
app.use(express.static('public', {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=UTF-8');
    }
  }
}));

const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.apk', '.aab', '.exe', '.msi', '.zip', '.rar', '.7z',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'
]);

const DOWNLOAD_MIME_TYPES = {
  '.apk': 'application/vnd.android.package-archive',
  '.aab': 'application/x-authorware-bin',
  '.exe': 'application/vnd.microsoft.portable-executable',
  '.msi': 'application/x-msi',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf'
};

function normalizeWebsiteUrl(url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Configuração de upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      return cb(new Error(`Tipo de arquivo não permitido (${ext || 'sem extensão'}). Use APK, EXE, ZIP, imagens ou PDF.`));
    }
    cb(null, true);
  }
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
  let token = authHeader && authHeader.split(' ')[1];

  if (!token && req.query.token) {
    token = req.query.token;
  }

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

function isChildUser(user) {
  return user?.is_child === 1 || user?.is_child === true;
}

async function resolveClientOwnerUserId(userId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, is_child, parent_user_id')
    .eq('id', userId)
    .single();

  if (error || !user) {
    return null;
  }

  if (isChildUser(user) && user.parent_user_id) {
    return user.parent_user_id;
  }

  return user.id;
}

async function getClientByUserId(userId) {
  const ownerUserId = await resolveClientOwnerUserId(userId);
  if (!ownerUserId) {
    return null;
  }

  const { data: client, error } = await supabase
    .from('clients')
    .select('id, user_id, company_name, phone, address')
    .eq('user_id', ownerUserId)
    .single();

  if (error || !client) {
    return null;
  }

  return client;
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

app.get('/api/admin/clients/:id/details', authenticateToken, requireAdmin, async (req, res) => {
  const clientId = req.params.id;

  try {
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*, users(id, username, full_name, email, created_at)')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    const parentUserId = client.user_id;

    const [licensesResult, applicationsResult] = await Promise.all([
      supabase
        .from('users')
        .select('id, username, full_name, email, created_at')
        .eq('parent_user_id', parentUserId)
        .eq('is_child', 1)
        .order('created_at', { ascending: true }),
      supabase
        .from('applications')
        .select('id, name, description, android_version, pc_version, website_url, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
    ]);

    if (licensesResult.error) {
      return res.status(500).json({ error: 'Erro ao buscar licenças do cliente' });
    }

    if (applicationsResult.error) {
      return res.status(500).json({ error: 'Erro ao buscar aplicativos do cliente' });
    }

    res.json({
      client,
      baseUser: client.users,
      licenses: licensesResult.data || [],
      applications: applicationsResult.data || []
    });
  } catch (error) {
    console.error('Erro ao buscar detalhes do cliente:', error);
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

async function generateLicenseUsername(parentUserId, parentUsername) {
  const { count } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('parent_user_id', parentUserId)
    .eq('is_child', 1);

  let licenseNum = (count || 0) + 1;
  let username = `${licenseNum}${parentUsername}`;

  while (true) {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (!existing) break;
    licenseNum++;
    username = `${licenseNum}${parentUsername}`;
  }

  return username;
}

// Rotas para gerenciar licenças adicionais
app.post('/api/admin/child-users', authenticateToken, requireAdmin, async (req, res) => {
  const { parent_user_id, count: licenseCount = 1 } = req.body;

  if (!parent_user_id) {
    return res.status(400).json({ error: 'Selecione um cliente' });
  }

  const count = Math.max(parseInt(licenseCount, 10) || 1, 1);

  try {
    const { data: parentUser, error: parentError } = await supabase
      .from('users')
      .select('id, username, full_name, email')
      .eq('id', parent_user_id)
      .single();

    if (parentError || !parentUser) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    const { data: client } = await supabase
      .from('clients')
      .select('licenses_used')
      .eq('user_id', parent_user_id)
      .single();

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    const createdLicenses = [];

    for (let i = 0; i < count; i++) {
      const username = await generateLicenseUsername(parent_user_id, parentUser.username);
      const password = crypto.randomBytes(4).toString('hex');
      const hashedPassword = bcrypt.hashSync(password, 10);

      const { data: licenseUser, error: userError } = await supabase
        .from('users')
        .insert({
          username,
          password: hashedPassword,
          full_name: parentUser.full_name,
          email: parentUser.email,
          role: 'client',
          parent_user_id,
          is_child: 1
        })
        .select()
        .single();

      if (userError) {
        if (userError.code === '23505') {
          return res.status(400).json({ error: 'Não foi possível gerar um usuário único para a licença' });
        }
        return res.status(500).json({ error: 'Erro ao criar licença' });
      }

      createdLicenses.push({ id: licenseUser.id, username, password });
    }

    const newLicensesUsed = (client.licenses_used || 0) + count;
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        licenses_used: newLicensesUsed,
        licenses: newLicensesUsed + 1
      })
      .eq('user_id', parent_user_id);

    if (updateError) {
      console.error('Erro ao atualizar licenças usadas:', updateError);
    }

    res.json({
      message: count === 1 ? 'Licença adicionada com sucesso' : `${count} licenças adicionadas com sucesso`,
      licenses: createdLicenses
    });
  } catch (error) {
    console.error('Erro ao criar licença:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.get('/api/admin/child-users/:parent_id', authenticateToken, requireAdmin, async (req, res) => {
  const parentId = req.params.parent_id;

  try {
    const { data: licenseUsers, error } = await supabase
      .from('users')
      .select('*')
      .eq('parent_user_id', parentId)
      .eq('is_child', 1)
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar licenças' });
    }

    res.json(licenseUsers);
  } catch (error) {
    console.error('Erro ao buscar licenças:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.delete('/api/admin/child-users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const licenseUserId = req.params.id;

  try {
    const { data: licenseUser, error: licenseError } = await supabase
      .from('users')
      .select('parent_user_id')
      .eq('id', licenseUserId)
      .single();

    if (licenseError || !licenseUser) {
      return res.status(404).json({ error: 'Licença não encontrada' });
    }

    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', licenseUserId);

    if (deleteError) {
      return res.status(500).json({ error: 'Erro ao excluir licença' });
    }

    const { data: client } = await supabase
      .from('clients')
      .select('licenses_used')
      .eq('user_id', licenseUser.parent_user_id)
      .single();

    if (client && client.licenses_used > 0) {
      const newLicensesUsed = client.licenses_used - 1;
      const { error: updateError } = await supabase
        .from('clients')
        .update({
          licenses_used: newLicensesUsed,
          licenses: newLicensesUsed + 1
        })
        .eq('user_id', licenseUser.parent_user_id);

      if (updateError) {
        console.error('Erro ao atualizar licenças usadas:', updateError);
      }
    }

    res.json({ message: 'Licença excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir licença:', error);
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
  const normalizedWebsiteUrl = normalizeWebsiteUrl(website_url);

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
        website_url: normalizedWebsiteUrl
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
      website_url: normalizeWebsiteUrl(website_url)
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
    const client = await getClientByUserId(req.user.id);

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
    const ownerUserId = await resolveClientOwnerUserId(req.user.id);
    if (!ownerUserId) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    const { data: profile, error } = await supabase
      .from('users')
      .select('*, clients(company_name, phone, address)')
      .eq('id', ownerUserId)
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

// Download de arquivos (com verificação de acesso do cliente)
app.get('/api/download/:filename', authenticateToken, async (req, res) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join(__dirname, 'uploads', filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
  }

  try {
    if (req.user.role !== 'admin') {
      const client = await getClientByUserId(req.user.id);
      if (!client) {
        return res.status(403).json({ error: 'Acesso negado' });
      }

      const { data: application, error } = await supabase
        .from('applications')
        .select('id, name, android_file, pc_file, client_id')
        .eq('client_id', client.id)
        .or(`android_file.eq.${filename},pc_file.eq.${filename}`)
        .maybeSingle();

      if (error || !application) {
        return res.status(403).json({ error: 'Você não tem permissão para baixar este arquivo' });
      }
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeType = DOWNLOAD_MIME_TYPES[ext] || 'application/octet-stream';
    const { data: application } = await supabase
      .from('applications')
      .select('name')
      .or(`android_file.eq.${filename},pc_file.eq.${filename}`)
      .maybeSingle();

    const displayName = application?.name
      ? `${application.name}${ext}`
      : filename;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${displayName.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.download(filepath, displayName);
  } catch (error) {
    console.error('Erro no download:', error);
    res.status(500).json({ error: 'Erro ao baixar arquivo' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande. Limite: 200MB' });
    }
    return res.status(400).json({ error: error.message });
  }

  if (error) {
    return res.status(400).json({ error: error.message || 'Erro no upload' });
  }

  next();
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Quando um cliente se conecta, ele pode se identificar com seu user_id
  socket.on('join', async (userId) => {
    socket.join(`user_${userId}`);
    console.log(`Usuário ${userId} entrou na sala`);

    const ownerUserId = await resolveClientOwnerUserId(userId);
    if (ownerUserId && ownerUserId !== userId) {
      socket.join(`user_${ownerUserId}`);
      console.log(`Licença ${userId} também entrou na sala do cliente ${ownerUserId}`);
    }
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
