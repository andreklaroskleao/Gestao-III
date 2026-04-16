import { escapeHtml, renderBlocked } from './ui.js';

export function createClientsTabModule(ctx) {
  const {
    state,
    tabEls,
    clientsModule,
    accountsModule,
    hasPermission
  } = ctx;

  let filters = {
    term: '',
    status: ''
  };

  function getFilteredClients() {
    return (state.clients || []).filter((client) => {
      const haystack = [client.name, client.phone, client.email, client.address].join(' ').toLowerCase();
      const activeStatus = client.active === false ? 'inativo' : 'ativo';

      return (!filters.term || haystack.includes(filters.term.toLowerCase()))
        && (!filters.status || activeStatus === filters.status);
    });
  }

  function fillForm(form, client) {
    form.elements.name.value = client?.name || '';
    form.elements.phone.value = client?.phone || '';
    form.elements.address.value = client?.address || '';
    form.elements.email.value = client?.email || '';
    form.elements.notes.value = client?.notes || '';
    form.elements.active.value = String(client?.active !== false);
  }

  function renderHistory(clientId) {
    const historyHost = tabEls.clients.querySelector('#client-history-host');
    if (!historyHost) return;

    historyHost.innerHTML = clientsModule.renderClientHistory(clientId);
  }

  function bindEvents() {
    const form = tabEls.clients.querySelector('#client-form');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const payload = Object.fromEntries(new FormData(form).entries());
      payload.active = payload.active === 'true';

      if (state.editingClientId) {
        await clientsModule.updateClient(state.editingClientId, payload);
        state.editingClientId = null;
      } else {
        await clientsModule.createClient(payload);
      }

      form.reset();
      render();
    });

    tabEls.clients.querySelector('#client-reset-btn').addEventListener('click', () => {
      state.editingClientId = null;
      form.reset();
      render();
    });

    tabEls.clients.querySelector('#client-filter-apply').addEventListener('click', () => {
      filters.term = tabEls.clients.querySelector('#client-filter-term').value || '';
      filters.status = tabEls.clients.querySelector('#client-filter-status').value || '';
      render();
    });

    tabEls.clients.querySelector('#client-filter-clear').addEventListener('click', () => {
      filters = {
        term: '',
        status: ''
      };
      render();
    });

    tabEls.clients.querySelectorAll('[data-client-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingClientId = btn.dataset.clientEdit;
        render();
      });
    });

    tabEls.clients.querySelectorAll('[data-client-inactivate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await clientsModule.inactivateClient(btn.dataset.clientInactivate);
      });
    });

    tabEls.clients.querySelectorAll('[data-client-history]').forEach((btn) => {
      btn.addEventListener('click', () => {
        renderHistory(btn.dataset.clientHistory);
      });
    });
  }

  function render() {
    if (!hasPermission(state.currentUser, 'clients')) {
      tabEls.clients.innerHTML = renderBlocked();
      return;
    }

    const editing = (state.clients || []).find((item) => item.id === state.editingClientId) || null;
    const rows = getFilteredClients();
    const activeCount = (state.clients || []).filter((item) => item.active !== false).length;
    const inactiveCount = (state.clients || []).filter((item) => item.active === false).length;

    tabEls.clients.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card">
            <span>Total de clientes</span>
            <strong>${(state.clients || []).length}</strong>
          </div>
          <div class="metric-card">
            <span>Ativos</span>
            <strong>${activeCount}</strong>
          </div>
          <div class="metric-card">
            <span>Inativos</span>
            <strong>${inactiveCount}</strong>
          </div>
          <div class="metric-card">
            <span>Filtrados</span>
            <strong>${rows.length}</strong>
          </div>
        </div>

        <div class="users-layout">
          <div class="panel">
            <div class="section-header">
              <h2>${editing ? 'Editar cliente' : 'Cadastrar cliente'}</h2>
              <span class="muted">${editing ? 'Atualize os dados do cliente.' : 'Cadastro rápido e organizado.'}</span>
            </div>

            <form id="client-form" class="form-grid">
              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>1. Identificação</h3>
                  <span>Dados principais</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Nome<input name="name" required /></label>
                  <label>Telefone<input name="phone" /></label>
                  <label>Endereço<input name="address" /></label>
                  <label>E-mail<input name="email" type="email" /></label>
                  <label>Status
                    <select name="active">
                      <option value="true">Ativo</option>
                      <option value="false">Inativo</option>
                    </select>
                  </label>
                </div>
              </div>

              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>2. Observações</h3>
                  <span>Anotações gerais</span>
                </div>
                <div class="soft-divider"></div>

                <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>
              </div>

              <div class="form-actions" style="grid-column:1 / -1;">
                <button class="btn btn-primary" type="submit">${editing ? 'Salvar cliente' : 'Cadastrar cliente'}</button>
                <button class="btn btn-secondary" type="button" id="client-reset-btn">Limpar</button>
              </div>
            </form>
          </div>

          <div class="section-stack">
            <div class="table-card">
              <div class="section-header">
                <h2>Clientes</h2>
                <span class="muted">${rows.length} resultado(s)</span>
              </div>

              <div class="search-row" style="margin-bottom:14px;">
                <input id="client-filter-term" placeholder="Buscar por nome, telefone, e-mail ou endereço" value="${escapeHtml(filters.term)}" />
                <select id="client-filter-status">
                  <option value="">Todos</option>
                  <option value="ativo" ${filters.status === 'ativo' ? 'selected' : ''}>Ativo</option>
                  <option value="inativo" ${filters.status === 'inativo' ? 'selected' : ''}>Inativo</option>
                </select>
                <button class="btn btn-secondary" type="button" id="client-filter-apply">Filtrar</button>
                <button class="btn btn-secondary" type="button" id="client-filter-clear">Limpar</button>
              </div>

              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Telefone</th>
                      <th>E-mail</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map((client) => `
                      <tr>
                        <td>${escapeHtml(client.name || '-')}</td>
                        <td>${escapeHtml(client.phone || '-')}</td>
                        <td>${escapeHtml(client.email || '-')}</td>
                        <td><span class="tag ${client.active === false ? 'warning' : 'success'}">${client.active === false ? 'Inativo' : 'Ativo'}</span></td>
                        <td>
                          <div class="clean-table-actions">
                            <button class="btn btn-secondary" type="button" data-client-edit="${client.id}">Editar</button>
                            <button class="btn btn-secondary" type="button" data-client-history="${client.id}">Histórico</button>
                            <button class="btn btn-danger" type="button" data-client-inactivate="${client.id}">Inativar</button>
                          </div>
                        </td>
                      </tr>
                    `).join('') || '<tr><td colspan="5">Nenhum cliente encontrado.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="table-card">
              <div class="section-header">
                <h2>Histórico do cliente</h2>
              </div>
              <div id="client-history-host">
                <div class="empty-state">Selecione um cliente para visualizar o histórico.</div>
              </div>
            </div>
          </div>
        </div>

        <div id="accounts-module-host"></div>
      </div>
    `;

    const form = tabEls.clients.querySelector('#client-form');
    fillForm(form, editing);
    bindEvents();

    const accountsHost = tabEls.clients.querySelector('#accounts-module-host');
    if (accountsHost) {
      accountsHost.innerHTML = accountsModule.renderEmbedded();
      accountsModule.bindEmbeddedEvents(accountsHost);
    }
  }

  return {
    render
  };
}