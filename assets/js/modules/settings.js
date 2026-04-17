import { escapeHtml } from './ui.js';

export function createSettingsModule(ctx) {
  const {
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
  } = ctx;

  let auditFilters = {
    module: '',
    action: '',
    entityType: '',
    entityLabel: '',
    user: '',
    dateFrom: '',
    dateTo: ''
  };

  let shouldShowAuditLogs = false;

  async function handleSettingsSubmit(event) {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    payload.lowStockThreshold = Number(payload.lowStockThreshold || 5);
    payload.thermalCompactMode = payload.thermalCompactMode === 'true';
    payload.thermalAutoPrint = payload.thermalAutoPrint === 'true';

    const chosenTheme = payload.theme || 'system';
    setTheme(chosenTheme);
    delete payload.theme;

    const existing = (await listCollection('settings')).find((item) => item.scope === 'system');

    if (existing) {
      await updateByPath('settings', existing.id, {
        ...payload,
        scope: 'system'
      });

      await auditModule.log({
        module: 'settings',
        action: 'update',
        entityType: 'settings',
        entityId: existing.id,
        entityLabel: 'Configurações gerais',
        description: 'Configurações gerais atualizadas.'
      });
    } else {
      const createdId = await createDoc(refs.settings, {
        ...payload,
        scope: 'system'
      });

      await auditModule.log({
        module: 'settings',
        action: 'create',
        entityType: 'settings',
        entityId: createdId,
        entityLabel: 'Configurações gerais',
        description: 'Configurações gerais criadas.'
      });
    }

    alert('Configurações salvas com sucesso.');
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const currentPassword = String(formData.get('currentPassword') || '');
    const newPassword = String(formData.get('newPassword') || '');

    await changeCurrentPassword(currentPassword, newPassword);

    await auditModule.log({
      module: 'settings',
      action: 'password_change',
      entityType: 'user',
      entityId: state.currentUser?.uid || '',
      entityLabel: state.currentUser?.fullName || '',
      description: 'Senha do usuário alterada.'
    });

    event.currentTarget.reset();
    alert('Senha atualizada com sucesso.');
  }

  function bindAuditFilters() {
    tabEls.settings.querySelector('#audit-filter-apply')?.addEventListener('click', () => {
      auditFilters.module = tabEls.settings.querySelector('#audit-filter-module')?.value || '';
      auditFilters.action = tabEls.settings.querySelector('#audit-filter-action')?.value || '';
      auditFilters.entityType = tabEls.settings.querySelector('#audit-filter-entity-type')?.value || '';
      auditFilters.entityLabel = tabEls.settings.querySelector('#audit-filter-entity-label')?.value || '';
      auditFilters.user = tabEls.settings.querySelector('#audit-filter-user')?.value || '';
      auditFilters.dateFrom = tabEls.settings.querySelector('#audit-filter-date-from')?.value || '';
      auditFilters.dateTo = tabEls.settings.querySelector('#audit-filter-date-to')?.value || '';

      shouldShowAuditLogs = true;
      render();
    });

    tabEls.settings.querySelector('#audit-filter-clear')?.addEventListener('click', () => {
      auditFilters = {
        module: '',
        action: '',
        entityType: '',
        entityLabel: '',
        user: '',
        dateFrom: '',
        dateTo: ''
      };

      shouldShowAuditLogs = false;
      render();
    });
  }

  function bindBackupEvents() {
    tabEls.settings.querySelector('#backup-export-btn')?.addEventListener('click', () => {
      backupModule.downloadBackup();
    });

    tabEls.settings.querySelector('#backup-import-btn')?.addEventListener('click', async () => {
      if (!canImportBackup(state.currentUser)) {
        alert('Somente o usuário master pode importar backup.');
        return;
      }

      const input = tabEls.settings.querySelector('#backup-import-file');
      const file = input?.files?.[0];

      if (!file) {
        alert('Selecione um arquivo de backup em JSON.');
        return;
      }

      try {
        await backupModule.importBackupFile(file);
        input.value = '';
      } catch (error) {
        alert(error.message || 'Erro ao importar backup.');
      }
    });
  }

  function bindExcelEvents() {
    tabEls.settings.querySelector('#excel-export-btn')?.addEventListener('click', () => {
      excelModule.exportAllExcel();
    });

    tabEls.settings.querySelector('#excel-import-btn')?.addEventListener('click', async () => {
      if (!canImportBackup(state.currentUser)) {
        alert('Somente o usuário master pode importar Excel.');
        return;
      }

      const input = tabEls.settings.querySelector('#excel-import-file');
      const file = input?.files?.[0];

      if (!file) {
        alert('Selecione um arquivo Excel.');
        return;
      }

      try {
        await excelModule.importExcelFile(file);
        input.value = '';
      } catch (error) {
        alert(error.message || 'Erro ao importar Excel.');
      }
    });
  }

  function bindPrintEvents() {
    tabEls.settings.querySelector('#thermal-test-print-btn')?.addEventListener('click', () => {
      printModule.printSaleReceipt({
        customerName: 'Cliente teste',
        paymentMethod: 'Dinheiro',
        subtotal: 50,
        discount: 5,
        total: 45,
        amountPaid: 50,
        change: 5,
        items: [
          { productId: '1', name: 'Produto teste 1', quantity: 1, unitPrice: 20, total: 20 },
          { productId: '2', name: 'Produto teste 2', quantity: 1, unitPrice: 30, total: 30 }
        ]
      });
    });
  }

  function bindEvents() {
    tabEls.settings.querySelector('#settings-form')?.addEventListener('submit', handleSettingsSubmit);
    tabEls.settings.querySelector('#password-form')?.addEventListener('submit', handlePasswordSubmit);

    bindAuditFilters();
    bindBackupEvents();
    bindExcelEvents();
    bindPrintEvents();

    cashierModule.bindCashEvents(render);
  }

  function renderFinancialSummary() {
    const accounts = state.accountsReceivable || [];
    const cashSessions = state.cashSessions || [];

    const totalOpen = accounts.reduce((sum, item) => sum + Number(item.openAmount || 0), 0);
    const totalReceived = accounts.reduce((sum, item) => sum + Number(item.receivedAmount || 0), 0);

    const overdueCount = accounts.filter((item) => {
      if (!item.dueDate || Number(item.openAmount || 0) <= 0) {
        return false;
      }

      const due = new Date(`${item.dueDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return due < today;
    }).length;

    const latestCash = [...cashSessions].sort((a, b) => {
      const da = a.openedAt?.toDate ? a.openedAt.toDate().getTime() : new Date(a.openedAt || 0).getTime();
      const db = b.openedAt?.toDate ? b.openedAt.toDate().getTime() : new Date(b.openedAt || 0).getTime();
      return db - da;
    })[0];

    return `
      <div class="cards-grid" style="margin:16px 0;">
        <div class="metric-card">
          <span>Contas em aberto</span>
          <strong>${totalOpen.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
        </div>
        <div class="metric-card">
          <span>Total já recebido</span>
          <strong>${totalReceived.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
        </div>
        <div class="metric-card">
          <span>Contas vencidas</span>
          <strong>${overdueCount}</strong>
        </div>
        <div class="metric-card">
          <span>Último fechamento</span>
          <strong>${latestCash ? (latestCash.closingAmount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'}</strong>
        </div>
      </div>
    `;
  }

  function render() {
    const selectedTheme = getPreferredTheme();
    const thermalWidth = state.settings?.thermalWidth || '80mm';
    const thermalCompactMode = Boolean(state.settings?.thermalCompactMode);
    const thermalAutoPrint = Boolean(state.settings?.thermalAutoPrint);

    tabEls.settings.innerHTML = `
      <div class="section-stack">
        <div class="users-layout">
          <div class="panel">
            <div class="section-header">
              <h2>Geral</h2>
              <span class="muted">Ajustes principais do sistema</span>
            </div>

            <form id="settings-form" class="form-grid">
              <label>Nome da loja
                <input name="storeName" value="${escapeHtml(state.settings.storeName || '')}" />
              </label>

              <label>Endereço
                <input name="address" value="${escapeHtml(state.settings.address || '')}" />
              </label>

              <label>Limite de estoque baixo
                <input name="lowStockThreshold" type="number" min="1" value="${Number(state.settings.lowStockThreshold || 5)}" />
              </label>

              <label>Tema do sistema
                <select name="theme">
                  <option value="system" ${selectedTheme === 'system' ? 'selected' : ''}>Automático</option>
                  <option value="light" ${selectedTheme === 'light' ? 'selected' : ''}>Claro</option>
                  <option value="dark" ${selectedTheme === 'dark' ? 'selected' : ''}>Escuro</option>
                </select>
              </label>

              <label>Largura térmica
                <select name="thermalWidth">
                  <option value="58mm" ${thermalWidth === '58mm' ? 'selected' : ''}>58mm</option>
                  <option value="80mm" ${thermalWidth === '80mm' ? 'selected' : ''}>80mm</option>
                </select>
              </label>

              <label>Modo compacto
                <select name="thermalCompactMode">
                  <option value="true" ${thermalCompactMode ? 'selected' : ''}>Ativado</option>
                  <option value="false" ${!thermalCompactMode ? 'selected' : ''}>Desativado</option>
                </select>
              </label>

              <label>Imprimir automaticamente
                <select name="thermalAutoPrint">
                  <option value="true" ${thermalAutoPrint ? 'selected' : ''}>Ativado</option>
                  <option value="false" ${!thermalAutoPrint ? 'selected' : ''}>Desativado</option>
                </select>
              </label>

              <label style="grid-column:1 / -1;">Texto de garantia
                <textarea name="warrantyText">${escapeHtml(state.settings.warrantyText || '')}</textarea>
              </label>

              <div class="form-actions" style="grid-column:1 / -1;">
                <button class="btn btn-primary" type="submit">Salvar configurações</button>
                <button class="btn btn-secondary" type="button" id="thermal-test-print-btn">Teste térmico</button>
              </div>
            </form>
          </div>

          <div class="section-stack">
            <div class="panel">
              <div class="section-header">
                <h2>Segurança</h2>
                <span class="muted">Troca de senha da sessão atual</span>
              </div>

              <form id="password-form" class="form-grid">
                <label>Senha atual
                  <input type="password" name="currentPassword" required />
                </label>

                <label>Nova senha
                  <input type="password" name="newPassword" required />
                </label>

                <div class="form-actions" style="grid-column:1 / -1;">
                  <button class="btn btn-primary" type="submit">Trocar senha</button>
                </div>
              </form>

              <div class="auth-hint" style="margin-top:12px;">
                Usuários inativos não conseguem entrar. As permissões são conferidas tanto na interface quanto nas regras do Firestore.
              </div>
            </div>

            <div class="panel">
              <div class="section-header">
                <h2>Backup e importação</h2>
                <span class="muted">JSON e Excel</span>
              </div>

              <div class="section-stack">
                <div class="card">
                  <h3>Backup JSON</h3>
                  <p class="muted">Exportar a base em JSON.</p>
                  <div class="form-actions">
                    <button class="btn btn-secondary" type="button" id="backup-export-btn">Exportar backup</button>
                  </div>
                </div>

                <div class="card">
                  <h3>Importação JSON</h3>
                  <p class="muted">Restaurar dados por arquivo JSON.</p>
                  <input id="backup-import-file" type="file" accept=".json" />
                  <div class="form-actions" style="margin-top:10px;">
                    <button class="btn btn-secondary" type="button" id="backup-import-btn">Importar backup</button>
                  </div>
                </div>

                <div class="card">
                  <h3>Exportação Excel</h3>
                  <p class="muted">Exportar planilhas em um único arquivo.</p>
                  <div class="form-actions">
                    <button class="btn btn-secondary" type="button" id="excel-export-btn">Exportar Excel</button>
                  </div>
                </div>

                <div class="card">
                  <h3>Importação Excel</h3>
                  <p class="muted">Importar produtos, clientes e contas.</p>
                  <input id="excel-import-file" type="file" accept=".xlsx,.xls" />
                  <div class="form-actions" style="margin-top:10px;">
                    <button class="btn btn-secondary" type="button" id="excel-import-btn">Importar Excel</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        ${renderFinancialSummary()}

        <div class="section-stack">
          ${cashierModule.renderCashSessionPanel()}
          ${cashierModule.renderHistoryTable()}
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Auditoria</h2>
            <span class="muted">Aplique filtros para exibir os logs</span>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <input id="audit-filter-module" placeholder="Módulo" value="${escapeHtml(auditFilters.module)}" />
            <input id="audit-filter-action" placeholder="Ação" value="${escapeHtml(auditFilters.action)}" />
            <input id="audit-filter-entity-type" placeholder="Tipo de entidade" value="${escapeHtml(auditFilters.entityType)}" />
            <input id="audit-filter-entity-label" placeholder="Registro" value="${escapeHtml(auditFilters.entityLabel)}" />
            <input id="audit-filter-user" placeholder="Usuário" value="${escapeHtml(auditFilters.user)}" />
            <input id="audit-filter-date-from" type="date" value="${auditFilters.dateFrom}" />
            <input id="audit-filter-date-to" type="date" value="${auditFilters.dateTo}" />
            <button class="btn btn-secondary" type="button" id="audit-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="audit-filter-clear">Limpar</button>
          </div>

          ${auditModule.renderAuditTable(auditFilters, shouldShowAuditLogs)}
        </div>
      </div>
    `;

    bindEvents();
  }

  return { render };
}