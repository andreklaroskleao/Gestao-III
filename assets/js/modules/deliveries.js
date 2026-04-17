import { escapeHtml, showToast } from './ui.js';

export function createDeliveriesModule(ctx) {
  const {
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
  } = ctx;

  let filters = {
    status: '',
    customer: '',
    phone: '',
    period: ''
  };

  function getEditingDelivery() {
    return (state.deliveries || []).find((item) => item.id === state.editingDeliveryId) || null;
  }

  function getFilteredDeliveries() {
    const rows = state.deliveries || [];

    return rows.filter((item) => {
      const customer = String(item.customerName || '').toLowerCase();
      const phone = String(item.phone || '').toLowerCase();
      const status = String(item.status || '');
      const scheduledDate = normalizeScheduledDate(item.scheduledAt);

      if (filters.status && status !== filters.status) return false;
      if (filters.customer && !customer.includes(filters.customer.toLowerCase())) return false;
      if (filters.phone && !phone.includes(filters.phone.toLowerCase())) return false;

      if (filters.period === 'today') {
        const today = new Date();
        const todayKey = formatDateKey(today);
        if (scheduledDate !== todayKey) return false;
      }

      if (filters.period === 'pending') {
        if (status === 'Concluído' || status === 'Cancelado') return false;
      }

      return true;
    });
  }

  function normalizeScheduledDate(value) {
    if (!value) return '';

    if (value?.toDate) {
      return formatDateKey(value.toDate());
    }

    if (typeof value === 'string') {
      if (value.includes('T')) {
        const dt = new Date(value);
        if (!Number.isNaN(dt.getTime())) return formatDateKey(dt);
      }
      return value.slice(0, 10);
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateKey(parsed);
    }

    return '';
  }

  function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getDeliverySummary() {
    const rows = state.deliveries || [];

    const todayKey = formatDateKey(new Date());
    const todayCount = rows.filter((item) => normalizeScheduledDate(item.scheduledAt) === todayKey).length;
    const pendingCount = rows.filter((item) => !['Concluído', 'Cancelado'].includes(item.status)).length;
    const completedCount = rows.filter((item) => item.status === 'Concluído').length;
    const totalValue = rows.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);

    return {
      totalCount: rows.length,
      todayCount,
      pendingCount,
      completedCount,
      totalValue
    };
  }

  function fillForm(form, delivery) {
    if (!form) return;

    form.elements.customerName.value = delivery?.customerName || '';
    form.elements.phone.value = delivery?.phone || '';
    form.elements.address.value = delivery?.address || '';
    form.elements.reference.value = delivery?.reference || '';
    form.elements.notes.value = delivery?.notes || '';
    form.elements.paymentMethod.value = delivery?.paymentMethod || paymentMethods[0] || 'Dinheiro';
    form.elements.status.value = delivery?.status || 'Agendado';
    form.elements.totalAmount.value = delivery?.totalAmount ?? '';
    form.elements.scheduledDate.value = delivery?.scheduledDate || normalizeScheduledDate(delivery?.scheduledAt) || '';
    form.elements.scheduledTime.value = delivery?.scheduledTime || '';

    const clientIdInput = form.querySelector('#delivery-client-id');
    const clientSelectedInput = form.querySelector('#delivery-client-selected');

    if (clientIdInput) {
      clientIdInput.value = delivery?.clientId || '';
    }

    if (clientSelectedInput) {
      clientSelectedInput.value = delivery?.clientId
        ? `${delivery.customerName || ''}${delivery.phone ? ` - ${delivery.phone}` : ''}`
        : '';
    }
  }

  function getStatusTagClass(status) {
    if (status === 'Concluído') return 'success';
    if (status === 'Cancelado') return 'danger';
    if (status === 'Em rota') return 'info';
    return 'warning';
  }

  async function handleDeliverySubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    payload.totalAmount = toNumber(payload.totalAmount);
    payload.scheduledAt = payload.scheduledDate
      ? timestampFromDateTime(payload.scheduledDate, payload.scheduledTime || '00:00')
      : null;

    const selectedClientId = form.querySelector('#delivery-client-id')?.value || '';
    payload.clientId = selectedClientId || '';
    payload.scheduledDate = payload.scheduledDate || '';
    payload.scheduledTime = payload.scheduledTime || '';
    payload.deleted = false;

    delete payload.customerSearch;

    if (state.editingDeliveryId) {
      await updateByPath('deliveries', state.editingDeliveryId, payload);
      state.editingDeliveryId = null;
      showToast('Entrega atualizada.', 'success');
    } else {
      await createDoc(refs.deliveries, payload);
      showToast('Entrega agendada.', 'success');
    }

    form.reset();
    render();
  }

  async function updateDeliveryStatus(deliveryId, nextStatus) {
    const delivery = (state.deliveries || []).find((item) => item.id === deliveryId);
    if (!delivery) return;

    await updateByPath('deliveries', deliveryId, {
      status: nextStatus
    });

    showToast(`Status alterado para ${nextStatus}.`, 'success');
  }

  function openDeliveryActions(deliveryId) {
    window.openActionsSheet?.('Ações da entrega', [
      {
        label: 'Iniciar',
        className: 'btn btn-secondary',
        onClick: async () => updateDeliveryStatus(deliveryId, 'Em rota')
      },
      {
        label: 'Concluir',
        className: 'btn btn-success',
        onClick: async () => updateDeliveryStatus(deliveryId, 'Concluído')
      },
      {
        label: 'Cancelar',
        className: 'btn btn-danger',
        onClick: async () => updateDeliveryStatus(deliveryId, 'Cancelado')
      },
      {
        label: 'Reagendar',
        className: 'btn btn-secondary',
        onClick: async () => updateDeliveryStatus(deliveryId, 'Reagendado')
      }
    ]);
  }

  function renderDeliveryActions(item) {
    const status = String(item.status || '');

    let primaryAction = '';

    if (status === 'Agendado' || status === 'Reagendado') {
      primaryAction = `
        <button
          class="icon-action-btn info"
          type="button"
          data-delivery-status="${item.id}:Em rota"
          title="Iniciar"
          aria-label="Iniciar"
        >▶️</button>
      `;
    } else if (status === 'Em rota') {
      primaryAction = `
        <button
          class="icon-action-btn success"
          type="button"
          data-delivery-status="${item.id}:Concluído"
          title="Concluir"
          aria-label="Concluir"
        >✅</button>
      `;
    }

    return `
      <div class="actions-inline-compact">
        ${primaryAction}

        <button
          class="icon-action-btn"
          type="button"
          data-delivery-edit="${item.id}"
          title="Editar"
          aria-label="Editar"
        >✏️</button>

        <button
          class="icon-action-btn"
          type="button"
          data-delivery-more="${item.id}"
          title="Mais ações"
          aria-label="Mais ações"
        >⋯</button>
      </div>
    `;
  }

  function bindTableActions() {
    tabEls.deliveries.querySelectorAll('[data-delivery-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingDeliveryId = btn.dataset.deliveryEdit;
        render();
      });
    });

    tabEls.deliveries.querySelectorAll('[data-delivery-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const [id, nextStatus] = btn.dataset.deliveryStatus.split(':');
        await updateDeliveryStatus(id, nextStatus);
      });
    });

    tabEls.deliveries.querySelectorAll('[data-delivery-more]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openDeliveryActions(btn.dataset.deliveryMore);
      });
    });
  }

  function bindFilterActions() {
    tabEls.deliveries.querySelector('#delivery-filter-apply')?.addEventListener('click', () => {
      filters.status = tabEls.deliveries.querySelector('#delivery-filter-status')?.value || '';
      filters.customer = tabEls.deliveries.querySelector('#delivery-filter-customer')?.value || '';
      filters.phone = tabEls.deliveries.querySelector('#delivery-filter-phone')?.value || '';
      filters.period = tabEls.deliveries.querySelector('#delivery-filter-period')?.value || '';
      render();
    });

    tabEls.deliveries.querySelector('#delivery-filter-clear')?.addEventListener('click', () => {
      filters = {
        status: '',
        customer: '',
        phone: '',
        period: ''
      };
      render();
    });
  }

  function bindClientPicker() {
    const pickBtn = tabEls.deliveries.querySelector('#delivery-client-picker-btn');
    const clearBtn = tabEls.deliveries.querySelector('#delivery-client-clear-btn');

    pickBtn?.addEventListener('click', () => {
      const modalRoot = document.getElementById('modal-root');
      if (!modalRoot) return;

      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="delivery-client-modal-backdrop">
          <div class="modal-card">
            <div class="section-header">
              <h2>Selecionar cliente</h2>
              <button class="btn btn-secondary" type="button" id="delivery-client-modal-close">Fechar</button>
            </div>
            <div id="delivery-client-picker-host"></div>
          </div>
        </div>
      `;

      const closeModal = () => {
        modalRoot.innerHTML = '';
      };

      modalRoot.querySelector('#delivery-client-modal-close').addEventListener('click', closeModal);
      modalRoot.querySelector('#delivery-client-modal-backdrop').addEventListener('click', (event) => {
        if (event.target.id === 'delivery-client-modal-backdrop') {
          closeModal();
        }
      });

      clientsModule.renderClientPicker({
        target: '#delivery-client-picker-host',
        onSelect: (client) => {
          const form = tabEls.deliveries.querySelector('#delivery-form');
          if (!form) return;

          form.querySelector('#delivery-client-id').value = client.id || '';
          form.querySelector('#delivery-client-selected').value = `${client.name || ''}${client.phone ? ` - ${client.phone}` : ''}`;
          form.elements.customerName.value = client.name || '';
          form.elements.phone.value = client.phone || '';
          form.elements.address.value = client.address || '';
          closeModal();
        }
      });
    });

    clearBtn?.addEventListener('click', () => {
      const form = tabEls.deliveries.querySelector('#delivery-form');
      if (!form) return;

      form.querySelector('#delivery-client-id').value = '';
      form.querySelector('#delivery-client-selected').value = '';
    });
  }

  function bindFormActions() {
    const form = tabEls.deliveries.querySelector('#delivery-form');
    if (!form) return;

    form.addEventListener('submit', handleDeliverySubmit);

    tabEls.deliveries.querySelector('#delivery-reset-btn')?.addEventListener('click', () => {
      state.editingDeliveryId = null;
      render();
    });
  }

  function bindEvents() {
    bindFormActions();
    bindFilterActions();
    bindClientPicker();
    bindTableActions();
  }

  function render() {
    const editing = getEditingDelivery();
    const rows = getFilteredDeliveries();
    const summary = getDeliverySummary();

    tabEls.deliveries.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card">
            <span>Hoje</span>
            <strong>${summary.todayCount}</strong>
          </div>
          <div class="metric-card">
            <span>Pendentes</span>
            <strong>${summary.pendingCount}</strong>
          </div>
          <div class="metric-card">
            <span>Concluídos</span>
            <strong>${summary.completedCount}</strong>
          </div>
          <div class="metric-card">
            <span>Total em entregas</span>
            <strong>${currency(summary.totalValue)}</strong>
          </div>
        </div>

        <div class="deliveries-layout">
          <div class="panel">
            <div class="section-header">
              <h2>${editing ? 'Editar tele-entrega / recolhimento' : 'Agendar tele-entrega / recolhimento'}</h2>
              <span class="muted">Cadastro rápido e organizado</span>
            </div>

            <form id="delivery-form" class="form-grid mobile-optimized">
              <input type="hidden" id="delivery-client-id" value="${escapeHtml(editing?.clientId || '')}" />

              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>1. Cliente</h3>
                  <span>Seleção e identificação</span>
                </div>
                <div class="soft-divider"></div>

                <label style="grid-column:1 / -1;">Cliente selecionado
                  <input id="delivery-client-selected" readonly placeholder="Nenhum cliente selecionado" value="${editing?.clientId ? escapeHtml(`${editing.customerName || ''}${editing.phone ? ` - ${editing.phone}` : ''}`) : ''}" />
                </label>

                <div class="form-actions" style="grid-column:1 / -1;">
                  <button class="btn btn-secondary" type="button" id="delivery-client-picker-btn">Selecionar cliente</button>
                  <button class="btn btn-secondary" type="button" id="delivery-client-clear-btn">Limpar cliente</button>
                </div>

                <div class="form-grid">
                  <label>Nome do cliente<input name="customerName" required /></label>
                  <label>Telefone<input name="phone" /></label>
                </div>
              </div>

              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>2. Endereço e observações</h3>
                  <span>Local e referência</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Endereço<input name="address" required /></label>
                  <label>Referência<input name="reference" /></label>
                  <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>
                </div>
              </div>

              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>3. Agendamento</h3>
                  <span>Valor, pagamento e status</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Data<input name="scheduledDate" type="date" required /></label>
                  <label>Hora<input name="scheduledTime" type="time" /></label>
                  <label>Forma de pagamento
                    <select name="paymentMethod">
                      ${paymentMethods.map((item) => `<option value="${item}">${item}</option>`).join('')}
                    </select>
                  </label>
                  <label>Status
                    <select name="status">
                      ${deliveryStatuses.map((item) => `<option value="${item}">${item}</option>`).join('')}
                    </select>
                  </label>
                  <label>Total
                    <input name="totalAmount" type="number" step="0.01" min="0" />
                  </label>
                </div>
              </div>

              <div class="form-actions" style="grid-column:1 / -1;">
                <button class="btn btn-primary" type="submit">${editing ? 'Salvar alterações' : 'Agendar operação'}</button>
                <button class="btn btn-secondary" type="button" id="delivery-reset-btn">Limpar</button>
              </div>
            </form>
          </div>

          <div class="section-stack">
            <div class="table-card">
              <div class="section-header">
                <h2>Agenda</h2>
                <span class="muted">${rows.length} resultado(s)</span>
              </div>

              <div class="search-row" style="margin-bottom:14px;">
                <select id="delivery-filter-status">
                  <option value="">Todos os status</option>
                  ${deliveryStatuses.map((item) => `<option value="${item}" ${filters.status === item ? 'selected' : ''}>${item}</option>`).join('')}
                </select>

                <input id="delivery-filter-customer" placeholder="Cliente" value="${escapeHtml(filters.customer)}" />
                <input id="delivery-filter-phone" placeholder="Telefone" value="${escapeHtml(filters.phone)}" />

                <select id="delivery-filter-period">
                  <option value="">Todos os períodos</option>
                  <option value="today" ${filters.period === 'today' ? 'selected' : ''}>Hoje</option>
                  <option value="pending" ${filters.period === 'pending' ? 'selected' : ''}>Pendentes</option>
                </select>

                <button class="btn btn-secondary" type="button" id="delivery-filter-apply">Filtrar</button>
                <button class="btn btn-secondary" type="button" id="delivery-filter-clear">Limpar filtros</button>
              </div>

              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Cliente</th>
                      <th>Telefone</th>
                      <th>Status</th>
                      <th>Valor</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map((item) => `
                      <tr>
                        <td>${item.scheduledAt ? formatDate(item.scheduledAt) : '-'}</td>
                        <td>${escapeHtml(item.customerName || '-')}</td>
                        <td>${escapeHtml(item.phone || '-')}</td>
                        <td><span class="tag ${getStatusTagClass(item.status)}">${escapeHtml(item.status || '-')}</span></td>
                        <td>${currency(item.totalAmount || 0)}</td>
                        <td>${renderDeliveryActions(item)}</td>
                      </tr>
                    `).join('') || '<tr><td colspan="6">Nenhuma operação encontrada.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="panel summary-highlight">
              <div class="section-header">
                <h2>Visão rápida</h2>
                <span class="badge-soft">Operação</span>
              </div>

              <div class="cards-grid" style="grid-template-columns:1fr; gap:12px;">
                <div class="compact-card">
                  <span class="muted">Pendentes</span>
                  <strong>${summary.pendingCount}</strong>
                </div>

                <div class="compact-card">
                  <span class="muted">Concluídos</span>
                  <strong>${summary.completedCount}</strong>
                </div>

                <div class="compact-card">
                  <span class="muted">Hoje</span>
                  <strong>${summary.todayCount}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const form = tabEls.deliveries.querySelector('#delivery-form');
    fillForm(form, editing);
    bindEvents();
  }

  return {
    render
  };
}