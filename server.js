const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { createServer } = require('http');
const { Server } = require('socket.io');

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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

// Inicialização do banco de dados
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err);
  } else {
    console.log('Conectado ao banco de dados SQLite');
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Tabela de usuários
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT,
    email TEXT,
    role TEXT DEFAULT 'client',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Erro ao criar tabela users:', err);
    } else {
      // Tabela de clientes
      db.run(`CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        company_name TEXT,
        phone TEXT,
        address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`, (err) => {
        if (err) {
          console.error('Erro ao criar tabela clients:', err);
        } else {
          // Tabela de aplicativos
          db.run(`CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER,
            name TEXT NOT NULL,
            description TEXT,
            android_file TEXT,
            android_version TEXT,
            pc_file TEXT,
            pc_version TEXT,
            website_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients(id)
          )`, (err) => {
            if (err) {
              console.error('Erro ao criar tabela applications:', err);
            } else {
              // Tabela de códigos de recuperação de senha
              db.run(`CREATE TABLE IF NOT EXISTS password_reset_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                code TEXT NOT NULL,
                expires_at DATETIME NOT NULL,
                used INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
              )`, (err) => {
                if (err) {
                  console.error('Erro ao criar tabela password_reset_codes:', err);
                } else {
                  // Criar usuário administrador padrão
                  const adminPassword = bcrypt.hashSync('Camila2006#', 10);
                  db.run(`INSERT OR IGNORE INTO users (username, password, full_name, email, role) 
                    VALUES (?, ?, ?, ?, ?)`,
                    ['renan.divino', adminPassword, 'Renan Divino', 'renan.divino@engrenapp.com', 'admin'],
                    (err) => {
                      if (err) {
                        console.error('Erro ao criar usuário admin:', err);
                      } else {
                        console.log('Usuário administrador criado/verificado com sucesso');
                      }
                    }
                  );
                }
              });
            }
          });
        }
      });
    }
  });
}

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
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Erro no servidor' });
    }

    if (!user) {
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
  });
});

// Rota de registro removida - apenas administrador pode criar usuários

// Rota de recuperação de senha - Solicitar código
app.post('/api/forgot-password', (req, res) => {
  const { contact } = req.body;

  // Buscar usuário por email ou telefone
  db.get('SELECT * FROM users WHERE email = ? OR (SELECT phone FROM clients WHERE user_id = users.id) = ?', [contact, contact], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Erro no servidor' });
    }

    if (!user) {
      // Por segurança, não informamos se o usuário existe ou não
      return res.json({ message: 'Se o email/telefone estiver cadastrado, você receberá um código de recuperação.' });
    }

    // Gerar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    // Salvar código no banco de dados
    db.run(`INSERT INTO password_reset_codes (user_id, code, expires_at) 
      VALUES (?, ?, ?)`,
      [user.id, code, expiresAt.toISOString()],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Erro ao gerar código de recuperação' });
        }

        // Em produção, aqui você enviaria o código por email ou SMS
        console.log(`Código de recuperação gerado para ${user.username}: ${code}`);

        res.json({
          message: 'Código de recuperação enviado com sucesso'
        });
      }
    );
  });
});

// Rota de recuperação de senha - Validar código e redefinir senha
app.post('/api/reset-password', (req, res) => {
  const { code, new_password, confirm_password } = req.body;

  if (new_password !== confirm_password) {
    return res.status(400).json({ error: 'As senhas não coincidem' });
  }

  // Buscar código válido e não usado
  db.get(`SELECT * FROM password_reset_codes 
    WHERE code = ? AND used = 0 AND expires_at > datetime('now')`,
    [code],
    (err, resetCode) => {
      if (err) {
        return res.status(500).json({ error: 'Erro no servidor' });
      }

      if (!resetCode) {
        return res.status(400).json({ error: 'Código inválido ou expirado' });
      }

      // Atualizar senha do usuário
      const hashedPassword = bcrypt.hashSync(new_password, 10);
      db.run(`UPDATE users SET password = ? WHERE id = ?`,
        [hashedPassword, resetCode.user_id],
        (err) => {
          if (err) {
            return res.status(500).json({ error: 'Erro ao atualizar senha' });
          }

          // Marcar código como usado
          db.run(`UPDATE password_reset_codes SET used = 1 WHERE id = ?`,
            [resetCode.id],
            (err) => {
              if (err) {
                console.error('Erro ao marcar código como usado:', err);
              }

              res.json({ message: 'Senha redefinida com sucesso' });
            }
        );
      }
    );
  });
});

// Rotas do painel administrativo
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const query = `
    SELECT u.*, c.company_name, c.phone 
    FROM users u 
    LEFT JOIN clients c ON u.id = c.user_id
    ORDER BY u.created_at DESC
  `;
  
  db.all(query, [], (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
    res.json(users);
  });
});

app.get('/api/admin/clients', authenticateToken, requireAdmin, (req, res) => {
  const query = `
    SELECT c.*, u.username, u.full_name, u.email 
    FROM clients c 
    JOIN users u ON c.user_id = u.id
    ORDER BY c.created_at DESC
  `;
  
  db.all(query, [], (err, clients) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar clientes' });
    }
    res.json(clients);
  });
});

app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  const { username, password, full_name, email, company_name, phone } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run('BEGIN TRANSACTION');

  db.run(`INSERT INTO users (username, password, full_name, email, role) 
    VALUES (?, ?, ?, ?, ?)`,
    [username, hashedPassword, full_name, email, 'client'],
    function(err) {
      if (err) {
        db.run('ROLLBACK');
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Usuário já existe' });
        }
        return res.status(500).json({ error: 'Erro ao criar usuário' });
      }

      const userId = this.lastID;

      db.run(`INSERT INTO clients (user_id, company_name, phone) 
        VALUES (?, ?, ?)`,
        [userId, company_name, phone],
        (err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Erro ao criar cliente' });
          }

          db.run('COMMIT');
          res.json({ message: 'Usuário criado com sucesso', userId });
        }
      );
    }
  );
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const userId = req.params.id;

  db.run('BEGIN TRANSACTION');

  db.run('DELETE FROM applications WHERE client_id IN (SELECT id FROM clients WHERE user_id = ?)', [userId], (err) => {
    if (err) {
      db.run('ROLLBACK');
      return res.status(500).json({ error: 'Erro ao excluir aplicativos do cliente' });
    }

    db.run('DELETE FROM clients WHERE user_id = ?', [userId], (err) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: 'Erro ao excluir cliente' });
      }

      db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Erro ao excluir usuário' });
        }

        db.run('COMMIT');
        res.json({ message: 'Usuário excluído com sucesso' });
      });
    });
  });
});

// Rotas de aplicativos (Admin)
app.post('/api/admin/applications', authenticateToken, requireAdmin, upload.fields([
  { name: 'android_file', maxCount: 1 },
  { name: 'pc_file', maxCount: 1 }
]), (req, res) => {
  const { client_id, name, description, android_version, pc_version, website_url } = req.body;

  const androidFile = req.files['android_file'] ? req.files['android_file'][0].filename : null;
  const pcFile = req.files['pc_file'] ? req.files['pc_file'][0].filename : null;

  db.run(`INSERT INTO applications (client_id, name, description, android_file, android_version, pc_file, pc_version, website_url) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [client_id, name, description, androidFile, android_version, pcFile, pc_version, website_url],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Erro ao criar aplicativo' });
      }

      // Buscar o user_id do cliente para notificar
      db.get('SELECT user_id FROM clients WHERE id = ?', [client_id], (err, client) => {
        if (client && client.user_id) {
          // Buscar o aplicativo criado para enviar a notificação
          db.get('SELECT * FROM applications WHERE id = ?', [this.lastID], (err, application) => {
            if (application) {
              notifyClient(client.user_id, application);
            }
          });
        }
      });

      res.json({ message: 'Aplicativo criado com sucesso', appId: this.lastID });
    }
  );
});

app.put('/api/admin/applications/:id', authenticateToken, requireAdmin, upload.fields([
  { name: 'android_file', maxCount: 1 },
  { name: 'pc_file', maxCount: 1 }
]), (req, res) => {
  const appId = req.params.id;
  const { name, description, android_version, pc_version, website_url } = req.body;

  const androidFile = req.files['android_file'] ? req.files['android_file'][0].filename : null;
  const pcFile = req.files['pc_file'] ? req.files['pc_file'][0].filename : null;

  let query = 'UPDATE applications SET name = ?, description = ?, android_version = ?, pc_version = ?, website_url = ?';
  let params = [name, description, android_version, pc_version, website_url];

  if (androidFile) {
    query += ', android_file = ?';
    params.push(androidFile);
  }

  if (pcFile) {
    query += ', pc_file = ?';
    params.push(pcFile);
  }

  query += ' WHERE id = ?';
  params.push(appId);

  db.run(query, params, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao atualizar aplicativo' });
    }
    res.json({ message: 'Aplicativo atualizado com sucesso' });
  });
});

app.delete('/api/admin/applications/:id', authenticateToken, requireAdmin, (req, res) => {
  const appId = req.params.id;

  // Primeiro busca o aplicativo para excluir os arquivos
  db.get('SELECT * FROM applications WHERE id = ?', [appId], (err, app) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar aplicativo' });
    }

    if (app) {
      // Excluir arquivos
      if (app.android_file) {
        fs.unlink(path.join(__dirname, 'uploads', app.android_file), () => {});
      }
      if (app.pc_file) {
        fs.unlink(path.join(__dirname, 'uploads', app.pc_file), () => {});
      }
    }

    db.run('DELETE FROM applications WHERE id = ?', [appId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao excluir aplicativo' });
      }
      res.json({ message: 'Aplicativo excluído com sucesso' });
    });
  });
});

app.get('/api/admin/applications', authenticateToken, requireAdmin, (req, res) => {
  const query = `
    SELECT a.*, c.company_name, c.user_id 
    FROM applications a 
    JOIN clients c ON a.client_id = c.id
    ORDER BY a.created_at DESC
  `;
  
  db.all(query, [], (err, applications) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar aplicativos' });
    }
    res.json(applications);
  });
});

// Rotas do cliente
app.get('/api/client/applications', authenticateToken, (req, res) => {
  const query = `
    SELECT a.* 
    FROM applications a 
    JOIN clients c ON a.client_id = c.id 
    WHERE c.user_id = ?
    ORDER BY a.created_at DESC
  `;
  
  db.all(query, [req.user.id], (err, applications) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar aplicativos' });
    }
    res.json(applications);
  });
});

app.get('/api/client/profile', authenticateToken, (req, res) => {
  const query = `
    SELECT u.*, c.company_name, c.phone, c.address 
    FROM users u 
    LEFT JOIN clients c ON u.id = c.user_id 
    WHERE u.id = ?
  `;
  
  db.get(query, [req.user.id], (err, profile) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar perfil' });
    }
    res.json(profile);
  });
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
