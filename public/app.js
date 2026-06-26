// ===== API Configuration =====
const API_BASE = '/api';

// ===== State Management =====
let currentUser = null;
let token = localStorage.getItem('token');
let socket = null;

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
    showToast('Novo aplicativo disponivel!', 'success');
    loadClientData();
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
  forgotPassword: document.getElementById('forgotPasswordPage'),
  resetPassword: document.getElementById('resetPasswordPage'),
  admin: document.getElementById('adminDashboard'),
  client: document.getElementById('clientDashboard')
};

// ===== Navigation =====
function showPage(pageName) {
  Object.values(pages).forEach(page => page.classList.remove('active'));
  pages[pageName].classList.add('active');
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
      connectSocket();
      loadClientData();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ===== Password Recovery =====
async function requestPasswordReset(contact) {
  try {
    const response = await fetch(`${API_BASE}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao solicitar recupera├º├úo de senha');
    }

    showToast(data.message, 'success');
    showPage('resetPassword');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function resetPassword(code, newPassword, confirmPassword) {
  if (newPassword !== confirmPassword) {
    showToast('As senhas n├úo coincidem', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        new_password: newPassword,
        confirm_password: confirmPassword
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao redefinir senha');
    }

    showToast('Senha redefinida com sucesso!', 'success');
    showPage('login');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function logout() {
  disconnectSocket();
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
    throw new Error(data.error || 'Erro na requisicao');
  }

  return data;
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
    const users = await apiCall('/admin/users');
    renderUsersTable(users);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderClientsTable(clients) {
  const tbody = document.getElementById('clientsTableBody');
  tbody.innerHTML = clients.map(client => `
    <tr>
      <td>${client.company_name || '-'}</td>
      <td>${client.full_name || '-'}</td>
      <td>${client.email || '-'}</td>
      <td>${client.phone || '-'}</td>
      <td>${client.username}</td>
      <td>${client.licenses || 1} / ${client.licenses_used || 0}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-sm btn-primary" onclick="editClient(${client.id})">Editar</button>
          <button class="btn btn-sm btn-success" onclick="openAddChildUserModal(${client.user_id})">+ Licenca</button>
          <button class="btn btn-sm btn-danger" onclick="deleteUser(${client.user_id})">Excluir</button>
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
      <td>${app.website_url ? `<a href="${app.website_url}" target="_blank">Link</a>` : '-'}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-sm btn-danger" onclick="deleteApplication(${app.id})">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = users.map(user => `
    <tr>
      <td>${user.username}</td>
      <td>${user.full_name || '-'}</td>
      <td>${user.email || '-'}</td>
      <td><span class="nav-badge">${user.role === 'admin' ? 'Admin' : 'Cliente'}</span></td>
      <td>${user.is_child ? 'Sim' : 'Nao'}</td>
      <td>${new Date(user.created_at).toLocaleDateString('pt-BR')}</td>
      <td>
        <div class="action-buttons">
          ${user.role !== 'admin' ? `
            <button class="btn btn-sm btn-primary" onclick="editUser(${user.id})">Editar</button>
            ${user.is_child ? `<button class="btn btn-sm btn-danger" onclick="deleteChildUser(${user.id})">Excluir</button>` : `<button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">Excluir</button>`}
          ` : '-'}
        </div>
      </td>
    </tr>
  `).join('');
}

async function deleteUser(userId) {
  if (!confirm('Tem certeza que deseja excluir este usuario?')) return;

  try {
    await apiCall(`/admin/users/${userId}`, { method: 'DELETE' });
    showToast('Usuario excluido com sucesso!', 'success');
    loadAdminData();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteApplication(appId) {
  if (!confirm('Tem certeza que deseja excluir este aplicativo?')) return;

  try {
    await apiCall(`/admin/applications/${appId}`, { method: 'DELETE' });
    showToast('Aplicativo exclu├¡do com sucesso!', 'success');
    loadApplications();
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

async function editClient(clientId) {
  try {
    const clients = await apiCall('/admin/clients');
    const client = clients.find(c => c.id === clientId);
    
    if (client) {
      document.getElementById('editClientId').value = client.id;
      document.getElementById('editClientCompanyName').value = client.company_name || '';
      document.getElementById('editClientPhone').value = client.phone || '';
      document.getElementById('editClientLicenses').value = client.licenses || 1;
      
      openModal('editClientModal');
    }
  } catch (error) {
    showToast(error.message, 'error');
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
    const data = { ...formData };
    if (!data.password) delete data.password;
    
    await apiCall(`/admin/users/${formData.id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    showToast('Usu├írio atualizado com sucesso!', 'success');
    closeModal('editUserModal');
    loadAdminData();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function openAddChildUserModal(parentUserId) {
  document.getElementById('childParentUserId').value = parentUserId;
  document.getElementById('childUsername').value = '';
  document.getElementById('childPassword').value = '';
  document.getElementById('childFullName').value = '';
  document.getElementById('childEmail').value = '';
  
  openModal('addChildUserModal');
}

async function addChildUser(formData) {
  try {
    await apiCall('/admin/child-users', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    showToast('Usuario filho criado com sucesso!', 'success');
    closeModal('addChildUserModal');
    document.getElementById('addChildUserForm').reset();
    loadAdminData();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteChildUser(childUserId) {
  if (!confirm('Tem certeza que deseja excluir este usuario filho?')) return;

  try {
    await apiCall(`/admin/child-users/${childUserId}`, { method: 'DELETE' });
    showToast('Usuario filho excluido com sucesso!', 'success');
    loadAdminData();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ===== Expose functions to global scope for inline event handlers =====
window.editClient = editClient;
window.editUser = editUser;
window.deleteUser = deleteUser;
window.deleteApplication = deleteApplication;
window.openAddChildUserModal = openAddChildUserModal;
window.addChildUser = addChildUser;
window.deleteChildUser = deleteChildUser;

async function addApplication(formData) {
  try {
    const form = new FormData();
    Object.keys(formData).forEach(key => {
      if (formData[key] instanceof File) {
        form.append(key, formData[key]);
      } else {
        form.append(key, formData[key]);
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
  container.innerHTML = applications.map(app => `
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
      <p class="app-card-description">${app.description || 'Sem descri├º├úo'}</p>
      <div class="app-card-downloads">
        ${app.android_file ? `
          <a href="${API_BASE}/download/${app.android_file}" class="download-btn" download>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Android (v${app.android_version || 'N/A'})
          </a>
        ` : `
          <button class="download-btn disabled" disabled>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Android n├úo dispon├¡vel
          </button>
        `}
        ${app.pc_file ? `
          <a href="${API_BASE}/download/${app.pc_file}" class="download-btn" download>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download PC (v${app.pc_version || 'N/A'})
          </a>
        ` : `
          <button class="download-btn disabled" disabled>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            PC n├úo dispon├¡vel
          </button>
        `}
        ${app.website_url ? `
          <a href="${app.website_url}" target="_blank" class="website-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Acessar Site
          </a>
        ` : `
          <button class="website-link disabled" disabled>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Site n├úo dispon├¡vel
          </button>
        `}
      </div>
    </div>
  `).join('');
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
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
          connectSocket();
          loadClientData();
        }
      }
    } catch (e) {
      logout();
    }
  }

  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    login(formData.get('username'), formData.get('password'));
  });

  document.getElementById('showForgotPassword').addEventListener('click', (e) => {
    e.preventDefault();
    showPage('forgotPassword');
  });

  document.getElementById('showLoginFromForgot').addEventListener('click', (e) => {
    e.preventDefault();
    showPage('login');
  });

  document.getElementById('showLoginFromReset').addEventListener('click', (e) => {
    e.preventDefault();
    showPage('login');
  });

  document.getElementById('forgotPasswordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    requestPasswordReset(formData.get('contact'));
  });

  document.getElementById('resetPasswordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    resetPassword(
      formData.get('code'),
      formData.get('new_password'),
      formData.get('confirm_password')
    );
  });

  document.getElementById('adminLogout').addEventListener('click', logout);
  document.getElementById('clientLogout').addEventListener('click', logout);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const tabName = item.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      document.getElementById(`${tabName}Tab`).classList.add('active');
    });
  });

  document.getElementById('addClientBtn').addEventListener('click', () => {
    openModal('addClientModal');
  });

  document.getElementById('addAppBtn').addEventListener('click', () => {
    loadClientsForSelect();
    openModal('addAppModal');
  });

  document.getElementById('addClientForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    addClient(Object.fromEntries(formData));
  });

  document.getElementById('editClientForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    updateClient(Object.fromEntries(formData));
  });

  document.getElementById('editUserForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    updateUser(Object.fromEntries(formData));
  });

  document.getElementById('addChildUserForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    addChildUser(Object.fromEntries(formData));
  });

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

  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
  });
});
