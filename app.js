// ===== API Configuration =====
const API_BASE = '/api'; // URL relativa funciona tanto em dev quanto em produção

// ===== State Management =====
let currentUser = null;
let token = localStorage.getItem('token');
let socket = null;
let expandedLicenseUserId = null;

// ===== Socket.io Connection =====
function connectSocket() {
  if (socket) {
    socket.disconnect();
  }

  socket = io();

  socket.on('connect', () => {
    console.log('Conectado ao WebSocket');
    if (currentUser) {
      socket.emit('join', currentUser.id);
    }
  });

  socket.on('new_application', (application) => {
    console.log('Novo aplicativo recebido:', application);
    showToast('Novo aplicativo disponível!', 'success');
    loadClientData(); // Recarregar os aplicativos
  });

  socket.on('disconnect', () => {
    console.log('Desconectado do WebSocket');
  });
}

function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ===== DOM Elements =====
const pages = {
  login: document.getElementById('loginPage'),
  support: document.getElementById('supportPage'),
  admin: document.getElementById('adminDashboard'),
  client: document.getElementById('clientDashboard')
};

// ===== Navigation =====
function showPage(pageName) {
  Object.values(pages).forEach(page => {
    if (page) page.classList.remove('active');
  });
  if (pages[pageName]) {
    pages[pageName].classList.add('active');
  }
}

// ===== Authentication =====
async function login(username, password) {
  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao fazer login');
    }

    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));

    showToast('Login realizado com sucesso!', 'success');

    if (currentUser.role === 'admin') {
      showPage('admin');
      document.getElementById('adminUsername').textContent = currentUser.username;
      loadAdminData();
    } else {
      showPage('client');
      document.getElementById('clientUsername').textContent = currentUser.username;
      connectSocket(); // Conectar WebSocket para clientes
      loadClientData();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function logout() {
  disconnectSocket(); // Desconectar WebSocket
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  showPage('login');
  showToast('Logout realizado com sucesso!', 'success');
}

// ===== API Helper =====
async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Erro na requisição');
  }

  return data;
}

function getFileExtension(filename) {
  if (!filename) return '';
  const index = filename.lastIndexOf('.');
  return index >= 0 ? filename.slice(index) : '';
}

function normalizeWebsiteUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function buildDownloadName(appName, platform, filename) {
  const ext = getFileExtension(filename);
  const safeName = String(appName || 'arquivo').replace(/[^\w\s.-]/g, '').trim() || 'arquivo';
  return `${safeName}-${platform}${ext}`;
}

async function downloadAppFile(filename, displayName) {
  if (!token) {
    showToast('Faça login para baixar arquivos', 'error');
    return;
  }

  showToast('Preparando download...', 'success');

  try {
    const response = await fetch(`${API_BASE}/download/${encodeURIComponent(filename)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Erro ao baixar arquivo');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = displayName || filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Download iniciado!', 'success');
  } catch (error) {
    const fallbackUrl = `${API_BASE}/download/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`;
    const opened = window.open(fallbackUrl, '_blank');
    if (!opened) {
      showToast(error.message, 'error');
    } else {
      showToast('Abrindo download...', 'success');
    }
  }
}

// ===== Admin Dashboard =====
async function loadAdminData() {
  await Promise.all([
    loadClients(),
    loadApplications(),
    loadUsers()
  ]);
}

async function loadClients() {
  try {
    const clients = await apiCall('/admin/clients');
    renderClientsTable(clients);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadApplications() {
  try {
    const applications = await apiCall('/admin/applications');
    renderApplicationsTable(applications);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadUsers() {
  try {
    const clients = await apiCall('/admin/clients');
    renderUsersTable(clients);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderUsersTable(clients) {
  expandedLicenseUserId = null;
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = clients.map(client => {
    const user = client.users || {};
    const licenseCount = client.licenses_used || 0;
    return `
    <tr class="client-base-row">
      <td>${client.company_name || '-'}</td>
      <td>${user.username || '-'}</td>
      <td>${user.full_name || '-'}</td>
      <td>${user.email || '-'}</td>
      <td><span class="license-badge">${licenseCount}</span></td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-sm btn-secondary" onclick="toggleLicenses('${client.user_id}')">Ver Licenças</button>
          <button class="btn btn-sm btn-primary" onclick="showClientDetails('${client.id}')">Detalhes</button>
        </div>
      </td>
    </tr>
    <tr class="license-expand-row" id="licenses-${client.user_id}" style="display: none;">
      <td colspan="6">
        <div class="license-panel" id="license-panel-${client.user_id}">
          <p class="license-loading">Carregando licenças...</p>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function toggleLicenses(parentUserId) {
  const expandRow = document.getElementById(`licenses-${parentUserId}`);
  if (!expandRow) return;

  if (expandedLicenseUserId === parentUserId) {
    expandRow.style.display = 'none';
    expandedLicenseUserId = null;
    return;
  }

  if (expandedLicenseUserId) {
    const prevRow = document.getElementById(`licenses-${expandedLicenseUserId}`);
    if (prevRow) prevRow.style.display = 'none';
  }

  expandRow.style.display = 'table-row';
  expandedLicenseUserId = parentUserId;
  await loadLicensePanel(parentUserId);
}

async function loadLicensePanel(parentUserId) {
  const panel = document.getElementById(`license-panel-${parentUserId}`);
  if (!panel) return;

  panel.innerHTML = '<p class="license-loading">Carregando licenças...</p>';

  const panelHeader = '<div class="license-panel-header"><h4>Licenças adicionais</h4></div>';

  try {
    const licenses = await apiCall(`/admin/child-users/${parentUserId}`);

    if (licenses.length === 0) {
      panel.innerHTML = `${panelHeader}<p class="license-empty">Nenhuma licença adicional cadastrada para este cliente.</p>`;
      return;
    }

    panel.innerHTML = `
      ${panelHeader}
      <table class="data-table license-subtable">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Nome</th>
            <th>Email</th>
            <th>Criado em</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${licenses.map(lic => `
            <tr>
              <td>${lic.username}</td>
              <td>${lic.full_name || '-'}</td>
              <td>${lic.email || '-'}</td>
              <td>${new Date(lic.created_at).toLocaleDateString('pt-BR')}</td>
              <td>
                <div class="action-buttons">
                  <button class="btn btn-sm btn-primary" onclick="editUser('${lic.id}')">Editar</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteLicense('${lic.id}', '${parentUserId}')">Excluir</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch (error) {
    panel.innerHTML = `${panelHeader}<p class="license-empty">${error.message}</p>`;
  }
}

function renderClientsTable(clients) {
  const tbody = document.getElementById('clientsTableBody');
  tbody.innerHTML = clients.map(client => `
    <tr>
      <td>${client.company_name || '-'}</td>
      <td>${client.users?.full_name || client.full_name || '-'}</td>
      <td>${client.users?.email || client.email || '-'}</td>
      <td>${client.phone || '-'}</td>
      <td>${client.users?.username || client.username || '-'}</td>
      <td><span class="license-badge">${client.licenses_used || 0}</span></td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-sm btn-primary" onclick="showClientDetails('${client.id}')">Detalhes</button>
          <button class="btn btn-sm btn-secondary" onclick="editClient('${client.id}')">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="deleteUser('${client.user_id}')">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderApplicationsTable(applications) {
  const tbody = document.getElementById('applicationsTableBody');
  tbody.innerHTML = applications.map(app => `
    <tr>
      <td>${app.name}</td>
      <td>${app.company_name}</td>
      <td>${app.android_version || '-'}</td>
      <td>${app.pc_version || '-'}</td>
      <td>${app.website_url ? '<a href="' + app.website_url + '" target="_blank">Link</a>' : '-'}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-sm btn-danger" onclick="deleteApplication(${app.id})">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function deleteUser(userId) {
  if (!confirm('Tem certeza que deseja excluir este usuário?')) return;

  try {
    await apiCall(`/admin/users/${userId}`, { method: 'DELETE' });
    showToast('Usuário excluído com sucesso!', 'success');
    loadAdminData();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteApplication(appId) {
  if (!confirm('Tem certeza que deseja excluir este aplicativo?')) return;

  try {
    await apiCall(`/admin/applications/${appId}`, { method: 'DELETE' });
    showToast('Aplicativo excluído com sucesso!', 'success');
    loadApplications();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function editClient(clientId) {
  try {
    const clients = await apiCall('/admin/clients');
    const client = clients.find(c => String(c.id) === String(clientId));

    if (client) {
      document.getElementById('editClientId').value = client.id;
      document.getElementById('editClientCompanyName').value = client.company_name || '';
      document.getElementById('editClientFullName').value = client.users?.full_name || client.full_name || '';
      document.getElementById('editClientEmail').value = client.users?.email || client.email || '';
      document.getElementById('editClientPhone').value = client.phone || '';

      openModal('editClientModal');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function bindClick(id, handler) {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener('click', handler);
  }
}

function bindSubmit(id, handler) {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener('submit', handler);
  }
}

async function updateClient(formData) {
  try {
    await apiCall(`/admin/clients/${formData.id}`, {
      method: 'PUT',
      body: JSON.stringify(formData)
    });
    showToast('Cliente atualizado com sucesso!', 'success');
    closeModal('editClientModal');
    loadAdminData();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function openAddLicenseModal(parentUserId = null) {
  try {
    await loadClientsForLicenseSelect();
    document.getElementById('licenseClientSelect').value = parentUserId || '';
    document.getElementById('licenseCount').value = '1';
    openModal('addLicenseModal');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadClientsForLicenseSelect() {
  const clients = await apiCall('/admin/clients');
  const select = document.getElementById('licenseClientSelect');
  select.innerHTML = '<option value="">Selecione um cliente</option>';
  clients.forEach(client => {
    const label = client.company_name || client.users?.username || 'Cliente';
    select.innerHTML += `<option value="${client.user_id}">${label}</option>`;
  });
}

function formatDate(dateValue) {
  if (!dateValue) return '-';
  return new Date(dateValue).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function showClientDetails(clientId) {
  const content = document.getElementById('clientDetailsContent');
  content.innerHTML = '<p class="license-loading">Carregando detalhes...</p>';
  openModal('clientDetailsModal');

  try {
    const data = await apiCall(`/admin/clients/${clientId}/details`);
    const client = data.client || {};
    const user = data.baseUser || {};
    const licenses = data.licenses || [];
    const applications = data.applications || [];

    content.innerHTML = `
      <div class="client-details-grid">
        <section class="details-section">
          <h3>Informações Gerais</h3>
          <dl class="details-list">
            <div><dt>Empresa</dt><dd>${client.company_name || '-'}</dd></div>
            <div><dt>Nome</dt><dd>${user.full_name || '-'}</dd></div>
            <div><dt>Email</dt><dd>${user.email || '-'}</dd></div>
            <div><dt>Telefone</dt><dd>${client.phone || '-'}</dd></div>
            <div><dt>Endereço</dt><dd>${client.address || '-'}</dd></div>
            <div><dt>Usuário base</dt><dd>${user.username || '-'}</dd></div>
            <div><dt>Cadastro</dt><dd>${formatDate(client.created_at || user.created_at)}</dd></div>
            <div><dt>Total de licenças</dt><dd>${licenses.length}</dd></div>
          </dl>
        </section>

        <section class="details-section">
          <h3>Licenças Adicionais (${licenses.length})</h3>
          ${licenses.length === 0 ? '<p class="license-empty">Nenhuma licença adicional cadastrada.</p>' : `
            <table class="data-table license-subtable">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Criado em</th>
                </tr>
              </thead>
              <tbody>
                ${licenses.map(lic => `
                  <tr>
                    <td>${lic.username}</td>
                    <td>${lic.full_name || '-'}</td>
                    <td>${lic.email || '-'}</td>
                    <td>${formatDate(lic.created_at)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </section>

        <section class="details-section">
          <h3>Aplicativos (${applications.length})</h3>
          ${applications.length === 0 ? '<p class="license-empty">Nenhum aplicativo vinculado.</p>' : `
            <table class="data-table license-subtable">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Android</th>
                  <th>PC</th>
                  <th>Site</th>
                  <th>Criado em</th>
                </tr>
              </thead>
              <tbody>
                ${applications.map(app => `
                  <tr>
                    <td>${app.name}</td>
                    <td>${app.android_version || '-'}</td>
                    <td>${app.pc_version || '-'}</td>
                    <td>${app.website_url ? `<a href="${app.website_url}" target="_blank">Abrir</a>` : '-'}</td>
                    <td>${formatDate(app.created_at)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </section>
      </div>`;
  } catch (error) {
    content.innerHTML = `<p class="license-empty">${error.message}</p>`;
  }
}

async function addLicense(formData) {
  try {
    const result = await apiCall('/admin/child-users', {
      method: 'POST',
      body: JSON.stringify({
        parent_user_id: formData.parent_user_id,
        count: formData.count
      })
    });

    let message = result.message;
    if (result.licenses?.length === 1) {
      message += ` — Usuário: ${result.licenses[0].username}`;
    }

    showToast(message, 'success');
    closeModal('addLicenseModal');
    document.getElementById('addLicenseForm').reset();
    loadAdminData();

    if (expandedLicenseUserId === formData.parent_user_id) {
      loadLicensePanel(formData.parent_user_id);
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteLicense(userId, parentUserId) {
  if (!confirm('Tem certeza que deseja excluir esta licença?')) return;

  try {
    await apiCall(`/admin/child-users/${userId}`, { method: 'DELETE' });
    showToast('Licença excluída com sucesso!', 'success');
    loadAdminData();
    if (parentUserId) {
      loadLicensePanel(parentUserId);
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function editUser(userId) {
  try {
    const users = await apiCall('/admin/users');
    const user = users.find(u => u.id === userId);

    if (user) {
      document.getElementById('editUserId').value = user.id;
      document.getElementById('editUserUsername').value = user.username || '';
      document.getElementById('editUserFullName').value = user.full_name || '';
      document.getElementById('editUserEmail').value = user.email || '';
      document.getElementById('editUserPassword').value = '';

      openModal('editUserModal');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function updateUser(formData) {
  try {
    const updateData = {
      username: formData.username,
      full_name: formData.full_name,
      email: formData.email
    };
    
    if (formData.password) {
      updateData.password = formData.password;
    }

    await apiCall(`/admin/users/${formData.id}`, {
      method: 'PUT',
      body: JSON.stringify(updateData)
    });
    showToast('Usuário atualizado com sucesso!', 'success');
    closeModal('editUserModal');
    loadAdminData();
    if (expandedLicenseUserId) {
      loadLicensePanel(expandedLicenseUserId);
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function addClient(formData) {
  try {
    await apiCall('/admin/users', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    showToast('Cliente adicionado com sucesso!', 'success');
    closeModal('addClientModal');
    document.getElementById('addClientForm').reset();
    loadAdminData();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function addApplication(formData) {
  try {
    const form = new FormData();
    Object.keys(formData).forEach(key => {
      const value = formData[key];
      if (value instanceof File) {
        if (value.size > 0) {
          form.append(key, value);
        }
        return;
      }
      if (value !== undefined && value !== null && value !== '') {
        form.append(key, value);
      }
    });

    const response = await fetch(`${API_BASE}/admin/applications`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: form
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao adicionar aplicativo');
    }

    showToast('Aplicativo adicionado com sucesso!', 'success');
    closeModal('addAppModal');
    document.getElementById('addAppForm').reset();
    loadApplications();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadClientsForSelect() {
  try {
    const clients = await apiCall('/admin/clients');
    const select = document.getElementById('appClientId');
    select.innerHTML = '<option value="">Selecione um cliente</option>';
    clients.forEach(client => {
      select.innerHTML += `<option value="${client.id}">${client.company_name || client.username}</option>`;
    });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ===== Client Dashboard =====
async function loadClientData() {
  try {
    const applications = await apiCall('/client/applications');
    renderClientApps(applications);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderClientApps(applications) {
  const container = document.getElementById('clientApps');
  const noAppsMessage = document.getElementById('noAppsMessage');

  if (applications.length === 0) {
    container.innerHTML = '';
    noAppsMessage.style.display = 'block';
    return;
  }

  noAppsMessage.style.display = 'none';
  container.innerHTML = applications.map(app => {
    const siteUrl = normalizeWebsiteUrl(app.website_url);
    const androidName = app.android_file ? buildDownloadName(app.name, 'android', app.android_file) : '';
    const pcName = app.pc_file ? buildDownloadName(app.name, 'pc', app.pc_file) : '';

    const downloadButtons = [];

    if (app.android_file) {
      downloadButtons.push(`
        <button type="button" class="download-btn" onclick="downloadAppFile('${app.android_file}', '${androidName}')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Baixar Android${app.android_version ? ` (v${app.android_version})` : ''}
        </button>
      `);
    }

    if (app.pc_file) {
      downloadButtons.push(`
        <button type="button" class="download-btn" onclick="downloadAppFile('${app.pc_file}', '${pcName}')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Baixar PC / Desktop${app.pc_version ? ` (v${app.pc_version})` : ''}
        </button>
      `);
    }

    if (siteUrl) {
      downloadButtons.push(`
        <a href="${siteUrl}" target="_blank" rel="noopener noreferrer" class="website-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Acessar Site
        </a>
      `);
    }

    if (downloadButtons.length === 0) {
      downloadButtons.push('<p class="app-no-files">Nenhum arquivo ou site disponível para este aplicativo.</p>');
    }

    return `
    <div class="app-card">
      <div class="app-card-header">
        <div class="app-card-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
            <line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
        </div>
        <h3 class="app-card-title">${app.name}</h3>
      </div>
      <p class="app-card-description">${app.description || 'Sem descrição'}</p>
      <div class="app-card-downloads">
        ${downloadButtons.join('')}
      </div>
    </div>
  `;
  }).join('');
}

// ===== Modal Management =====
function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// ===== Toast Notification =====
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
  window.editClient = editClient;
  window.editUser = editUser;
  window.deleteUser = deleteUser;
  window.deleteApplication = deleteApplication;
  window.openAddLicenseModal = openAddLicenseModal;
  window.toggleLicenses = toggleLicenses;
  window.deleteLicense = deleteLicense;
  window.showClientDetails = showClientDetails;
  window.downloadAppFile = downloadAppFile;

  // Check if user is already logged in
  if (token) {
    try {
      currentUser = JSON.parse(localStorage.getItem('user'));
      if (currentUser) {
        if (currentUser.role === 'admin') {
          showPage('admin');
          document.getElementById('adminUsername').textContent = currentUser.username;
          loadAdminData();
        } else {
          showPage('client');
          document.getElementById('clientUsername').textContent = currentUser.username;
          connectSocket(); // Conectar WebSocket para clientes
          loadClientData();
        }
      }
    } catch (e) {
      logout();
    }
  }

  // Login form
  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    login(formData.get('username'), formData.get('password'));
  });

  // Admin logout
  bindClick('adminLogout', logout);

  // Client logout
  bindClick('clientLogout', logout);

  // Tab navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const tabName = item.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      document.getElementById(`${tabName}Tab`).classList.add('active');
    });
  });

  // Add client modal
  bindClick('addClientBtn', () => {
    openModal('addClientModal');
  });

  // Add application modal
  bindClick('addAppBtn', () => {
    loadClientsForSelect();
    openModal('addAppModal');
  });

  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(btn.closest('.modal').id);
    });
  });

  document.querySelectorAll('.modal-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(btn.closest('.modal').id);
    });
  });

  // Close modal on outside click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
  });

  // Add license modal
  bindClick('addLicenseBtn', () => {
    openAddLicenseModal();
  });
  document.getElementById('addClientForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const clientData = {
      username: formData.get('username'),
      password: formData.get('password'),
      full_name: formData.get('full_name'),
      email: formData.get('email'),
      company_name: formData.get('company_name'),
      phone: formData.get('phone')
    };
    addClient(clientData);
  });

  // Edit client form
  document.getElementById('editClientForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const clientData = {
      id: formData.get('id'),
      company_name: formData.get('company_name'),
      full_name: formData.get('full_name'),
      email: formData.get('email'),
      phone: formData.get('phone')
    };
    updateClient(clientData);
  });

  // Add license form
  document.getElementById('addLicenseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    addLicense({
      parent_user_id: formData.get('parent_user_id'),
      count: formData.get('count')
    });
  });

  // Edit user form
  document.getElementById('editUserForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const userData = {
      id: formData.get('id'),
      username: formData.get('username'),
      full_name: formData.get('full_name'),
      email: formData.get('email'),
      password: formData.get('password')
    };
    updateUser(userData);
  });

  // Add application form
  document.getElementById('addAppForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const appData = {
      client_id: formData.get('client_id'),
      name: formData.get('name'),
      description: formData.get('description'),
      android_version: formData.get('android_version'),
      pc_version: formData.get('pc_version'),
      website_url: formData.get('website_url'),
      android_file: document.getElementById('appAndroidFile').files[0],
      pc_file: document.getElementById('appPcFile').files[0]
    };
    addApplication(appData);
  });

  // Support page navigation
  bindClick('showSupport', (e) => {
    e.preventDefault();
    showPage('support');
  });

  bindClick('backToLogin', (e) => {
    e.preventDefault();
    showPage('login');
  });
});
