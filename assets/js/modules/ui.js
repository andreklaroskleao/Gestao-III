export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

export function renderBlocked() {
  return `
    <div class="card">
      <h2>Acesso restrito</h2>
      <p class="muted">Seu usuário não possui permissão para acessar esta área.</p>
    </div>
  `;
}

export function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 2600);
}

export function labelTab(tab) {
  return {
    dashboard: 'Dashboard',
    sales: 'Vendas',
    products: 'Produtos',
    reports: 'Relatórios',
    deliveries: 'Tele-entregas',
    clients: 'Clientes',
    suppliers: 'Fornecedores',
    purchases: 'Compras',
    payables: 'Contas a pagar',
    users: 'Usuários',
    settings: 'Configurações'
  }[tab] || tab;
}