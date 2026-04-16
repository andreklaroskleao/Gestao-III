import { escapeHtml, renderBlocked, showToast } from './ui.js';

export function createPurchasesModule(ctx) {
  const {
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
  } = ctx;

  let filters = {
    supplier: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  };

  function getRows() {
    return state.purchases || [];
  }

  function getFilteredRows() {
    return getRows().filter((item) => {
      const supplier = String(item.supplierName || '').toLowerCase();
      const status = String(item.status || '');

      const receivedDate = normalizeDate(item.receivedDate || item.receivedAt);

      return (!filters.supplier || supplier.includes(filters.supplier.toLowerCase()))
        && (!filters.status || status === filters.status)
        && (!filters.dateFrom || !receivedDate || receivedDate >= filters.dateFrom)
        && (!filters.dateTo || !receivedDate || receivedDate <= filters.dateTo);
    });
  }

  function normalizeDate(value) {
    if (!value) return '';

    if (typeof value === 'string') {
      if (value.includes('T')) {
        const dt = new Date(value);
        if (!Number.isNaN(dt.getTime())) {
          return formatDateKey(dt);
        }
      }
      return value.slice(0, 10);
    }

    if (value?.toDate) {
      return formatDateKey(value.toDate());
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateKey(parsed);
    }

    return '';
  }

  function formatDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function getSummary() {
    const rows = getRows();
    return {
      total: rows.length,
      received: rows.filter((item) => item.status === 'Recebida').length,
      pending: rows.filter((item) => item.status !== 'Recebida').length,
      totalValue: rows.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0)
    };
  }

  function getEditingPurchase() {
    return getRows().find((item) => item.id === state.editingPurchaseId) || null;
  }

  function fillForm(form, row) {
    if (!form) return;

    form.elements.supplierName.value = row?.supplierName || '';
    form.elements.description.value = row?.description || '';
    form.elements.documentNumber.value = row?.documentNumber || '';
    form.elements.receivedDate.value = row?.receivedDate || normalizeDate(row?.receivedAt) || '';
    form.elements.totalAmount.value = row?.totalAmount ?? '';
    form.elements.paymentCondition.value = row?.paymentCondition || 'À vista';
    form.elements.status.value = row?.status || 'Pendente';
    form.elements.notes.value = row?.notes || '';
  }

  function buildPayablePayload(purchase) {
    return {
      supplierName: purchase.supplierName || '',
      description: purchase.description || 'Compra de fornecedor',
      documentNumber: purchase.documentNumber || '',
      dueDate: purchase.receivedDate || '',
      totalAmount: Number(purchase.totalAmount || 0),
      paidAmount: purchase.paymentCondition === 'À vista' ? Number(purchase.totalAmount || 0) : 0,
      openAmount: purchase.paymentCondition === 'À vista' ? 0 : Number(purchase.totalAmount || 0),
      notes: `Gerado automaticamente a partir da compra ${purchase.documentNumber || purchase.description || ''}`.trim(),
      sourcePurchaseId: purchase.id || '',
      deleted: false
    };
  }

  async function ensurePayableForPurchase(purchase) {
    if (!purchase || purchase.paymentCondition === 'À vista') return;

    const existing = (state.accountsPayable || []).find((item) => item.sourcePurchaseId === purchase.id);
    if (existing) return;

    const payload = buildPayablePayload(purchase);
    const createdId = await createDoc(refs.accountsPayable, payload);

    await auditModule.log({
      module: 'purchases',
      action: 'generate_payable',
      entityType: 'account_payable',
      entityId: createdId,
      entityLabel: payload.description,
      description: 'Conta a pagar gerada a partir da compra.'
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    payload.totalAmount = toNumber(payload.totalAmount);
    payload.deleted = false;

    try {
      if (state.editingPurchaseId) {
        const current = getEditingPurchase();

        await updateByPath('purchases', state.editingPurchaseId, payload);

        await auditModule.log({
          module: 'purchases',
          action: 'update',
          entityType: 'purchase',
          entityId: state.editingPurchaseId,
          entityLabel: payload.description || current?.description || '',
          description: 'Compra atualizada.'
        });

        state.editingPurchaseId = null;
        showToast('Compra atualizada.', 'success');
      } else {
        const createdId = await createDoc(refs.purchases, payload);

        await auditModule.log({
          module: 'purchases',
          action: 'create',
          entityType: 'purchase',
          entityId: createdId,
          entityLabel: payload.description || '',
          description: 'Compra cadastrada.'
        });

        showToast('Compra cadastrada.', 'success');
      }

      form.reset();
      render();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao salvar compra.');
    }
  }

  async function receivePurchase(purchaseId) {
    const row = getRows().find((item) => item.id === purchaseId);
    if (!row) return;

    if (String(row.status || '') === 'Recebida') {
      showToast('Esta compra já foi recebida.', 'info');
      return;
    }

    try {
      await updateByPath('purchases', purchaseId, {
        status: 'Recebida'
      });

      await inventoryModule.createSimpleMovement?.({
        type: 'entrada',
        reason: `Recebimento de compra: ${row.description || row.documentNumber || row.id}`,
        quantity: 0
      });

      await auditModule.log({
        module: 'purchases',
        action: 'receive',
        entityType: 'purchase',
        entityId: purchaseId,
        entityLabel: row.description || '',
        description: 'Compra marcada como recebida.'
      });

      await ensurePayableForPurchase({
        ...row,
        id: purchaseId,
        status: 'Recebida'
      });

      showToast('Compra recebida.', 'success');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao receber compra.');
    }
  }

  function openDetailsModal(purchaseId) {
    const row = getRows().find((item) => item.id === purchaseId);
    if (!row) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="purchase-details-modal-backdrop">
        <div class="modal-card sale-details-modal-card">
          <div class="section-header">
            <h2>Detalhes da compra</h2>
            <button class="btn btn-secondary" type="button" id="purchase-details-modal-close">Fechar</button>
          </div>

          <div class="sale-details-grid">
            <div class="sale-details-box">
              <span>Fornecedor</span>
              <strong>${escapeHtml(row.supplierName || '-')}</strong>
            </div>
            <div class="sale-details-box">
              <span>Status</span>
              <strong>${escapeHtml(row.status || '-')}</strong>
            </div>
            <div class="sale-details-box">
              <span>Data</span>
              <strong>${escapeHtml(row.receivedDate || normalizeDate(row.receivedAt) || '-')}</strong>
            </div>
            <div class="sale-details-box">
              <span>Total</span>
              <strong>${currency(row.totalAmount || 0)}</strong>
            </div>
            <div class="sale-details-box">
              <span>Condição</span>
              <strong>${escapeHtml(row.paymentCondition || '-')}</strong>
            </div>
            <div class="sale-details-box">
              <span>Documento</span>
              <strong>${escapeHtml(row.documentNumber || '-')}</strong>
            </div>
          </div>

          <div class="table-card" style="padding:14px;">
            <div class="section-header">
              <h3>Descrição</h3>
            </div>
            <div class="empty-state" style="padding:14px;">
              ${escapeHtml(row.description || '-')}
            </div>
          </div>

          <div class="table-card" style="padding:14px; margin-top:14px;">
            <div class="section-header">
              <h3>Observações</h3>
            </div>
            <div class="empty-state" style="padding:14px;">
              ${escapeHtml(row.notes || '-')}
            </div>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#purchase-details-modal-close').addEventListener('click', closeModal);
    modalRoot.querySelector('#purchase-details-modal-backdrop').addEventListener('click', (event) => {
      if (event.target.id === 'purchase-details-modal-backdrop') {
        closeModal();
      }
    });
  }

  function renderPurchaseActions(row) {
    return `
      <div class="actions-inline-compact">
        <button
          class="icon-action-btn success"
          type="button"
          data-purchase-receive="${row.id}"
          title="Receber"
          aria-label="Receber"
        >📥</button>

        <button
          class="icon-action-btn info"
          type="button"
          data-purchase-view="${row.id}"
          title="Detalhes"
          aria-label="Detalhes"
        >👁️</button>

        <details class="actions-menu">
          <summary
            class="icon-action-btn"
            title="Mais ações"
            aria-label="Mais ações"
          >⋯</summary>
          <div class="actions-menu-popover">
            <button
              class="btn btn-secondary"
              type="button"
              data-purchase-edit="${row.id}"
            >Editar</button>
          </div>
        </details>
      </div>
    `;
  }

  function bindEvents() {
    const form = tabEls.purchases.querySelector('#purchase-form');
    form.addEventListener('submit', handleSubmit);

    tabEls.purchases.querySelector('#purchase-reset-btn')?.addEventListener('click', () => {
      state.editingPurchaseId = null;
      form.reset();
      render();
    });

    tabEls.purchases.querySelector('#purchase-filter-apply')?.addEventListener('click', () => {
      filters.supplier = tabEls.purchases.querySelector('#purchase-filter-supplier')?.value || '';
      filters.status = tabEls.purchases.querySelector('#purchase-filter-status')?.value || '';
      filters.dateFrom = tabEls.purchases.querySelector('#purchase-filter-date-from')?.value || '';
      filters.dateTo = tabEls.purchases.querySelector('#purchase-filter-date-to')?.value || '';
      render();
    });

    tabEls.purchases.querySelector('#purchase-filter-clear')?.addEventListener('click', () => {
      filters = {
        supplier: '',
        status: '',
        dateFrom: '',
        dateTo: ''
      };
      render();
    });

    tabEls.purchases.querySelectorAll('[data-purchase-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingPurchaseId = btn.dataset.purchaseEdit;
        render();
      });
    });

    tabEls.purchases.querySelectorAll('[data-purchase-receive]').forEach((btn) => {
      btn.addEventListener('click', () => {
        receivePurchase(btn.dataset.purchaseReceive);
      });
    });

    tabEls.purchases.querySelectorAll('[data-purchase-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openDetailsModal(btn.dataset.purchaseView);
      });
    });
  }

  function render() {
    if (!hasPermission(state.currentUser, 'purchases')) {
      tabEls.purchases.innerHTML = renderBlocked();
      return;
    }

    const editing = getEditingPurchase();
    const rows = getFilteredRows();
    const summary = getSummary();

    tabEls.purchases.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card">
            <span>Total de compras</span>
            <strong>${summary.total}</strong>
          </div>
          <div class="metric-card">
            <span>Recebidas</span>
            <strong>${summary.received}</strong>
          </div>
          <div class="metric-card">
            <span>Pendentes</span>
            <strong>${summary.pending}</strong>
          </div>
          <div class="metric-card">
            <span>Valor total</span>
            <strong>${currency(summary.totalValue)}</strong>
          </div>
        </div>

        <div class="users-layout">
          <div class="panel">
            <div class="section-header">
              <h2>${editing ? 'Editar compra' : 'Cadastrar compra'}</h2>
              <span class="muted">${editing ? 'Atualize os dados da compra.' : 'Cadastro e recebimento de compras.'}</span>
            </div>

            <form id="purchase-form" class="form-grid mobile-optimized">
              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>1. Identificação</h3>
                  <span>Fornecedor e documento</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Fornecedor
                    <input name="supplierName" list="purchase-suppliers-datalist" required />
                    <datalist id="purchase-suppliers-datalist">
                      ${(state.suppliers || [])
                        .filter((item) => item.active !== false)
                        .map((item) => `<option value="${escapeHtml(item.name || '')}"></option>`)
                        .join('')}
                    </datalist>
                  </label>

                  <label>Documento
                    <input name="documentNumber" />
                  </label>

                  <label style="grid-column:1 / -1;">Descrição
                    <input name="description" required />
                  </label>
                </div>
              </div>

              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>2. Financeiro</h3>
                  <span>Valor, data e condição</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Data
                    <input name="receivedDate" type="date" required />
                  </label>

                  <label>Total
                    <input name="totalAmount" type="number" step="0.01" min="0" required />
                  </label>

                  <label>Condição de pagamento
                    <select name="paymentCondition">
                      <option value="À vista">À vista</option>
                      <option value="A prazo">A prazo</option>
                    </select>
                  </label>

                  <label>Status
                    <select name="status">
                      <option value="Pendente">Pendente</option>
                      <option value="Recebida">Recebida</option>
                    </select>
                  </label>

                  <label style="grid-column:1 / -1;">Observações
                    <textarea name="notes"></textarea>
                  </label>
                </div>
              </div>

              <div class="form-actions" style="grid-column:1 / -1;">
                <button class="btn btn-primary" type="submit">${editing ? 'Salvar compra' : 'Cadastrar compra'}</button>
                <button class="btn btn-secondary" type="button" id="purchase-reset-btn">Limpar</button>
              </div>
            </form>
          </div>

          <div class="section-stack">
            <div class="table-card">
              <div class="section-header">
                <h2>Compras</h2>
                <span class="muted">${rows.length} resultado(s)</span>
              </div>

              <div class="search-row" style="margin-bottom:14px;">
                <input
                  id="purchase-filter-supplier"
                  placeholder="Fornecedor"
                  value="${escapeHtml(filters.supplier)}"
                />

                <select id="purchase-filter-status">
                  <option value="">Todos os status</option>
                  <option value="Pendente" ${filters.status === 'Pendente' ? 'selected' : ''}>Pendente</option>
                  <option value="Recebida" ${filters.status === 'Recebida' ? 'selected' : ''}>Recebida</option>
                </select>

                <input id="purchase-filter-date-from" type="date" value="${filters.dateFrom}" />
                <input id="purchase-filter-date-to" type="date" value="${filters.dateTo}" />

                <button class="btn btn-secondary" type="button" id="purchase-filter-apply">Filtrar</button>
                <button class="btn btn-secondary" type="button" id="purchase-filter-clear">Limpar</button>
              </div>

              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fornecedor</th>
                      <th>Descrição</th>
                      <th>Data</th>
                      <th>Total</th>
                      <th>Condição</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map((row) => `
                      <tr>
                        <td>${escapeHtml(row.supplierName || '-')}</td>
                        <td>${escapeHtml(row.description || '-')}</td>
                        <td>${escapeHtml(row.receivedDate || normalizeDate(row.receivedAt) || '-')}</td>
                        <td>${currency(row.totalAmount || 0)}</td>
                        <td>${escapeHtml(row.paymentCondition || '-')}</td>
                        <td><span class="tag ${row.status === 'Recebida' ? 'success' : 'warning'}">${escapeHtml(row.status || '-')}</span></td>
                        <td>${renderPurchaseActions(row)}</td>
                      </tr>
                    `).join('') || '<tr><td colspan="7">Nenhuma compra encontrada.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="panel summary-highlight">
              <div class="section-header">
                <h2>Resumo rápido</h2>
                <span class="badge-soft">Compras</span>
              </div>

              <div class="cards-grid" style="grid-template-columns:1fr; gap:12px;">
                <div class="compact-card">
                  <span class="muted">Recebidas</span>
                  <strong>${summary.received}</strong>
                </div>

                <div class="compact-card">
                  <span class="muted">Pendentes</span>
                  <strong>${summary.pending}</strong>
                </div>

                <div class="compact-card">
                  <span class="muted">Valor total</span>
                  <strong>${currency(summary.totalValue)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const form = tabEls.purchases.querySelector('#purchase-form');
    fillForm(form, editing);
    bindEvents();
  }

  return {
    render
  };
}