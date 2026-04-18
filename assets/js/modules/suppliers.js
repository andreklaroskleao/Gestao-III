import { escapeHtml, renderBlocked, showToast, bindSubmitGuard, bindAsyncButton } from './ui.js';

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

  let isSavingSupplier = false;

  function getRows() {
    return (state.suppliers || []).filter((item) => item.deleted !== true);
  }

  function getFilteredSuppliers() {
    return getRows().filter((item) => {
      const haystack = [
        item.name,
        item.contactName,
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

  function getEditingSupplier() {
    return getRows().find((item) => item.id === state.editingSupplierId) || null;
  }

  function getSummary() {
    const rows = getRows();

    return {
      total: rows.length,
      active: rows.filter((item) => item.active !== false).length,
      inactive: rows.filter((item) => item.active === false).length
    };
  }

  function fillForm(form, supplier) {
    if (!form || !supplier) return;

    form.elements.name.value = supplier.name || '';
    form.elements.contactName.value = supplier.contactName || '';
    form.elements.phone.value = supplier.phone || '';
    form.elements.email.value = supplier.email || '';
    form.elements.document.value = supplier.document || '';
    form.elements.address.value = supplier.address || '';
    form.elements.notes.value = supplier.notes || '';
    form.elements.active.value = String(supplier.active !== false);
  }

  async function saveSupplier() {
    if (isSavingSupplier) return;
    isSavingSupplier = true;

    try {
      const form = tabEls.suppliers.querySelector('#supplier-form');
      const payload = Object.fromEntries(new FormData(form).entries());

      payload.active = String(payload.active || 'true') === 'true';
      payload.deleted = false;

      if (!payload.name) {
        alert('Informe o nome do fornecedor.');
        return;
      }

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
    } finally {
      isSavingSupplier = false;
    }
  }

  async function inactivateSupplier(supplierId) {
    const supplier = getRows().find((item) => item.id === supplierId);
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

    showToast('Fornecedor inativado.', 'success');

    if (state.editingSupplierId === supplierId) {
      state.editingSupplierId = null;
    }
  }

  async function reactivateSupplier(supplierId) {
    const supplier = getRows().find((item) => item.id === supplierId);
    if (!supplier) return;

    await updateByPath('suppliers', supplierId, {
      active: true,
      deleted: false
    });

    await auditModule.log({
      module: 'suppliers',
      action: 'reactivate',
      entityType: 'supplier',
      entityId: supplierId,
      entityLabel: supplier.name || '',
      description: 'Fornecedor reativado.'
    });

    showToast('Fornecedor reativado.', 'success');

    if (state.editingSupplierId === supplierId) {
      state.editingSupplierId = null;
    }
  }

  function openSupplierActions(supplierId) {
    const supplier = getRows().find((item) => item.id === supplierId);
    if (!supplier) return;

    if (supplier.active === false) {
      window.openActionsSheet?.('Ações do fornecedor', [
        {
          label: 'Reativar',
          className: 'btn btn-secondary',
          onClick: async () => {
            await reactivateSupplier(supplierId);
          }
        },
        {
          label: 'Excluir',
          className: 'btn btn-danger',
          onClick: async () => {
            window.openConfirmDeleteModal?.({
              title: 'Excluir fornecedor',
              message: 'Deseja realmente excluir este fornecedor? Ele deixará de aparecer nas listagens.',
              onConfirm: async () => {
                await updateByPath('suppliers', supplierId, {
                  active: false,
                  deleted: true
                });

                await auditModule.log({
                  module: 'suppliers',
                  action: 'delete',
                  entityType: 'supplier',
                  entityId: supplierId,
                  entityLabel: supplier.name || '',
                  description: 'Fornecedor excluído logicamente.'
                });

                showToast('Fornecedor excluído.', 'success');

                if (state.editingSupplierId === supplierId) {
                  state.editingSupplierId = null;
                }
              }
            });
          }
        }
      ]);
      return;
    }

    window.openActionsSheet?.('Ações do fornecedor', [
      {
        label: 'Inativar',
        className: 'btn btn-secondary',
        onClick: async () => {
          await inactivateSupplier(supplierId);
        }
      },
      {
        label: 'Excluir',
        className: 'btn btn-danger',
        onClick: async () => {
          window.openConfirmDeleteModal?.({
            title: 'Excluir fornecedor',
            message: 'Deseja realmente excluir este fornecedor? Ele deixará de aparecer nas listagens.',
            onConfirm: async () => {
              await updateByPath('suppliers', supplierId, {
                active: false,
                deleted: true
              });

              await auditModule.log({
                module: 'suppliers',
                action: 'delete',
                entityType: 'supplier',
                entityId: supplierId,
                entityLabel: supplier.name || '',
                description: 'Fornecedor excluído logicamente.'
              });

              showToast('Fornecedor excluído.', 'success');

              if (state.editingSupplierId === supplierId) {
                state.editingSupplierId = null;
              }
            }
          });
        }
      }
    ]);
  }

  function renderSupplierActions(row) {
    return `
      <div class="actions-inline-compact">
        <button
          class="icon-action-btn"
          type="button"
          data-supplier-edit="${row.id}"
          title="Editar"
          aria-label="Editar"
        >✏️</button>

        <button
          class="icon-action-btn"
          type="button"
          data-supplier-more="${row.id}"
          title="Mais ações"
          aria-label="Mais ações"
        >⋯</button>
      </div>
    `;
  }

  function bindEvents() {
    bindSubmitGuard(tabEls.suppliers.querySelector('#supplier-form'), saveSupplier, {
      busyLabel: 'Salvando...'
    });

    bindAsyncButton(tabEls.suppliers.querySelector('#supplier-reset-btn'), async () => {
      state.editingSupplierId = null;
      render();
    }, { busyLabel: 'Limpando...' });

    tabEls.suppliers.querySelector('#supplier-filter-apply')?.addEventListener('click', () => {
      filters.term = tabEls.suppliers.querySelector('#supplier-filter-term')?.value || '';
      filters.status = tabEls.suppliers.querySelector('#supplier-filter-status')?.value || '';
      render();
    });

    bindAsyncButton(tabEls.suppliers.querySelector('#supplier-filter-clear'), async () => {
      filters = {
        term: '',
        status: ''
      };
      render();
    }, { busyLabel: 'Limpando...' });

    tabEls.suppliers.querySelectorAll('[data-supplier-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingSupplierId = btn.dataset.supplierEdit;
        render();
      });
    });

    tabEls.suppliers.querySelectorAll('[data-supplier-more]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openSupplierActions(btn.dataset.supplierMore);
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
          <div class="metric-card"><span>Total de fornecedores</span><strong>${summary.total}</strong></div>
          <div class="metric-card"><span>Ativos</span><strong>${summary.active}</strong></div>
          <div class="metric-card"><span>Inativos</span><strong>${summary.inactive}</strong></div>
        </div>

        <div class="users-layout">
          <div class="panel">
            <div class="section-header">
              <h2>${editing ? 'Editar fornecedor' : 'Cadastrar fornecedor'}</h2>
              <span class="muted">${editing ? 'Atualize os dados do fornecedor.' : 'Cadastro de fornecedores.'}</span>
            </div>

            <form id="supplier-form" class="form-grid mobile-optimized">
              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>1. Dados principais</h3>
                  <span>Identificação e contato</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Nome
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
                  placeholder="Buscar por nome, contato, telefone, e-mail ou documento"
                  value="${escapeHtml(filters.term)}"
                />
                <select id="supplier-filter-status">
                  <option value="">Todos os status</option>
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
                      <th>Nome</th>
                      <th>Contato</th>
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
                        <td>${escapeHtml(row.contactName || '-')}</td>
                        <td>${escapeHtml(row.phone || '-')}</td>
                        <td>${escapeHtml(row.email || '-')}</td>
                        <td>${escapeHtml(row.document || '-')}</td>
                        <td>${row.active === false ? '<span class="tag warning">Inativo</span>' : '<span class="tag success">Ativo</span>'}</td>
                        <td>${renderSupplierActions(row)}</td>
                      </tr>
                    `).join('') || '<tr><td colspan="7">Nenhum fornecedor encontrado.</td></tr>'}
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
                <div class="compact-card"><span class="muted">Ativos</span><strong>${summary.active}</strong></div>
                <div class="compact-card"><span class="muted">Inativos</span><strong>${summary.inactive}</strong></div>
                <div class="compact-card"><span class="muted">Total</span><strong>${summary.total}</strong></div>
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