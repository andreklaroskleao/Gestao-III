import { escapeHtml } from './ui.js';

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

  let deliveryFilters = {
    date: '',
    status: '',
    client: '',
    phone: '',
    mode: ''
  };

  function getTodayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function getDeliveryDateValue(item) {
    if (item.date) return item.date;

    const rawDate = item.scheduledAt?.toDate
      ? item.scheduledAt.toDate()
      : (item.scheduledAt ? new Date(item.scheduledAt) : null);

    if (!rawDate || Number.isNaN(rawDate.getTime())) return '';

    return `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, '0')}-${String(rawDate.getDate()).padStart(2, '0')}`;
  }

  function isPendingStatus(status) {
    return ['Agendado', 'Em rota', 'Reagendado', 'Recolhimento'].includes(status);
  }

  function getFilteredDeliveries() {
    return (state.deliveries || []).filter((item) => {
      const dateValue = getDeliveryDateValue(item);
      const clientValue = String(item.clientName || '').toLowerCase();
      const phoneValue = String(item.phone || '').toLowerCase();
      const statusValue = String(item.status || '');

      const matchDate = !deliveryFilters.date || dateValue === deliveryFilters.date;
      const matchStatus = !deliveryFilters.status || statusValue === deliveryFilters.status;
      const matchClient = !deliveryFilters.client || clientValue.includes(deliveryFilters.client.toLowerCase());
      const matchPhone = !deliveryFilters.phone || phoneValue.includes(deliveryFilters.phone.toLowerCase());

      let matchMode = true;
      if (deliveryFilters.mode === 'today') {
        matchMode = dateValue === getTodayString();
      }
      if (deliveryFilters.mode === 'pending') {
        matchMode = isPendingStatus(statusValue);
      }

      return matchDate && matchStatus && matchClient && matchPhone && matchMode;
    });
  }

  function deliveryStatusClass(status) {
    if (status === 'Concluído') return 'success';
    if (status === 'Cancelado') return 'danger';
    if (status === 'Reagendado') return 'warning';
    return 'info';
  }

  function getSummary(filteredDeliveries) {
    const total = filteredDeliveries.length;
    const pending = filteredDeliveries.filter((item) => isPendingStatus(item.status)).length;
    const today = filteredDeliveries.filter((item) => getDeliveryDateValue(item) === getTodayString()).length;
    const concluded = filteredDeliveries.filter((item) => item.status === 'Concluído').length;

    return { total, pending, today, concluded };
  }

  async function handleDeliverySubmit(event) {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.clientId = tabEls.deliveries.querySelector('#delivery-client-id')?.value || '';
    data.amount = toNumber(data.amount);
    data.scheduledAt = timestampFromDateTime(data.date, data.time);
    data.assignedUserId = state.currentUser.uid;
    data.assignedUserName = state.currentUser.fullName;

    if (state.editingDeliveryId) {
      await updateByPath('deliveries', state.editingDeliveryId, data);
      state.editingDeliveryId = null;
    } else {
      await createDoc(refs.deliveries, data);
    }

    event.currentTarget.reset();
    render();
  }

  function fillEditingForm(form) {
    if (!state.editingDeliveryId) return;

    const editing = (state.deliveries || []).find((item) => item.id === state.editingDeliveryId);
    if (!editing) return;

    form.elements.clientName.value = editing.clientName || '';
    form.elements.phone.value = editing.phone || '';
    form.elements.address.value = editing.address || '';
    form.elements.amount.value = editing.amount || 0;
    form.elements.paymentMethod.value = editing.paymentMethod || paymentMethods[0];
    form.elements.date.value = editing.date || '';
    form.elements.time.value = editing.time || '';
    form.elements.status.value = editing.status || deliveryStatuses[0];
    form.elements.description.value = editing.description || '';
    form.elements.notes.value = editing.notes || '';

    tabEls.deliveries.querySelector('#delivery-client-id').value = editing.clientId || '';
    tabEls.deliveries.querySelector('#delivery-client-selected').value = editing.clientName || '';
  }

  function applyFiltersFromScreen() {
    deliveryFilters.date = tabEls.deliveries.querySelector('#delivery-filter-date')?.value || '';
    deliveryFilters.status = tabEls.deliveries.querySelector('#delivery-filter-status')?.value || '';
    deliveryFilters.client = tabEls.deliveries.querySelector('#delivery-filter-client')?.value || '';
    deliveryFilters.phone = tabEls.deliveries.querySelector('#delivery-filter-phone')?.value || '';
    render();
  }

  function clearFilters() {
    deliveryFilters = {
      date: '',
      status: '',
      client: '',
      phone: '',
      mode: ''
    };
    render();
  }

  function bindEvents() {
    const form = tabEls.deliveries.querySelector('#delivery-form');
    form.addEventListener('submit', handleDeliverySubmit);

    tabEls.deliveries.querySelector('#delivery-reset-btn').addEventListener('click', () => {
      state.editingDeliveryId = null;
      render();
    });

    tabEls.deliveries.querySelector('#delivery-filter-apply').addEventListener('click', () => {
      deliveryFilters.mode = '';
      applyFiltersFromScreen();
    });

    tabEls.deliveries.querySelector('#delivery-filter-clear').addEventListener('click', clearFilters);

    tabEls.deliveries.querySelector('#delivery-filter-today').addEventListener('click', () => {
      deliveryFilters.mode = 'today';
      deliveryFilters.date = getTodayString();
      render();
    });

    tabEls.deliveries.querySelector('#delivery-filter-pending').addEventListener('click', () => {
      deliveryFilters.mode = 'pending';
      render();
    });

    tabEls.deliveries.querySelectorAll('[data-delivery-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingDeliveryId = btn.dataset.deliveryEdit;
        render();
      });
    });

    tabEls.deliveries.querySelectorAll('[data-delivery-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const [id, status] = btn.dataset.deliveryStatus.split(':');
        await updateByPath('deliveries', id, { status });
      });
    });

    tabEls.deliveries.querySelector('#delivery-client-picker-btn')?.addEventListener('click', () => {
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
          tabEls.deliveries.querySelector('#delivery-client-id').value = client.id;
          tabEls.deliveries.querySelector('#delivery-client-selected').value = `${client.name} - ${client.phone || ''}`;
          tabEls.deliveries.querySelector('input[name="clientName"]').value = client.name || '';
          tabEls.deliveries.querySelector('input[name="phone"]').value = client.phone || '';
          tabEls.deliveries.querySelector('input[name="address"]').value = client.address || '';
          closeModal();
        }
      });
    });

    tabEls.deliveries.querySelector('#delivery-client-clear-btn')?.addEventListener('click', () => {
      tabEls.deliveries.querySelector('#delivery-client-id').value = '';
      tabEls.deliveries.querySelector('#delivery-client-selected').value = '';
    });
  }

  function render() {
    const filteredDeliveries = getFilteredDeliveries();
    const summary = getSummary(filteredDeliveries);

    tabEls.deliveries.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card">
            <span>Total filtrado</span>
            <strong>${summary.total}</strong>
          </div>
          <div class="metric-card">
            <span>Pendentes</span>
            <strong>${summary.pending}</strong>
          </div>
          <div class="metric-card">
            <span>Hoje</span>
            <strong>${summary.today}</strong>
          </div>
          <div class="metric-card">
            <span>Concluídos</span>
            <strong>${summary.concluded}</strong>
          </div>
        </div>

        <div class="users-layout">
          <div class="panel">
            <div class="section-header">
              <h2>${state.editingDeliveryId ? 'Editar atendimento' : 'Agendar tele-entrega / recolhimento'}</h2>
              <span class="muted">${state.editingDeliveryId ? 'Atualize os dados do atendimento.' : 'Cadastro organizado para operação rápida.'}</span>
            </div>

            <form id="delivery-form" class="form-grid mobile-optimized">
              <input type="hidden" id="delivery-client-id" value="" />

              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>1. Cliente</h3>
                  <span>Seleção e identificação</span>
                </div>
                <div class="soft-divider"></div>

                <label style="grid-column:1 / -1;">Cliente selecionado
                  <input id="delivery-client-selected" value="" placeholder="Nenhum cliente selecionado" readonly />
                </label>

                <div class="form-actions" style="grid-column:1 / -1; justify-content:flex-start;">
                  <button class="btn btn-secondary" type="button" id="delivery-client-picker-btn">Selecionar cliente</button>
                  <button class="btn btn-secondary" type="button" id="delivery-client-clear-btn">Limpar cliente</button>
                </div>

                <div class="form-grid">
                  <label>Nome do cliente<input name="clientName" required /></label>
                  <label>Telefone<input name="phone" required /></label>
                  <label style="grid-column:1 / -1;">Endereço<input name="address" required /></label>
                </div>
              </div>

              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>2. Agendamento</h3>
                  <span>Data, hora e status</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Data<input name="date" type="date" required /></label>
                  <label>Hora<input name="time" type="time" required /></label>
                  <label>Status
                    <select name="status">
                      ${deliveryStatuses.map((item) => `<option value="${item}">${item}</option>`).join('')}
                    </select>
                  </label>
                  <label>Forma de pagamento
                    <select name="paymentMethod">
                      ${paymentMethods.map((item) => `<option value="${item}">${item}</option>`).join('')}
                    </select>
                  </label>
                </div>
              </div>

              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>3. Atendimento</h3>
                  <span>Descrição e valor</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Valor cobrado<input name="amount" type="number" step="0.01" min="0" value="0" /></label>
                  <label style="grid-column:1 / -1;">Descrição<textarea name="description" required></textarea></label>
                  <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>
                </div>
              </div>

              <div class="form-actions" style="grid-column:1 / -1;">
                <button class="btn btn-primary" type="submit">${state.editingDeliveryId ? 'Salvar' : 'Criar agendamento'}</button>
                <button class="btn btn-secondary" id="delivery-reset-btn" type="button">Limpar</button>
              </div>
            </form>
          </div>

          <div class="section-stack">
            <div class="table-card">
              <div class="section-header">
                <h2>Agenda</h2>
                <span class="muted">${filteredDeliveries.length} resultado(s)</span>
              </div>

              <div class="search-row" style="margin-bottom:14px; flex-wrap:wrap;">
                <input id="delivery-filter-date" type="date" value="${deliveryFilters.date || ''}" />
                <select id="delivery-filter-status">
                  <option value="">Todos os status</option>
                  ${deliveryStatuses.map((item) => `<option value="${item}" ${deliveryFilters.status === item ? 'selected' : ''}>${item}</option>`).join('')}
                </select>
                <input id="delivery-filter-client" placeholder="Cliente" value="${escapeHtml(deliveryFilters.client || '')}" />
                <input id="delivery-filter-phone" placeholder="Telefone" value="${escapeHtml(deliveryFilters.phone || '')}" />
                <button class="btn btn-secondary" type="button" id="delivery-filter-apply">Filtrar</button>
                <button class="btn btn-secondary" type="button" id="delivery-filter-today">Hoje</button>
                <button class="btn btn-secondary" type="button" id="delivery-filter-pending">Pendentes</button>
                <button class="btn btn-secondary" type="button" id="delivery-filter-clear">Limpar filtros</button>
              </div>

              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Data</th>
                      <th>Telefone</th>
                      <th>Status</th>
                      <th>Valor</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filteredDeliveries.map((item) => `
                      <tr>
                        <td>${escapeHtml(item.clientName)}</td>
                        <td>${formatDate(item.scheduledAt)} ${item.time || ''}</td>
                        <td>${escapeHtml(item.phone)}</td>
                        <td><span class="tag ${deliveryStatusClass(item.status)}">${item.status}</span></td>
                        <td>${currency(item.amount)}</td>
                        <td>
                          <div class="clean-table-actions">
                            <button class="btn btn-secondary" type="button" data-delivery-edit="${item.id}">Editar</button>
                            <button class="btn btn-success" type="button" data-delivery-status="${item.id}:Concluído">Concluir</button>
                            <button class="btn btn-danger" type="button" data-delivery-status="${item.id}:Cancelado">Cancelar</button>
                            <button class="btn btn-secondary" type="button" data-delivery-status="${item.id}:Em rota">Iniciar</button>
                            <button class="btn btn-secondary" type="button" data-delivery-status="${item.id}:Reagendado">Reagendar</button>
                          </div>
                        </td>
                      </tr>
                    `).join('') || '<tr><td colspan="6">Nenhum atendimento encontrado.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="card summary-highlight">
              <div class="section-header">
                <h3>Visão rápida</h3>
                <span class="badge-soft">Operação</span>
              </div>

              <div class="kpi-inline">
                <div class="compact-card">
                  <span class="muted">Pendentes</span>
                  <strong>${summary.pending}</strong>
                </div>
                <div class="compact-card">
                  <span class="muted">Hoje</span>
                  <strong>${summary.today}</strong>
                </div>
                <div class="compact-card">
                  <span class="muted">Concluídos</span>
                  <strong>${summary.concluded}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const form = tabEls.deliveries.querySelector('#delivery-form');
    fillEditingForm(form);
    bindEvents();
  }

  return {
    render
  };
}