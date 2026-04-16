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

  function getEditingSupplier() {
    return (state.suppliers || []).find((item) => item.id === state.editingSupplierId) || null;
  }

  function getFilteredSuppliers() {
    return (state.suppliers || []).filter((supplier) => {
      const haystack = [
        supplier.name,
        supplier.contactName,
        supplier.phone,
        supplier.email,
        supplier.document,
        supplier.address
      ].join(' ').toLowerCase();

      const activeStatus = supplier.active === false ? 'inativo' : 'ativo';

      return (!filters.term || haystack.includes(filters.term.toLowerCase()))
        && (!filters.status || activeStatus === filters.status);
    });
  }

  function getSummary() {
    const suppliers = state.suppliers || [];
    return {
      total: suppliers.length,
      active: suppliers.filter((item) => item.active !== false).length,
      inactive: suppliers.filter((item) => item.active === false).length,
      filtered: getFilteredSuppliers().length
    };
  }

  function fillForm(form, supplier) {
    if (!form) return;

    form.elements.name.value = supplier?.name || '';
    form.elements.contactName.value = supplier?.contactName || '';
    form.elements.phone.value = supplier?.phone || '';
    form.elements.email.value = supplier?.email || '';
    form.elements.document.value = supplier?.document || '';
    form.elements.address.value = supplier?.address || '';
    form.elements.notes.value = supplier?.notes || '';
    form.elements.active.value = String(supplier?.active !== false);
  }

  function renderSupplierActions(supplier) {
    return `
      <div class="actions-inline-compact">
        <button
          class="icon-action-btn"
          type="button"
          data-supplier-edit="${supplier.id}"
          title="Editar"
          aria-label="Editar"
        >✏️</button>

        <details class="actions-menu">
          <summary
            class="icon-action-btn"
            title="Mais ações"
            aria-label="Mais ações"
          >⋯</summary>
          <div class="actions-menu-popover">
            <button
              class="btn btn-danger"
              type="button"
              data-supplier-inactivate="${supplier.id}"
            >Inativar</button>
          </div>
        </details>
      </div>
    `;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.active = payload.active === 'true';
    payload.deleted = false;

    try {
      if (state.editingSupplierId) {
        const current = getEditingSupplier();

        await updateByPath('suppliers', state.editingSupplierId, payload);

        await auditModule.log({
          module: 'suppliers',
          action: 'update',
          entityType: 'supplier',
          entityId: state.editingSupplierId,
          entityLabel: payload.name || current?.name || '',
          description: 'Fornecedor atualizado.'
        });

        state.editingSupplierId = null;
        showToast('Fornecedor atualizado.', 'success');
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

        showToast('Fornecedor cadastrado.', 'success');
      }

      form.reset();
      render();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao salvar fornecedor.');
    }
  }

  async function inactivateSupplier(supplierId) {
    const supplier = (state.suppliers || []).find((item) => item.id === supplierId);
    if (!supplier) return;

    await updateByPath('suppliers', supplierId, {
      active: false,
      deleted: false
    });

    await auditModule.log({
      module: 'suppliers',
      action: 'inactivate',
      entityType: 'supplier',
      entityId: supplierId,
      entityLabel: supplier.name || '',
      description: 'Fornecedor inativado.'
    });
  }

  function bindEvents() {
    const form = tabEls.suppliers.querySelector('#supplier-form');

    form.addEventListener('submit', handleSubmit);

    tabEls.suppliers.querySelector('#supplier-reset-btn')?.addEventListener('click', () => {
      state.editingSupplierId = null;
      form.reset();
      render();
    });

    tabEls.suppliers.querySelector('#supplier-filter-apply')?.addEventListener('click', () => {
      filters.term = tabEls.suppliers.querySelector('#supplier-filter-term')?.value || '';
      filters.status = tabEls.suppliers.querySelector('#supplier-filter-status')?.value || '';
      render();
    });

    tabEls.suppliers.querySelector('#supplier-filter-clear')?.addEventListener('click', () => {
      filters = {
        term: '',
        status: ''
      };
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
        const confirmed = window.confirm('Inativar este fornecedor?');
        if (!confirmed) return;

        try {
          await inactivateSupplier(btn.dataset.supplierInactivate);
          showToast('Fornecedor inativado.', 'success');

          if (state.editingSupplierId === btn.dataset.supplierInactivate) {
            state.editingSupplierId = null;
          }
        } catch (error) {
          console.error(error);
          alert(error.message || 'Erro ao inativar fornecedor.');
        }
      });
    });
  }

  function render() {
    if (!hasPermission(state.currentUser, 'suppliers')) {
      tabEls.suppliers.innerHTML = renderBlocked();
      return;
    }

    const editing = getEditingSupplier();
    const rows = getFilteredSuppliers();
    const summary = getSummary();

    tabEls.suppliers.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card">
            <span>Total de fornecedores</span>
            <strong>${summary.total}</strong>
          </div>
          <div class="metric-card">
            <span>Ativos</span>
            <strong>${summary.active}</strong>
          </div>
          <div class="metric-card">
            <span>Inativos</span>
            <strong>${summary.inactive}</strong>
          </div>
          <div class="metric-card">
            <span>Filtrados</span>
            <strong>${summary.filtered}</strong>
          </div>
        </div>

        <div class="users-layout">
          <div class="panel">
            <div class="section-header">
              <h2>${editing ? 'Editar fornecedor' : 'Cadastrar fornecedor'}</h2>
              <span class="muted">${editing ? 'Atualize os dados do fornecedor.' : 'Cadastro rápido e organizado.'}</span>
            </div>

            <form id="supplier-form" class="form-grid mobile-optimized">
              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>1. Identificação</h3>
                  <span>Dados principais</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Nome / Razão social
                    <input name="name" required />
                  </label>

                  <label>Contato
                    <input name="contactName" />
                  </label>

                  <label>Telefone
                    <input name="phone" />
                  </label>

                  <label>E-mail
                    <input name="email" type="email" />
                  </label>

                  <label>Documento
                    <input name="document" />
                  </label>

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
                  <h3>2. Endereço e observações</h3>
                  <span>Complemento do cadastro</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label style="grid-column:1 / -1;">Endereço
                    <input name="address" />
                  </label>

                  <label style="grid-column:1 / -1;">Observações
                    <textarea name="notes"></textarea>
                  </label>
                </div>
              </div>

              <div class="form-actions" style="grid-column:1 / -1;">
                <button class="btn btn-primary" type="submit">${editing ? 'Salvar fornecedor' : 'Cadastrar fornecedor'}</button>
                <button class="btn btn-secondary" type="button" id="supplier-reset-btn">Limpar</button>
              </div>
            </form>
          </div>

          <div class="section-stack">
            <div class="table-card">
              <div class="section-header">
                <h2>Fornecedores</h2>
                <span class="muted">${rows.length} resultado(s)</span>
              </div>

              <div class="search-row" style="margin-bottom:14px;">
                <input
                  id="supplier-filter-term"
                  placeholder="Buscar por nome, contato, telefone, e-mail, documento ou endereço"
                  value="${escapeHtml(filters.term)}"
                />

                <select id="supplier-filter-status">
                  <option value="">Todos</option>
                  <option value="ativo" ${filters.status === 'ativo' ? 'selected' : ''}>Ativo</option>
                  <option value="inativo" ${filters.status === 'inativo' ? 'selected' : ''}>Inativo</option>
                </select>

                <button class="btn btn-secondary" type="button" id="supplier-filter-apply">Filtrar</button>
                <button class="btn btn-secondary" type="button" id="supplier-filter-clear">Limpar</button>
              </div>

              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fornecedor</th>
                      <th>Contato</th>
                      <th>Telefone</th>
                      <th>E-mail</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map((supplier) => `
                      <tr>
                        <td>${escapeHtml(supplier.name || '-')}</td>
                        <td>${escapeHtml(supplier.contactName || '-')}</td>
                        <td>${escapeHtml(supplier.phone || '-')}</td>
                        <td>${escapeHtml(supplier.email || '-')}</td>
                        <td>
                          <span class="tag ${supplier.active === false ? 'warning' : 'success'}">
                            ${supplier.active === false ? 'Inativo' : 'Ativo'}
                          </span>
                        </td>
                        <td>${renderSupplierActions(supplier)}</td>
                      </tr>
                    `).join('') || '<tr><td colspan="6">Nenhum fornecedor encontrado.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="panel summary-highlight">
              <div class="section-header">
                <h2>Resumo rápido</h2>
                <span class="badge-soft">Fornecedores</span>
              </div>

              <div class="cards-grid" style="grid-template-columns:1fr; gap:12px;">
                <div class="compact-card">
                  <span class="muted">Ativos</span>
                  <strong>${summary.active}</strong>
                </div>

                <div class="compact-card">
                  <span class="muted">Inativos</span>
                  <strong>${summary.inactive}</strong>
                </div>

                <div class="compact-card">
                  <span class="muted">Filtrados</span>
                  <strong>${summary.filtered}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const form = tabEls.suppliers.querySelector('#supplier-form');
    fillForm(form, editing);
    bindEvents();
  }

  return {
    render
  };
}