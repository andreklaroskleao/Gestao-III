import { escapeHtml, renderBlocked, showToast } from './ui.js';

export function createSuppliersModule(ctx) {
  const {
    state,
    tabEls,
    refs,
    createDoc,
    updateByPath,
    hasPermission,
    auditModule
  } = ctx;

  let filters = {
    term: '',
    status: ''
  };

  function getFilteredSuppliers() {
    return (state.suppliers || []).filter((item) => {
      const haystack = [
        item.name,
        item.contactName,
        item.phone,
        item.email,
        item.document,
        item.city
      ].join(' ').toLowerCase();

      const status = item.active === false ? 'inativo' : 'ativo';

      return (!filters.term || haystack.includes(filters.term.toLowerCase()))
        && (!filters.status || status === filters.status);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.active = payload.active === 'true';

    if (state.editingSupplierId) {
      const current = state.suppliers.find((item) => item.id === state.editingSupplierId);

      await updateByPath('suppliers', state.editingSupplierId, payload);

      await auditModule.log({
        module: 'suppliers',
        action: 'update',
        entityType: 'supplier',
        entityId: state.editingSupplierId,
        entityLabel: payload.name || current?.name || '',
        description: 'Fornecedor atualizado.'
      });
    } else {
      const createdId = await createDoc(refs.suppliers, payload);

      await auditModule.log({
        module: 'suppliers',
        action: 'create',
        entityType: 'supplier',
        entityId: createdId,
        entityLabel: payload.name || '',
        description: 'Fornecedor cadastrado.'
      });
    }

    state.editingSupplierId = null;
    form.reset();
    showToast('Fornecedor salvo com sucesso.', 'success');
    render();
  }

  function fillEditingForm(form) {
    if (!state.editingSupplierId) return;

    const editing = state.suppliers.find((item) => item.id === state.editingSupplierId);
    if (!editing) return;

    form.elements.name.value = editing.name || '';
    form.elements.contactName.value = editing.contactName || '';
    form.elements.phone.value = editing.phone || '';
    form.elements.email.value = editing.email || '';
    form.elements.document.value = editing.document || '';
    form.elements.address.value = editing.address || '';
    form.elements.city.value = editing.city || '';
    form.elements.notes.value = editing.notes || '';
    form.elements.active.value = String(editing.active !== false);
  }

  async function inactivateSupplier(supplierId) {
    const current = state.suppliers.find((item) => item.id === supplierId);

    await updateByPath('suppliers', supplierId, {
      active: false
    });

    await auditModule.log({
      module: 'suppliers',
      action: 'inactivate',
      entityType: 'supplier',
      entityId: supplierId,
      entityLabel: current?.name || '',
      description: 'Fornecedor inativado.'
    });

    showToast('Fornecedor inativado.', 'info');
  }

  function bindEvents() {
    const form = tabEls.suppliers.querySelector('#supplier-form');
    form.addEventListener('submit', handleSubmit);

    tabEls.suppliers.querySelector('#supplier-reset-btn').addEventListener('click', () => {
      state.editingSupplierId = null;
      render();
    });

    tabEls.suppliers.querySelector('#supplier-filter-apply').addEventListener('click', () => {
      filters.term = tabEls.suppliers.querySelector('#supplier-filter-term').value || '';
      filters.status = tabEls.suppliers.querySelector('#supplier-filter-status').value || '';
      render();
    });

    tabEls.suppliers.querySelector('#supplier-filter-clear').addEventListener('click', () => {
      filters = { term: '', status: '' };
      render();
    });

    tabEls.suppliers.querySelectorAll('[data-supplier-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingSupplierId = btn.dataset.supplierEdit;
        render();
      });
    });

    tabEls.suppliers.querySelectorAll('[data-supplier-inactivate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await inactivateSupplier(btn.dataset.supplierInactivate);
      });
    });
  }

  function render() {
    if (!hasPermission(state.currentUser, 'suppliers')) {
      tabEls.suppliers.innerHTML = renderBlocked();
      return;
    }

    const rows = getFilteredSuppliers();
    const editing = state.suppliers.find((item) => item.id === state.editingSupplierId);

    tabEls.suppliers.innerHTML = `
      <div class="users-layout">
        <div class="panel">
          <div class="section-header">
            <h2>${editing ? 'Editar fornecedor' : 'Cadastrar fornecedor'}</h2>
          </div>

          <form id="supplier-form" class="form-grid">
            <label>Nome / Razão social<input name="name" required /></label>
            <label>Contato<input name="contactName" /></label>
            <label>Telefone<input name="phone" /></label>
            <label>E-mail<input name="email" type="email" /></label>
            <label>Documento<input name="document" placeholder="CPF/CNPJ" /></label>
            <label>Endereço<input name="address" /></label>
            <label>Cidade<input name="city" /></label>
            <label>Status
              <select name="active">
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>
            <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">${editing ? 'Salvar fornecedor' : 'Cadastrar fornecedor'}</button>
              <button class="btn btn-secondary" type="button" id="supplier-reset-btn">Limpar</button>
            </div>
          </form>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Fornecedores</h2>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <input id="supplier-filter-term" placeholder="Buscar por nome, contato, telefone, e-mail, documento ou cidade" value="${escapeHtml(filters.term)}" />
            <select id="supplier-filter-status">
              <option value="">Todos</option>
              <option value="ativo" ${filters.status === 'ativo' ? 'selected' : ''}>Ativo</option>
              <option value="inativo" ${filters.status === 'inativo' ? 'selected' : ''}>Inativo</option>
            </select>
            <button class="btn btn-secondary" id="supplier-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" id="supplier-filter-clear">Limpar</button>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Contato</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  <th>Cidade</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((item) => `
                  <tr>
                    <td>${escapeHtml(item.name || '-')}</td>
                    <td>${escapeHtml(item.contactName || '-')}</td>
                    <td>${escapeHtml(item.phone || '-')}</td>
                    <td>${escapeHtml(item.email || '-')}</td>
                    <td>${escapeHtml(item.city || '-')}</td>
                    <td><span class="tag ${item.active === false ? 'warning' : 'success'}">${item.active === false ? 'Inativo' : 'Ativo'}</span></td>
                    <td>
                      <div class="inline-row">
                        <button class="btn btn-secondary" data-supplier-edit="${item.id}">Editar</button>
                        <button class="btn btn-danger" data-supplier-inactivate="${item.id}">Inativar</button>
                      </div>
                    </td>
                  </tr>
                `).join('') || '<tr><td colspan="7">Nenhum fornecedor encontrado.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const form = tabEls.suppliers.querySelector('#supplier-form');
    fillEditingForm(form);
    bindEvents();
  }

  return {
    render
  };
}