import { escapeHtml, renderBlocked, showToast, bindAsyncButton } from './ui.js';

export function createClientsTabModule(ctx) {
  const {
    state,
    tabEls,
    clientsModule,
    accountsModule,
    hasPermission,
    updateByPath
  } = ctx;

  let filters = {
    term: '',
    status: ''
  };

  function getRows() {
    return (state.clients || []).filter((item) => item.deleted !== true);
  }

  function getFilteredClients() {
    return getRows().filter((item) => {
      const haystack = [
        item.name,
        item.phone,
        item.email,
        item.document,
        item.address
      ].join(' ').toLowerCase();

      const status = item.active === false ? 'inativo' : 'ativo';

      return (!filters.term || haystack.includes(filters.term.toLowerCase()))
        && (!filters.status || status === filters.status);
    });
  }

  function getEditingClient() {
    return getRows().find((item) => item.id === state.editingClientId) || null;
  }

  function getSummary() {
    const rows = getRows();

    return {
      total: rows.length,
      active: rows.filter((item) => item.active !== false).length,
      inactive: rows.filter((item) => item.active === false).length,
      receivables: (state.accountsReceivable || []).reduce((sum, item) => sum + Number(item.openAmount || 0), 0)
    };
  }

  function openClientActions(clientId) {
    const client = getRows().find((item) => item.id === clientId);
    if (!client) return;

    if (client.active === false) {
      window.openActionsSheet?.('Ações do cliente', [
        {
          label: 'Reativar',
          className: 'btn btn-secondary',
          onClick: async () => {
            await updateByPath('clients', clientId, {
              active: true,
              deleted: false
            });

            showToast('Cliente reativado.', 'success');

            if (state.editingClientId === clientId) {
              state.editingClientId = null;
            }
          }
        },
        {
          label: 'Excluir',
          className: 'btn btn-danger',
          onClick: async () => {
            window.openConfirmDeleteModal?.({
              title: 'Excluir cliente',
              message: 'Deseja realmente excluir este cliente? Ele deixará de aparecer nas listagens.',
              onConfirm: async () => {
                await updateByPath('clients', clientId, {
                  active: false,
                  deleted: true
                });

                showToast('Cliente excluído.', 'success');

                if (state.editingClientId === clientId) {
                  state.editingClientId = null;
                }
              }
            });
          }
        }
      ]);
      return;
    }

    window.openActionsSheet?.('Ações do cliente', [
      {
        label: 'Inativar',
        className: 'btn btn-secondary',
        onClick: async () => {
          await clientsModule.inactivateClient(clientId);
          showToast('Cliente inativado.', 'success');

          if (state.editingClientId === clientId) {
            state.editingClientId = null;
          }
        }
      },
      {
        label: 'Excluir',
        className: 'btn btn-danger',
        onClick: async () => {
          window.openConfirmDeleteModal?.({
            title: 'Excluir cliente',
            message: 'Deseja realmente excluir este cliente? Ele deixará de aparecer nas listagens.',
            onConfirm: async () => {
              await updateByPath('clients', clientId, {
                active: false,
                deleted: true
              });

              showToast('Cliente excluído.', 'success');

              if (state.editingClientId === clientId) {
                state.editingClientId = null;
              }
            }
          });
        }
      }
    ]);
  }

  function renderClientActions(row) {
    return `
      <div class="actions-inline-compact">
        <button
          class="icon-action-btn"
          type="button"
          data-client-edit="${row.id}"
          title="Editar"
          aria-label="Editar"
        >✏️</button>

        <button
          class="icon-action-btn info"
          type="button"
          data-client-account="${row.id}"
          title="Contas"
          aria-label="Contas"
        >💳</button>

        <button
          class="icon-action-btn"
          type="button"
          data-client-more="${row.id}"
          title="Mais ações"
          aria-label="Mais ações"
        >⋯</button>
      </div>
    `;
  }

  function bindEvents() {
    tabEls.clients.querySelector('#client-filter-apply')?.addEventListener('click', () => {
      filters.term = tabEls.clients.querySelector('#client-filter-term')?.value || '';
      filters.status = tabEls.clients.querySelector('#client-filter-status')?.value || '';
      render();
    });

    bindAsyncButton(tabEls.clients.querySelector('#client-filter-clear'), async () => {
      filters = {
        term: '',
        status: ''
      };
      render();
    }, { busyLabel: 'Limpando...' });

    tabEls.clients.querySelectorAll('[data-client-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingClientId = btn.dataset.clientEdit;
        render();
      });
    });

    tabEls.clients.querySelectorAll('[data-client-account]').forEach((btn) => {
      btn.addEventListener('click', () => {
        accountsModule.openClientAccountsModal?.(btn.dataset.clientAccount);
      });
    });

    tabEls.clients.querySelectorAll('[data-client-more]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openClientActions(btn.dataset.clientMore);
      });
    });
  }

  function render() {
    if (!hasPermission(state.currentUser, 'clients')) {
      tabEls.clients.innerHTML = renderBlocked();
      return;
    }

    const rows = getFilteredClients();
    const summary = getSummary();

    tabEls.clients.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card"><span>Total de clientes</span><strong>${summary.total}</strong></div>
          <div class="metric-card"><span>Ativos</span><strong>${summary.active}</strong></div>
          <div class="metric-card"><span>Inativos</span><strong>${summary.inactive}</strong></div>
          <div class="metric-card"><span>Em aberto</span><strong>${Number(summary.receivables || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
        </div>

        <div class="section-stack">
          <div class="panel">
            ${clientsModule.renderClientForm?.(state.editingClientId) || ''}
          </div>

          <div class="table-card">
            <div class="section-header">
              <h2>Clientes</h2>
              <span class="muted">${rows.length} resultado(s)</span>
            </div>

            <div class="search-row" style="margin-bottom:14px;">
              <input
                id="client-filter-term"
                placeholder="Buscar por nome, telefone, e-mail, documento ou endereço"
                value="${escapeHtml(filters.term)}"
              />

              <select id="client-filter-status">
                <option value="">Todos os status</option>
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
                    <th>Documento</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map((row) => `
                    <tr>
                      <td>${escapeHtml(row.name || '-')}</td>
                      <td>${escapeHtml(row.phone || '-')}</td>
                      <td>${escapeHtml(row.email || '-')}</td>
                      <td>${escapeHtml(row.document || '-')}</td>
                      <td>${row.active === false ? '<span class="tag warning">Inativo</span>' : '<span class="tag success">Ativo</span>'}</td>
                      <td>${renderClientActions(row)}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="6">Nenhum cliente encontrado.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  return {
    render
  };
}