import { escapeHtml, renderBlocked, showToast } from './ui.js';

export function createPayablesModule(ctx) {
  const {
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
  } = ctx;

  let filters = {
    supplier: '',
    status: '',
    dueDateFrom: '',
    dueDateTo: ''
  };

  function getStatusLabel(item) {
    const openAmount = Number(item.openAmount || 0);

    if (openAmount <= 0) {
      return 'Quitado';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDate = item.dueDate ? new Date(`${item.dueDate}T00:00:00`) : null;

    if (dueDate && dueDate < today) {
      return 'Vencido';
    }

    return 'Em aberto';
  }

  function getFilteredPayables() {
    return (state.accountsPayable || [])
      .filter((item) => {
        const supplier = String(item.supplierName || '').toLowerCase();
        const status = getStatusLabel(item);

        return (!filters.supplier || supplier.includes(filters.supplier.toLowerCase()))
          && (!filters.status || status === filters.status)
          && (!filters.dueDateFrom || (item.dueDate && item.dueDate >= filters.dueDateFrom))
          && (!filters.dueDateTo || (item.dueDate && item.dueDate <= filters.dueDateTo));
      })
      .sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const db = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return db - da;
      });
  }

  async function createPayable(payload) {
    const totalAmount = toNumber(payload.totalAmount);
    const paidAmount = toNumber(payload.paidAmount);
    const openAmount = Math.max(0, totalAmount - paidAmount);

    const data = {
      supplierId: payload.supplierId || '',
      supplierName: String(payload.supplierName || '').trim(),
      description: String(payload.description || '').trim(),
      totalAmount,
      paidAmount,
      openAmount,
      dueDate: payload.dueDate || '',
      paymentMethod: String(payload.paymentMethod || '').trim(),
      status: openAmount <= 0 ? 'Quitado' : 'Em aberto',
      notes: String(payload.notes || '').trim(),
      payments: paidAmount > 0 ? [{
        amount: paidAmount,
        method: payload.paymentMethod || '',
        paidAt: new Date(),
        paidById: state.currentUser?.uid || '',
        paidByName: state.currentUser?.fullName || '',
        notes: 'Pagamento inicial'
      }] : [],
      createdAt: new Date(),
      createdById: state.currentUser?.uid || '',
      createdByName: state.currentUser?.fullName || ''
    };

    const createdId = await createDoc(refs.accountsPayable, data);

    await auditModule.log({
      module: 'payables',
      action: 'create',
      entityType: 'account_payable',
      entityId: createdId,
      entityLabel: data.supplierName || 'Conta a pagar',
      description: 'Conta a pagar cadastrada.',
      metadata: {
        totalAmount: data.totalAmount,
        openAmount: data.openAmount,
        dueDate: data.dueDate
      }
    });

    showToast('Conta a pagar cadastrada.', 'success');
  }

  async function registerPayment(accountId, amount, method, notes = '') {
    const account = (state.accountsPayable || []).find((item) => item.id === accountId);

    if (!account) {
      throw new Error('Conta não encontrada.');
    }

    const paymentAmount = toNumber(amount);

    if (paymentAmount <= 0) {
      throw new Error('Informe um valor válido.');
    }

    const currentOpen = Number(account.openAmount || 0);

    if (paymentAmount > currentOpen) {
      throw new Error('O valor pago não pode ser maior que o saldo em aberto.');
    }

    const updatedPaid = Number(account.paidAmount || 0) + paymentAmount;
    const updatedOpen = Math.max(0, Number(account.totalAmount || 0) - updatedPaid);
    const payments = Array.isArray(account.payments) ? [...account.payments] : [];

    payments.push({
      amount: paymentAmount,
      method: method || '',
      paidAt: new Date(),
      paidById: state.currentUser?.uid || '',
      paidByName: state.currentUser?.fullName || '',
      notes: String(notes || '').trim()
    });

    await updateByPath('accounts_payable', accountId, {
      paidAmount: updatedPaid,
      openAmount: updatedOpen,
      status: updatedOpen <= 0 ? 'Quitado' : 'Em aberto',
      paymentMethod: method || account.paymentMethod || '',
      payments
    });

    await auditModule.log({
      module: 'payables',
      action: 'pay',
      entityType: 'account_payable',
      entityId: accountId,
      entityLabel: account.supplierName || 'Conta a pagar',
      description: 'Pagamento registrado.',
      metadata: {
        paid: paymentAmount,
        remaining: updatedOpen,
        method: method || ''
      }
    });

    showToast('Pagamento registrado.', 'success');
  }

  function renderPaymentModal(accountId, onSaved) {
    const account = (state.accountsPayable || []).find((item) => item.id === accountId);
    if (!account) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="payable-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Registrar pagamento</h2>
            <button class="btn btn-secondary" id="payable-modal-close">Fechar</button>
          </div>

          <div class="card" style="margin-bottom:16px;">
            <strong>${escapeHtml(account.supplierName || '-')}</strong>
            <p class="muted">Descrição: ${escapeHtml(account.description || '-')}</p>
            <p class="muted">Saldo em aberto: ${currency(account.openAmount || 0)}</p>
          </div>

          <form id="payable-payment-form" class="form-grid">
            <label>Valor pago<input name="amount" type="number" min="0" step="0.01" required /></label>
            <label>Forma de pagamento
              <select name="method" required>
                <option value="Dinheiro">Dinheiro</option>
                <option value="PIX">PIX</option>
                <option value="Cartão">Cartão</option>
                <option value="Transferência">Transferência</option>
                <option value="Boleto">Boleto</option>
                <option value="Outro">Outro</option>
              </select>
            </label>
            <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>
            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">Salvar pagamento</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#payable-modal-close').addEventListener('click', closeModal);
    modalRoot.querySelector('#payable-modal-backdrop').addEventListener('click', (event) => {
      if (event.target.id === 'payable-modal-backdrop') {
        closeModal();
      }
    });

    modalRoot.querySelector('#payable-payment-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      try {
        const values = Object.fromEntries(new FormData(event.currentTarget).entries());
        await registerPayment(accountId, values.amount, values.method, values.notes);
        closeModal();
        onSaved?.();
      } catch (error) {
        alert(error.message || 'Erro ao registrar pagamento.');
      }
    });
  }

  function renderHistoryTable(account) {
    const payments = Array.isArray(account?.payments) ? account.payments : [];

    return `
      <div class="table-wrap" style="margin-top:12px;">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Valor</th>
              <th>Forma</th>
              <th>Usuário</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            ${payments.map((item) => `
              <tr>
                <td>${formatDateTime(item.paidAt)}</td>
                <td>${currency(item.amount || 0)}</td>
                <td>${escapeHtml(item.method || '-')}</td>
                <td>${escapeHtml(item.paidByName || '-')}</td>
                <td>${escapeHtml(item.notes || '-')}</td>
              </tr>
            `).join('') || '<tr><td colspan="5">Nenhum pagamento registrado.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  function bindEvents() {
    const form = tabEls.payables.querySelector('#payable-form');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      try {
        const values = Object.fromEntries(new FormData(form).entries());
        await createPayable(values);
        form.reset();
        render();
      } catch (error) {
        alert(error.message || 'Erro ao cadastrar conta a pagar.');
      }
    });

    tabEls.payables.querySelector('#payable-filter-apply').addEventListener('click', () => {
      filters.supplier = tabEls.payables.querySelector('#payable-filter-supplier').value || '';
      filters.status = tabEls.payables.querySelector('#payable-filter-status').value || '';
      filters.dueDateFrom = tabEls.payables.querySelector('#payable-filter-date-from').value || '';
      filters.dueDateTo = tabEls.payables.querySelector('#payable-filter-date-to').value || '';
      render();
    });

    tabEls.payables.querySelector('#payable-filter-clear').addEventListener('click', () => {
      filters = {
        supplier: '',
        status: '',
        dueDateFrom: '',
        dueDateTo: ''
      };
      render();
    });

    tabEls.payables.querySelectorAll('[data-payable-pay]').forEach((btn) => {
      btn.addEventListener('click', () => {
        renderPaymentModal(btn.dataset.payablePay, render);
      });
    });

    tabEls.payables.querySelectorAll('[data-payable-history]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const account = (state.accountsPayable || []).find((item) => item.id === btn.dataset.payableHistory);
        const host = tabEls.payables.querySelector('#payable-history-host');

        if (!host || !account) return;

        host.innerHTML = `
          <div class="card">
            <h3>${escapeHtml(account.supplierName || '-')}</h3>
            <p><strong>Descrição:</strong> ${escapeHtml(account.description || '-')}</p>
            <p><strong>Total:</strong> ${currency(account.totalAmount || 0)}</p>
            <p><strong>Pago:</strong> ${currency(account.paidAmount || 0)}</p>
            <p><strong>Aberto:</strong> ${currency(account.openAmount || 0)}</p>
            <p><strong>Status:</strong> ${escapeHtml(getStatusLabel(account))}</p>
            <p><strong>Vencimento:</strong> ${escapeHtml(account.dueDate || '-')}</p>
          </div>
          ${renderHistoryTable(account)}
        `;
      });
    });
  }

  function render() {
    if (!hasPermission(state.currentUser, 'payables')) {
      tabEls.payables.innerHTML = renderBlocked();
      return;
    }

    const rows = getFilteredPayables();

    tabEls.payables.innerHTML = `
      <div class="panel">
        <div class="section-header">
          <h2>Contas a pagar</h2>
          <span class="muted">Controle de obrigações com fornecedores</span>
        </div>

        <form id="payable-form" class="form-grid">
          <label>Fornecedor
            <input name="supplierName" list="suppliers-payable-datalist" required />
          </label>

          <datalist id="suppliers-payable-datalist">
            ${(state.suppliers || [])
              .filter((item) => item.active !== false)
              .map((item) => `<option value="${escapeHtml(item.name || '')}"></option>`)
              .join('')}
          </datalist>

          <label>Descrição<input name="description" required /></label>
          <label>Valor total<input name="totalAmount" type="number" min="0" step="0.01" required /></label>
          <label>Valor pago inicial<input name="paidAmount" type="number" min="0" step="0.01" value="0" /></label>
          <label>Vencimento<input name="dueDate" type="date" /></label>

          <label>Forma prevista
            <select name="paymentMethod">
              <option value="Dinheiro">Dinheiro</option>
              <option value="PIX">PIX</option>
              <option value="Cartão">Cartão</option>
              <option value="Transferência">Transferência</option>
              <option value="Boleto">Boleto</option>
              <option value="Outro">Outro</option>
            </select>
          </label>

          <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>

          <div class="form-actions" style="grid-column:1 / -1;">
            <button class="btn btn-primary" type="submit">Cadastrar conta</button>
          </div>
        </form>
      </div>

      <div class="table-card" style="margin-top:18px;">
        <div class="section-header">
          <h2>Lista de contas</h2>
        </div>

        <div class="search-row" style="margin-bottom:14px; flex-wrap:wrap;">
          <input id="payable-filter-supplier" placeholder="Fornecedor" value="${escapeHtml(filters.supplier)}" />
          <select id="payable-filter-status">
            <option value="">Todos</option>
            <option value="Em aberto" ${filters.status === 'Em aberto' ? 'selected' : ''}>Em aberto</option>
            <option value="Quitado" ${filters.status === 'Quitado' ? 'selected' : ''}>Quitado</option>
            <option value="Vencido" ${filters.status === 'Vencido' ? 'selected' : ''}>Vencido</option>
          </select>
          <input id="payable-filter-date-from" type="date" value="${filters.dueDateFrom}" />
          <input id="payable-filter-date-to" type="date" value="${filters.dueDateTo}" />
          <button class="btn btn-secondary" id="payable-filter-apply">Filtrar</button>
          <button class="btn btn-secondary" id="payable-filter-clear">Limpar</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Descrição</th>
                <th>Total</th>
                <th>Pago</th>
                <th>Aberto</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((item) => `
                <tr>
                  <td>${escapeHtml(item.supplierName || '-')}</td>
                  <td>${escapeHtml(item.description || '-')}</td>
                  <td>${currency(item.totalAmount || 0)}</td>
                  <td>${currency(item.paidAmount || 0)}</td>
                  <td>${currency(item.openAmount || 0)}</td>
                  <td>${escapeHtml(item.dueDate || '-')}</td>
                  <td>${escapeHtml(getStatusLabel(item))}</td>
                  <td>
                    <div class="inline-row">
                      <button class="btn btn-secondary" data-payable-history="${item.id}">Histórico</button>
                      ${Number(item.openAmount || 0) > 0 ? `<button class="btn btn-primary" data-payable-pay="${item.id}">Pagar</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="8">Nenhuma conta encontrada.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="table-card" style="margin-top:18px;">
        <div class="section-header">
          <h2>Histórico de pagamentos</h2>
        </div>
        <div id="payable-history-host">
          <div class="empty-state">Selecione uma conta para visualizar o histórico.</div>
        </div>
      </div>
    `;

    bindEvents();
  }

  return {
    render,
    createPayable,
    registerPayment
  };
}