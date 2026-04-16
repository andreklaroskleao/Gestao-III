import { escapeHtml } from './ui.js';

export function createClientsModule(ctx) {
  const {
    state,
    refs,
    createDoc,
    updateByPath,
    auditModule
  } = ctx;

  function normalizePhone(value = '') {
    return String(value).replace(/\D/g, '');
  }

  function getClientById(clientId) {
    return (state.clients || []).find((item) => item.id === clientId) || null;
  }

  function searchClients(term = '') {
    const query = String(term || '').trim().toLowerCase();

    return (state.clients || [])
      .filter((item) => item.active !== false)
      .filter((item) => !query || [item.name, item.phone, item.email].join(' ').toLowerCase().includes(query))
      .slice(0, 12);
  }

  async function createClient(payload) {
    const data = {
      name: String(payload.name || '').trim(),
      phone: normalizePhone(payload.phone),
      address: String(payload.address || '').trim(),
      email: String(payload.email || '').trim(),
      notes: String(payload.notes || '').trim(),
      active: payload.active !== false,
      createdById: state.currentUser?.uid || '',
      createdByName: state.currentUser?.fullName || ''
    };

    if (!data.name) {
      throw new Error('Informe o nome do cliente.');
    }

    const createdId = await createDoc(refs.clients, data);

    await auditModule.log({
      module: 'clients',
      action: 'create',
      entityType: 'client',
      entityId: createdId,
      entityLabel: data.name,
      description: 'Cliente cadastrado.'
    });

    return createdId;
  }

  async function updateClient(clientId, payload) {
    const current = getClientById(clientId);

    const data = {
      name: String(payload.name || '').trim(),
      phone: normalizePhone(payload.phone),
      address: String(payload.address || '').trim(),
      email: String(payload.email || '').trim(),
      notes: String(payload.notes || '').trim(),
      active: payload.active !== false
    };

    await updateByPath('clients', clientId, data);

    await auditModule.log({
      module: 'clients',
      action: 'update',
      entityType: 'client',
      entityId: clientId,
      entityLabel: data.name || current?.name || '',
      description: 'Cliente atualizado.'
    });
  }

  async function inactivateClient(clientId) {
    const current = getClientById(clientId);

    await updateByPath('clients', clientId, {
      active: false
    });

    await auditModule.log({
      module: 'clients',
      action: 'inactivate',
      entityType: 'client',
      entityId: clientId,
      entityLabel: current?.name || '',
      description: 'Cliente inativado.'
    });
  }

  function getClientSales(clientId) {
    return (state.sales || [])
      .filter((sale) => sale.clientId === clientId)
      .sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const db = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return db - da;
      });
  }

  function getClientDeliveries(clientId) {
    return (state.deliveries || [])
      .filter((item) => item.clientId === clientId)
      .sort((a, b) => {
        const da = a.scheduledAt?.toDate ? a.scheduledAt.toDate().getTime() : new Date(a.scheduledAt || 0).getTime();
        const db = b.scheduledAt?.toDate ? b.scheduledAt.toDate().getTime() : new Date(b.scheduledAt || 0).getTime();
        return db - da;
      });
  }

  function renderClientPicker({ target, onSelect }) {
    const host = document.querySelector(target);
    if (!host) return;

    host.innerHTML = `
      <div class="client-picker">
        <div class="search-row">
          <input id="client-picker-search" placeholder="Buscar cliente por nome ou telefone" />
          <button class="btn btn-secondary" id="client-picker-search-btn">Buscar</button>
        </div>
        <div id="client-picker-results" class="stack-list" style="margin-top:12px;"></div>
      </div>
    `;

    const resultsEl = host.querySelector('#client-picker-results');
    const input = host.querySelector('#client-picker-search');

    function renderResults() {
      const rows = searchClients(input.value);

      resultsEl.innerHTML = rows.map((client) => `
        <div class="list-item">
          <strong>${escapeHtml(client.name)}</strong>
          <span>${escapeHtml(client.phone || '-')} ${client.address ? '· ' + escapeHtml(client.address) : ''}</span>
          <div class="inline-row" style="margin-top:8px;">
            <button class="btn btn-primary" data-client-select="${client.id}">Selecionar</button>
          </div>
        </div>
      `).join('') || '<div class="empty-state">Nenhum cliente encontrado.</div>';

      resultsEl.querySelectorAll('[data-client-select]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const client = getClientById(btn.dataset.clientSelect);
          if (client) {
            onSelect(client);
          }
        });
      });
    }

    host.querySelector('#client-picker-search-btn').addEventListener('click', renderResults);
    input.addEventListener('input', renderResults);
    renderResults();
  }

  function renderClientHistory(clientId) {
    const client = getClientById(clientId);

    if (!client) {
      return '<div class="empty-state">Cliente não encontrado.</div>';
    }

    const sales = getClientSales(clientId);
    const deliveries = getClientDeliveries(clientId);

    return `
      <div class="cards-grid">
        <div class="card">
          <h3>Cliente</h3>
          <p><strong>${escapeHtml(client.name)}</strong></p>
          <p>${escapeHtml(client.phone || '-')}</p>
          <p>${escapeHtml(client.address || '-')}</p>
          <p>${escapeHtml(client.email || '-')}</p>
        </div>

        <div class="card">
          <h3>Resumo</h3>
          <p>Total de compras: <strong>${sales.length}</strong></p>
          <p>Total de entregas: <strong>${deliveries.length}</strong></p>
          <p>Status: <strong>${client.active === false ? 'Inativo' : 'Ativo'}</strong></p>
        </div>
      </div>

      <div class="table-card" style="margin-top:18px;">
        <h3>Histórico de compras</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Total</th>
                <th>Pagamento</th>
                <th>Itens</th>
              </tr>
            </thead>
            <tbody>
              ${sales.map((sale) => `
                <tr>
                  <td>${sale.createdAt?.toDate ? sale.createdAt.toDate().toLocaleString('pt-BR') : '-'}</td>
                  <td>${Number(sale.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td>${escapeHtml(sale.paymentMethod || '-')}</td>
                  <td>${sale.items?.length || 0}</td>
                </tr>
              `).join('') || '<tr><td colspan="4">Nenhuma compra encontrada.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="table-card" style="margin-top:18px;">
        <h3>Histórico de entregas</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>
              ${deliveries.map((item) => `
                <tr>
                  <td>${item.scheduledAt?.toDate ? item.scheduledAt.toDate().toLocaleString('pt-BR') : '-'}</td>
                  <td>${escapeHtml(item.status || '-')}</td>
                  <td>${Number(item.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td>${escapeHtml(item.description || '-')}</td>
                </tr>
              `).join('') || '<tr><td colspan="4">Nenhuma entrega encontrada.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  return {
    searchClients,
    createClient,
    updateClient,
    inactivateClient,
    getClientById,
    getClientSales,
    getClientDeliveries,
    renderClientPicker,
    renderClientHistory
  };
}