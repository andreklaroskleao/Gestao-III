import { orderBy } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { initTheme, setTheme, getPreferredTheme } from './modules/theme.js';
import { renderBlocked, showToast } from './modules/ui.js';
import { createPwaModule } from './modules/pwa.js';
import { createDashboardModule } from './modules/dashboard.js';
import { createProductsModule } from './modules/products.js';
import { createSalesModule } from './modules/sales.js';
import { createDeliveriesModule } from './modules/deliveries.js';
import { createReportsModule } from './modules/reports.js';
import { createUsersModule } from './modules/users.js';
import { createSettingsModule } from './modules/settings.js';
import { createInventoryModule } from './modules/inventory.js';
import { createAuditModule } from './modules/audit.js';
import { createClientsModule } from './modules/clients.js';
import { createClientsTabModule } from './modules/clients-tab.js';
import { createExportModule } from './modules/export.js';
import { createPrintModule } from './modules/print.js';
import { createBackupModule } from './modules/backup.js';
import { createExcelModule } from './modules/excel.js';
import { createSuppliersModule } from './modules/suppliers.js';
import { createReceivablesAlertsModule } from './modules/receivables-alerts.js';
import { createPayablesModule } from './modules/payables.js';
import { createPurchasesModule } from './modules/purchases.js';
import { createCashierModule } from './modules/cashier.js';
import { createAccountsModule } from './modules/accounts.js';

import {
  login,
  watchAuth,
  logout,
  createManagedUser,
  updateManagedUser,
  deleteManagedUser,
  listUsers,
  changeCurrentPassword
} from './services/auth.js';

import {
  refs,
  createDoc,
  updateByPath,
  listCollection,
  subscribeCollection
} from './services/db.js';

import {
  ROLES,
  ACCESS_LEVELS,
  AREAS,
  currency,
  toNumber,
  formatDate,
  formatDateTime,
  hasPermission,
  paymentMethods,
  deliveryStatuses,
  canImportBackup,
  timestampFromDateTime
} from './services/utils.js';

const els = {
  loginScreen: document.getElementById('login-screen'),
  appScreen: document.getElementById('app-screen'),
  loginForm: document.getElementById('login-form'),
  logoutBtn: document.getElementById('logout-btn'),
  pageTitle: document.getElementById('page-title'),
  pageSubtitle: document.getElementById('page-subtitle'),
  currentUserName: document.getElementById('current-user-name'),
  storeNameSide: document.getElementById('store-name-side'),
  nav: document.getElementById('main-nav'),
  stockAlertBtn: document.getElementById('stock-alert-btn'),
  stockAlertCount: document.getElementById('stock-alert-count'),
  stockAlertList: document.getElementById('stock-alert-list'),
  alertsPanel: document.getElementById('alerts-panel')
};

const tabEls = {
  dashboard: document.getElementById('tab-dashboard'),
  sales: document.getElementById('tab-sales'),
  products: document.getElementById('tab-products'),
  reports: document.getElementById('tab-reports'),
  deliveries: document.getElementById('tab-deliveries'),
  clients: document.getElementById('tab-clients'),
  suppliers: document.getElementById('tab-suppliers'),
  purchases: document.getElementById('tab-purchases'),
  payables: document.getElementById('tab-payables'),
  users: document.getElementById('tab-users'),
  settings: document.getElementById('tab-settings')
};

const state = {
  currentUser: null,
  activeTab: 'dashboard',
  users: [],
  products: [],
  sales: [],
  deliveries: [],
  clients: [],
  suppliers: [],
  inventoryMovements: [],
  auditLogs: [],
  cashSessions: [],
  accountsReceivable: [],
  accountsPayable: [],
  purchaseOrders: [],
  purchases: [],
  cart: [],
  editingProductId: null,
  editingUserId: null,
  editingDeliveryId: null,
  editingClientId: null,
  editingSupplierId: null,
  unsubscribe: [],
  settings: {
    storeName: 'Minha Loja',
    address: 'Endereço da loja',
    lowStockThreshold: 5,
    warrantyText: 'Garantia conforme política interna da loja.',
    thermalWidth: '80mm',
    thermalCompactMode: false,
    thermalAutoPrint: false
  }
};

initTheme();

const auditModule = createAuditModule({
  state,
  refs,
  createDoc,
  formatDateTime
});

const inventoryModule = createInventoryModule({
  state,
  refs,
  createDoc,
  updateByPath,
  toNumber,
  currency,
  formatDateTime,
  auditModule
});

const printModule = createPrintModule({ state });

const backupModule = createBackupModule({
  state,
  refs,
  createDoc,
  updateByPath,
  auditModule
});

const excelModule = createExcelModule({
  state,
  refs,
  createDoc,
  updateByPath,
  auditModule
});

const exportModule = createExportModule({ state });

const clientsModule = createClientsModule({
  state,
  refs,
  createDoc,
  updateByPath,
  auditModule
});

const payablesModule = createPayablesModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  formatDateTime,
  hasPermission,
  auditModule
});

const purchasesModule = createPurchasesModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  hasPermission,
  inventoryModule,
  payablesModule,
  auditModule
});

const accountsModule = createAccountsModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  formatDateTime,
  hasPermission,
  clientsModule,
  auditModule
});

const receivablesAlertsModule = createReceivablesAlertsModule({ state });

const dashboardModule = createDashboardModule({
  state,
  tabEls,
  currency,
  formatDate,
  formatDateTime
});

const productsModule = createProductsModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  inventoryModule,
  auditModule
});

const salesModule = createSalesModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  formatDateTime,
  paymentMethods,
  clientsModule,
  printModule
});

const deliveriesModule = createDeliveriesModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  formatDate,
  paymentMethods,
  deliveryStatuses,
  timestampFromDateTime,
  clientsModule
});

const reportsModule = createReportsModule({
  state,
  tabEls,
  exportModule
});

const usersModule = createUsersModule({
  state,
  tabEls,
  ROLES,
  AREAS,
  ACCESS_LEVELS,
  createManagedUser,
  updateManagedUser,
  deleteManagedUser,
  listUsers,
  auditModule
});

const suppliersModule = createSuppliersModule({
  state,
  tabEls,
  refs,
  createDoc,
  updateByPath,
  hasPermission,
  auditModule
});

const cashierModule = createCashierModule({
  state,
  refs,
  createDoc,
  updateByPath,
  currency,
  toNumber,
  formatDateTime,
  auditModule
});

const settingsModule = createSettingsModule({
  state,
  tabEls,
  listCollection,
  createDoc,
  updateByPath,
  refs,
  changeCurrentPassword,
  setTheme,
  getPreferredTheme,
  auditModule,
  cashierModule,
  backupModule,
  printModule,
  excelModule,
  canImportBackup
});

const clientsTabModule = createClientsTabModule({
  state,
  tabEls,
  clientsModule,
  accountsModule,
  hasPermission
});

const pwaModule = createPwaModule();
pwaModule.registerServiceWorker();
pwaModule.bindInstallPrompt();

function setScreen(isAuthenticated) {
  els.loginScreen.classList.toggle('active', !isAuthenticated);
  els.appScreen.classList.toggle('active', isAuthenticated);
}

function activateTab(tab) {
  state.activeTab = tab;

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.remove('active');
  });

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });

  tabEls[tab]?.classList.add('active');

  const titleMap = {
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
  };

  els.pageTitle.textContent = titleMap[tab] || 'Sistema';
  els.pageSubtitle.textContent = `Área: ${titleMap[tab] || tab}.`;

  renderActiveTab();
}

function renderBlockedPanel(tab) {
  if (tabEls[tab]) {
    tabEls[tab].innerHTML = renderBlocked();
  }
}

function refreshNavigationPermissions() {
  document.querySelectorAll('.nav-item').forEach((item) => {
    const allowed = hasPermission(state.currentUser, item.dataset.tab);
    item.disabled = !allowed;
    item.style.opacity = allowed ? '1' : '.45';
  });
}

function renderDashboard() {
  hasPermission(state.currentUser, 'dashboard') ? dashboardModule.render() : renderBlockedPanel('dashboard');
}

function renderProducts() {
  hasPermission(state.currentUser, 'products') ? productsModule.render() : renderBlockedPanel('products');
}

function renderSales() {
  hasPermission(state.currentUser, 'sales') ? salesModule.render() : renderBlockedPanel('sales');
}

function renderReports() {
  hasPermission(state.currentUser, 'reports') ? reportsModule.render() : renderBlockedPanel('reports');
}

function renderDeliveries() {
  hasPermission(state.currentUser, 'deliveries') ? deliveriesModule.render() : renderBlockedPanel('deliveries');
}

function renderClients() {
  hasPermission(state.currentUser, 'clients') ? clientsTabModule.render() : renderBlockedPanel('clients');
}

function renderSuppliers() {
  hasPermission(state.currentUser, 'suppliers') ? suppliersModule.render() : renderBlockedPanel('suppliers');
}

function renderPurchases() {
  hasPermission(state.currentUser, 'purchases') ? purchasesModule.render() : renderBlockedPanel('purchases');
}

function renderPayables() {
  hasPermission(state.currentUser, 'payables') ? payablesModule.render() : renderBlockedPanel('payables');
}

function renderUsers() {
  hasPermission(state.currentUser, 'users') ? usersModule.render() : renderBlockedPanel('users');
}

function renderSettings() {
  hasPermission(state.currentUser, 'settings') ? settingsModule.render() : renderBlockedPanel('settings');
}

function renderActiveTab() {
  ({
    dashboard: renderDashboard,
    sales: renderSales,
    products: renderProducts,
    reports: renderReports,
    deliveries: renderDeliveries,
    clients: renderClients,
    suppliers: renderSuppliers,
    purchases: renderPurchases,
    payables: renderPayables,
    users: renderUsers,
    settings: renderSettings
  }[state.activeTab] || renderDashboard)();
}

function renderApp() {
  renderDashboard();
  renderProducts();
  renderSales();
  renderReports();
  renderDeliveries();
  renderClients();
  renderSuppliers();
  renderPurchases();
  renderPayables();
  renderUsers();
  renderSettings();
  renderStockAlerts();
  refreshNavigationPermissions();
}

function renderStockAlerts() {
  const lowStock = dashboardModule.getLowStockProducts();
  const receivablesSummary = receivablesAlertsModule.getNotificationSummary();

  const payableItems = (state.accountsPayable || [])
    .filter((item) => Number(item.openAmount || 0) > 0 && item.dueDate)
    .map((item) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const due = new Date(`${item.dueDate}T00:00:00`);
      const diff = Math.round((due.getTime() - today.getTime()) / 86400000);

      if (diff < 0) {
        return {
          title: `Conta a pagar vencida há ${Math.abs(diff)} dia(s)`,
          supplierName: item.supplierName || 'Fornecedor',
          dueDate: item.dueDate,
          amount: Number(item.openAmount || 0)
        };
      }

      if (diff === 0) {
        return {
          title: 'Conta a pagar vence hoje',
          supplierName: item.supplierName || 'Fornecedor',
          dueDate: item.dueDate,
          amount: Number(item.openAmount || 0)
        };
      }

      if (diff <= 3) {
        return {
          title: `Conta a pagar vence em ${diff} dia(s)`,
          supplierName: item.supplierName || 'Fornecedor',
          dueDate: item.dueDate,
          amount: Number(item.openAmount || 0)
        };
      }

      return null;
    })
    .filter(Boolean);

  const totalAlerts = lowStock.length + receivablesSummary.total + payableItems.length;
  els.stockAlertCount.textContent = String(totalAlerts);

  const stockHtml = lowStock.map((item) => `
    <div class="alert-item">
      <strong>${item.name}</strong>
      <span>Estoque atual: ${item.quantity}</span>
    </div>
  `).join('');

  const receivablesHtml = receivablesSummary.items.map((item) => `
    <div class="alert-item">
      <strong>${item.clientName}</strong>
      <span>${item.title} · Vencimento: ${item.dueDate} · Valor: ${Number(item.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
    </div>
  `).join('');

  const payablesHtml = payableItems.map((item) => `
    <div class="alert-item">
      <strong>${item.supplierName}</strong>
      <span>${item.title} · Vencimento: ${item.dueDate} · Valor: ${Number(item.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
    </div>
  `).join('');

  els.stockAlertList.innerHTML = (stockHtml + receivablesHtml + payablesHtml)
    || '<div class="empty-state">Sem alertas no momento.</div>';
}

function bootstrapData() {
  state.unsubscribe.forEach((unsubscribe) => unsubscribe());
  state.unsubscribe = [];

  state.unsubscribe.push(subscribeCollection('users', [orderBy('fullName')], (rows) => {
    state.users = rows;
    renderUsers();
    renderDashboard();
  }));

  state.unsubscribe.push(subscribeCollection('products', [orderBy('name')], (rows) => {
    state.products = rows.filter((item) => item.deleted !== true);
    renderProducts();
    renderSales();
    renderReports();
    renderDashboard();
    renderStockAlerts();
  }));

  state.unsubscribe.push(subscribeCollection('sales', [orderBy('createdAt', 'desc')], (rows) => {
    state.sales = rows;
    renderSales();
    renderReports();
    renderDashboard();
  }));

  state.unsubscribe.push(subscribeCollection('deliveries', [orderBy('scheduledAt', 'desc')], (rows) => {
    state.deliveries = rows;
    renderDeliveries();
    renderDashboard();
  }));

  state.unsubscribe.push(subscribeCollection('settings', [orderBy('createdAt', 'desc')], (rows) => {
    const current = rows.find((item) => item.scope === 'system');
    if (current) {
      state.settings = { ...state.settings, ...current };
    }

    els.storeNameSide.textContent = state.settings.storeName || 'Gestão Comercial';
    renderSettings();
    renderDashboard();
    renderStockAlerts();
  }));

  state.unsubscribe.push(subscribeCollection('inventory_movements', [orderBy('createdAt', 'desc')], (rows) => {
    state.inventoryMovements = rows;
    renderProducts();
  }));

  state.unsubscribe.push(subscribeCollection('audit_logs', [orderBy('createdAt', 'desc')], (rows) => {
    state.auditLogs = rows;
    renderSettings();
  }));

  state.unsubscribe.push(subscribeCollection('clients', [orderBy('name')], (rows) => {
    state.clients = rows;
    renderSales();
    renderDeliveries();
    renderClients();
    renderReports();
  }));

  state.unsubscribe.push(subscribeCollection('suppliers', [orderBy('name')], (rows) => {
    state.suppliers = rows;
    renderSuppliers();
    renderProducts();
    renderPayables();
    renderPurchases();
  }));

  state.unsubscribe.push(subscribeCollection('cash_sessions', [orderBy('openedAt', 'desc')], (rows) => {
    state.cashSessions = rows;
    renderSettings();
    renderDashboard();
  }));

  state.unsubscribe.push(subscribeCollection('accounts_receivable', [orderBy('createdAt', 'desc')], (rows) => {
    state.accountsReceivable = rows;
    renderClients();
    renderDashboard();
    renderStockAlerts();
  }));

  state.unsubscribe.push(subscribeCollection('accounts_payable', [orderBy('createdAt', 'desc')], (rows) => {
    state.accountsPayable = rows;
    renderPayables();
    renderDashboard();
    renderStockAlerts();
  }));

  state.unsubscribe.push(subscribeCollection('purchase_orders', [orderBy('createdAt', 'desc')], (rows) => {
    state.purchaseOrders = rows;
    renderPurchases();
  }));

  state.unsubscribe.push(subscribeCollection('purchases', [orderBy('receivedAt', 'desc')], (rows) => {
    state.purchases = rows;
    renderPurchases();
  }));
}

async function handleLogin(event) {
  event.preventDefault();

  const values = Object.fromEntries(new FormData(els.loginForm).entries());

  try {
    const result = await login(values.email, values.password);
    state.currentUser = {
      ...result.profile,
      uid: result.user.uid,
      email: result.user.email
    };
    showToast('Login realizado com sucesso.', 'success');
  } catch (error) {
    alert(error.message || 'Erro ao entrar.');
  }
}

els.loginForm.addEventListener('submit', handleLogin);

els.logoutBtn.addEventListener('click', async () => {
  await logout();
  state.currentUser = null;
  setScreen(false);
});

els.nav.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-tab]');
  if (!btn) return;

  const tab = btn.dataset.tab;

  if (!hasPermission(state.currentUser, tab)) {
    showToast('Acesso não permitido.', 'error');
    return;
  }

  activateTab(tab);
});

els.stockAlertBtn.addEventListener('click', () => {
  els.alertsPanel.classList.toggle('hidden');
});

document.addEventListener('click', (event) => {
  if (!els.alertsPanel.contains(event.target) && !els.stockAlertBtn.contains(event.target)) {
    els.alertsPanel.classList.add('hidden');
  }
});

watchAuth(async (user) => {
  state.currentUser = user;

  if (!user) {
    setScreen(false);
    return;
  }

  els.currentUserName.textContent = `${user.fullName || ''} · ${user.accessLevel || 'standard'}`;
  els.storeNameSide.textContent = state.settings.storeName || 'Gestão Comercial';

  setScreen(true);
  bootstrapData();
  renderApp();
  activateTab('dashboard');
});