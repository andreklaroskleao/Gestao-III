import { escapeHtml, renderBlocked, showToast } from './ui.js';

export function createUsersModule(ctx) {
  const {
    state,
    tabEls,
    ROLES,
    AREAS,
    ACCESS_LEVELS,
    createManagedUser,
    updateManagedUser,
    deleteManagedUser,
    listUsers,
    auditModule
  } = ctx;

  let filters = {
    term: '',
    role: '',
    status: ''
  };

  function hasAccess() {
    return Array.isArray(state.currentUser?.permissions)
      && state.currentUser.permissions.includes('users');
  }

  function getFilteredUsers() {
    return (state.users || []).filter((user) => {
      const haystack = [
        user.fullName,
        user.username,
        user.email,
        user.role,
        user.accessLevel
      ].join(' ').toLowerCase();

      const status = user.active === false ? 'inativo' : 'ativo';

      return (!filters.term || haystack.includes(filters.term.toLowerCase()))
        && (!filters.role || String(user.role || '') === filters.role)
        && (!filters.status || status === filters.status);
    });
  }

  function getEditingUser() {
    return (state.users || []).find((item) => item.id === state.editingUserId) || null;
  }

  function buildDefaultPermissions(role, accessLevel) {
    if (accessLevel === 'master') {
      return [...AREAS];
    }

    const baseByRole = {
      Administrador: ['dashboard', 'sales', 'products', 'reports', 'deliveries', 'clients', 'suppliers', 'purchases', 'payables', 'users', 'settings'],
      Gerente: ['dashboard', 'sales', 'products', 'reports', 'deliveries', 'clients', 'suppliers', 'purchases', 'payables'],
      Financeiro: ['dashboard', 'reports', 'clients', 'suppliers', 'payables'],
      Estoquista: ['dashboard', 'products', 'suppliers', 'purchases'],
      Vendedor: ['dashboard', 'sales', 'products', 'deliveries', 'clients']
    };

    return baseByRole[role] ? [...baseByRole[role]] : ['dashboard'];
  }

  function fillForm(form, user) {
    if (!form) return;

    form.elements.fullName.value = user?.fullName || '';
    form.elements.username.value = user?.username || '';
    form.elements.email.value = user?.email || '';
    form.elements.role.value = user?.role || 'Vendedor';
    form.elements.accessLevel.value = user?.accessLevel || 'standard';
    form.elements.active.value = String(user?.active !== false);

    const passwordField = form.elements.password;
    if (passwordField) {
      passwordField.value = '';
      passwordField.required = !user;
    }

    const permissions = Array.isArray(user?.permissions)
      ? user.permissions
      : buildDefaultPermissions(user?.role || 'Vendedor', user?.accessLevel || 'standard');

    form.querySelectorAll('input[name="permissions"]').forEach((checkbox) => {
      checkbox.checked = permissions.includes(checkbox.value);
    });
  }

  function collectFormPayload(form) {
    const formData = new FormData(form);
    const permissions = formData.getAll('permissions');

    return {
      fullName: String(formData.get('fullName') || '').trim(),
      username: String(formData.get('username') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      password: String(formData.get('password') || '').trim(),
      role: String(formData.get('role') || 'Vendedor'),
      accessLevel: String(formData.get('accessLevel') || 'standard'),
      active: String(formData.get('active') || 'true') === 'true',
      permissions
    };
  }

  function getSummary() {
    const users = state.users || [];
    return {
      total: users.length,
      active: users.filter((item) => item.active !== false).length,
      inactive: users.filter((item) => item.active === false).length,
      admins: users.filter((item) => ['Administrador'].includes(item.role) || item.accessLevel === 'master').length
    };
  }

  function renderPermissionChecklist(selectedRole, selectedAccessLevel) {
    const suggested = buildDefaultPermissions(selectedRole, selectedAccessLevel);

    return `
      <div class="permission-grid">
        ${AREAS.map((area) => `
          <label class="permission-item">
            <input
              type="checkbox"
              name="permissions"
              value="${area}"
              ${suggested.includes(area) ? 'checked' : ''}
            />
            <span>${escapeHtml(getAreaLabel(area))}</span>
          </label>
        `).join('')}
      </div>
    `;
  }

  function getAreaLabel(area) {
    const map = {
      dashboard: 'Dashboard',
      sales: 'Vendas',
      products: 'Produtos',
      reports: 'Relatórios',
      deliveries: 'Tele-entregas',
      clients: 'Clientes',
      suppliers: 'Fornecedores',
      purchases: 'Compras',
      payables: 'Contas a pagar',
      users: 'Usuários',
      settings: 'Configurações'
    };

    return map[area] || area;
  }

  function getStatusTag(user) {
    return user.active === false
      ? '<span class="tag warning">Inativo</span>'
      : '<span class="tag success">Ativo</span>';
  }

  function openUserActions(userId) {
    window.openActionsSheet?.('Ações do usuário', [
      {
        label: 'Inativar',
        className: 'btn btn-danger',
        onClick: async () => {
          const target = (state.users || []).find((item) => item.id === userId);
          if (!target) return;

          await deleteManagedUser(state.currentUser, target.id);

          await auditModule.log({
            module: 'users',
            action: 'inactivate',
            entityType: 'user',
            entityId: target.id,
            entityLabel: target.fullName || '',
            description: 'Usuário inativado.'
          });

          showToast('Usuário inativado.', 'success');
          state.editingUserId = null;
          await refreshUsers();
          render();
        }
      }
    ]);
  }

  function renderUserActions(user) {
    return `
      <div class="actions-inline-compact">
        <button
          class="icon-action-btn"
          type="button"
          data-user-edit="${user.id}"
          title="Editar"
          aria-label="Editar"
        >✏️</button>

        <button
          class="icon-action-btn"
          type="button"
          data-user-more="${user.id}"
          title="Mais ações"
          aria-label="Mais ações"
        >⋯</button>
      </div>
    `;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = collectFormPayload(form);

    if (!payload.fullName || !payload.username || !payload.email) {
      alert('Preencha nome, usuário e e-mail.');
      return;
    }

    if (!state.editingUserId && !payload.password) {
      alert('A senha é obrigatória para criar usuário.');
      return;
    }

    try {
      if (state.editingUserId) {
        const target = getEditingUser();

        await updateManagedUser(state.currentUser, state.editingUserId, payload);

        await auditModule.log({
          module: 'users',
          action: 'update',
          entityType: 'user',
          entityId: state.editingUserId,
          entityLabel: payload.fullName,
          description: 'Usuário atualizado.',
          metadata: {
            previousName: target?.fullName || '',
            newName: payload.fullName
          }
        });

        showToast('Usuário atualizado.', 'success');
      } else {
        const created = await createManagedUser(state.currentUser, payload);

        await auditModule.log({
          module: 'users',
          action: 'create',
          entityType: 'user',
          entityId: created?.id || '',
          entityLabel: payload.fullName,
          description: 'Usuário criado.'
        });

        showToast('Usuário criado.', 'success');
      }

      state.editingUserId = null;
      form.reset();
      await refreshUsers();
      render();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao salvar usuário.');
    }
  }

  async function refreshUsers() {
    try {
      state.users = await listUsers();
    } catch (error) {
      console.error(error);
    }
  }

  function bindFilters() {
    tabEls.users.querySelector('#user-filter-apply')?.addEventListener('click', () => {
      filters.term = tabEls.users.querySelector('#user-filter-term')?.value || '';
      filters.role = tabEls.users.querySelector('#user-filter-role')?.value || '';
      filters.status = tabEls.users.querySelector('#user-filter-status')?.value || '';
      render();
    });

    tabEls.users.querySelector('#user-filter-clear')?.addEventListener('click', () => {
      filters = {
        term: '',
        role: '',
        status: ''
      };
      render();
    });
  }

  function bindActions() {
    tabEls.users.querySelectorAll('[data-user-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingUserId = btn.dataset.userEdit;
        render();
      });
    });

    tabEls.users.querySelectorAll('[data-user-more]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openUserActions(btn.dataset.userMore);
      });
    });
  }

  function bindFormHelpers() {
    const form = tabEls.users.querySelector('#user-form');
    const roleSelect = form?.elements.role;
    const accessSelect = form?.elements.accessLevel;
    const permissionsHost = tabEls.users.querySelector('#permissions-host');

    function rerenderPermissions() {
      if (!permissionsHost || !roleSelect || !accessSelect) return;
      permissionsHost.innerHTML = renderPermissionChecklist(roleSelect.value, accessSelect.value);
    }

    roleSelect?.addEventListener('change', rerenderPermissions);
    accessSelect?.addEventListener('change', rerenderPermissions);

    tabEls.users.querySelector('#user-reset-btn')?.addEventListener('click', () => {
      state.editingUserId = null;
      render();
    });

    form?.addEventListener('submit', handleSubmit);
  }

  function bindEvents() {
    bindFilters();
    bindActions();
    bindFormHelpers();
  }

  function render() {
    if (!hasAccess()) {
      tabEls.users.innerHTML = renderBlocked();
      return;
    }

    const editing = getEditingUser();
    const rows = getFilteredUsers();
    const summary = getSummary();

    tabEls.users.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card">
            <span>Total de usuários</span>
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
            <span>Administradores</span>
            <strong>${summary.admins}</strong>
          </div>
        </div>

        <div class="users-layout">
          <div class="panel">
            <div class="section-header">
              <h2>${editing ? 'Editar usuário' : 'Cadastrar usuário'}</h2>
              <span class="muted">${editing ? 'Atualize os dados e permissões.' : 'Criação controlada pelo administrador.'}</span>
            </div>

            <form id="user-form" class="form-grid mobile-optimized">
              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>1. Identificação</h3>
                  <span>Dados básicos</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Nome completo
                    <input name="fullName" required />
                  </label>

                  <label>Usuário
                    <input name="username" required />
                  </label>

                  <label>E-mail
                    <input name="email" type="email" required />
                  </label>

                  <label>Senha
                    <input name="password" type="password" ${editing ? '' : 'required'} />
                  </label>
                </div>
              </div>

              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>2. Perfil</h3>
                  <span>Função e acesso</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Função
                    <select name="role">
                      ${ROLES.map((role) => `<option value="${role}">${role}</option>`).join('')}
                    </select>
                  </label>

                  <label>Nível de acesso
                    <select name="accessLevel">
                      ${ACCESS_LEVELS.map((level) => `<option value="${level.value}">${level.label}</option>`).join('')}
                    </select>
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
                  <h3>3. Permissões</h3>
                  <span>Selecione os módulos liberados</span>
                </div>
                <div class="soft-divider"></div>

                <div id="permissions-host">
                  ${renderPermissionChecklist(editing?.role || 'Vendedor', editing?.accessLevel || 'standard')}
                </div>
              </div>

              <div class="form-actions" style="grid-column:1 / -1;">
                <button class="btn btn-primary" type="submit">${editing ? 'Salvar alterações' : 'Criar usuário'}</button>
                <button class="btn btn-secondary" type="button" id="user-reset-btn">Limpar</button>
              </div>
            </form>
          </div>

          <div class="section-stack">
            <div class="table-card">
              <div class="section-header">
                <h2>Usuários</h2>
                <span class="muted">${rows.length} resultado(s)</span>
              </div>

              <div class="search-row" style="margin-bottom:14px;">
                <input id="user-filter-term" placeholder="Buscar por nome, usuário, e-mail, função ou acesso" value="${escapeHtml(filters.term)}" />
                <select id="user-filter-role">
                  <option value="">Todas as funções</option>
                  ${ROLES.map((role) => `<option value="${role}" ${filters.role === role ? 'selected' : ''}>${role}</option>`).join('')}
                </select>
                <select id="user-filter-status">
                  <option value="">Todos os status</option>
                  <option value="ativo" ${filters.status === 'ativo' ? 'selected' : ''}>Ativo</option>
                  <option value="inativo" ${filters.status === 'inativo' ? 'selected' : ''}>Inativo</option>
                </select>
                <button class="btn btn-secondary" type="button" id="user-filter-apply">Filtrar</button>
                <button class="btn btn-secondary" type="button" id="user-filter-clear">Limpar</button>
              </div>

              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Usuário</th>
                      <th>E-mail</th>
                      <th>Função</th>
                      <th>Acesso</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map((user) => `
                      <tr>
                        <td>${escapeHtml(user.fullName || '-')}</td>
                        <td>${escapeHtml(user.username || '-')}</td>
                        <td>${escapeHtml(user.email || '-')}</td>
                        <td>${escapeHtml(user.role || '-')}</td>
                        <td>${escapeHtml(user.accessLevel || '-')}</td>
                        <td>${getStatusTag(user)}</td>
                        <td>${renderUserActions(user)}</td>
                      </tr>
                    `).join('') || '<tr><td colspan="7">Nenhum usuário encontrado.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="panel summary-highlight">
              <div class="section-header">
                <h2>Resumo rápido</h2>
                <span class="badge-soft">Controle</span>
              </div>

              <div class="cards-grid" style="grid-template-columns:1fr; gap:12px;">
                <div class="compact-card">
                  <span class="muted">Usuários ativos</span>
                  <strong>${summary.active}</strong>
                </div>

                <div class="compact-card">
                  <span class="muted">Usuários inativos</span>
                  <strong>${summary.inactive}</strong>
                </div>

                <div class="compact-card">
                  <span class="muted">Com acesso administrativo</span>
                  <strong>${summary.admins}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const form = tabEls.users.querySelector('#user-form');
    fillForm(form, editing);
    bindEvents();
  }

  return {
    render
  };
}