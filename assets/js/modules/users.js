import { escapeHtml, labelTab } from './ui.js';
import {
  ACCESS_LEVELS,
  ensurePermissionsByRole,
  isMaster,
  canEditTargetUser,
  canInactivateTargetUser,
  canAssignAccessLevel
} from '../services/utils.js';

export function createUsersModule(ctx) {
  const {
    state,
    tabEls,
    ROLES,
    AREAS,
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

  function markPermissionCheckboxes(form, permissions) {
    [...form.querySelectorAll('input[name="permissions"]')].forEach((input) => {
      input.checked = permissions.includes(input.value);
    });
  }

  function getDefaultAccessLevel(role) {
    if (role === 'Gerente') return 'manager';
    return 'standard';
  }

  function getAllowedAccessLevels(actor) {
    if (isMaster(actor)) {
      return ACCESS_LEVELS;
    }

    if (actor?.accessLevel === 'admin') {
      return ['admin', 'manager', 'standard'];
    }

    return ['standard'];
  }

  function buildAccessLevelOptions(actor, selectedValue = 'standard') {
    return getAllowedAccessLevels(actor)
      .map((level) => `<option value="${level}" ${selectedValue === level ? 'selected' : ''}>${level}</option>`)
      .join('');
  }

  function getEditingUser() {
    return (state.users || []).find((item) => item.id === state.editingUserId) || null;
  }

  function getFiltereredUsers() {
    return (state.users || []).filter((user) => {
      const haystack = [
        user.fullName,
        user.username,
        user.email,
        user.role,
        user.accessLevel
      ].join(' ').toLowerCase();

      const activeStatus = user.active ? 'ativo' : 'inativo';

      return (!filters.term || haystack.includes(filters.term.toLowerCase()))
        && (!filters.role || user.role === filters.role)
        && (!filters.status || activeStatus === filters.status);
    });
  }

  function buildPermissionSummary(form) {
    const checked = [...form.querySelectorAll('input[name="permissions"]:checked')].map((input) => input.value);

    const host = tabEls.users.querySelector('#user-permission-summary');
    if (!host) return;

    host.innerHTML = checked.length
      ? checked.map((item) => `<span class="tag info">${escapeHtml(labelTab(item))}</span>`).join(' ')
      : '<span class="muted">Nenhuma área liberada.</span>';

    const countHost = tabEls.users.querySelector('#user-permission-count');
    if (countHost) {
      countHost.textContent = String(checked.length);
    }
  }

  async function handleUserSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());
    const permissions = [...form.querySelectorAll('input[name="permissions"]:checked')].map((input) => input.value);

    const payload = {
      ...raw,
      permissions,
      active: raw.active === 'true'
    };

    if (!canAssignAccessLevel(state.currentUser, payload.accessLevel)) {
      throw new Error('Você não pode atribuir este nível de acesso.');
    }

    if (state.editingUserId) {
      const current = state.users.find((item) => item.id === state.editingUserId);

      await updateManagedUser(state.currentUser, state.editingUserId, payload);

      await auditModule.log({
        module: 'users',
        action: 'update',
        entityType: 'user',
        entityId: state.editingUserId,
        entityLabel: payload.fullName || current?.fullName || '',
        description: 'Usuário atualizado.'
      });
    } else {
      const createdUser = await createManagedUser(state.currentUser, payload);

      await auditModule.log({
        module: 'users',
        action: 'create',
        entityType: 'user',
        entityId: createdUser?.id || '',
        entityLabel: payload.fullName || '',
        description: 'Usuário cadastrado.'
      });
    }

    state.editingUserId = null;
    state.users = await listUsers();
    form.reset();
    render();
  }

  function fillEditingForm(form) {
    if (!state.editingUserId) {
      const role = form.elements.role.value;
      const accessLevel = form.elements.accessLevel.value || getDefaultAccessLevel(role);
      markPermissionCheckboxes(form, ensurePermissionsByRole(role, accessLevel));
      buildPermissionSummary(form);
      return;
    }

    const editing = getEditingUser();
    if (!editing) return;

    form.elements.fullName.value = editing.fullName || '';
    form.elements.username.value = editing.username || '';
    form.elements.email.value = editing.email || '';
    form.elements.role.value = editing.role || 'Vendedor';
    form.elements.accessLevel.innerHTML = buildAccessLevelOptions(state.currentUser, editing.accessLevel || 'standard');
    form.elements.accessLevel.value = editing.accessLevel || 'standard';
    form.elements.active.value = String(Boolean(editing.active));
    markPermissionCheckboxes(form, editing.permissions || []);
    buildPermissionSummary(form);
  }

  function renderUserActions(user) {
    const canEdit = canEditTargetUser(state.currentUser, user);
    const canDelete = canInactivateTargetUser(state.currentUser, user);

    return `
      <div class="inline-row">
        ${canEdit ? `<button class="btn btn-secondary" data-user-edit="${user.id}">Editar</button>` : ''}
        ${canDelete ? `<button class="btn btn-danger" data-user-delete="${user.id}">Inativar</button>` : ''}
      </div>
    `;
  }

  function renderQuickTemplates() {
    return `
      <div class="card">
        <div class="section-header">
          <h3>Padrões rápidos</h3>
          <span class="muted">Aplicar permissões por função</span>
        </div>

        <div class="inline-row" style="flex-wrap:wrap;">
          <button class="btn btn-secondary" type="button" data-role-template="Gerente">Gerente</button>
          <button class="btn btn-secondary" type="button" data-role-template="Vendedor">Vendedor</button>
          <button class="btn btn-secondary" type="button" data-role-template="Estoque">Estoque</button>
          <button class="btn btn-secondary" type="button" data-role-template="Entregador">Entregador</button>
        </div>
      </div>
    `;
  }

  function bindEvents() {
    const form = tabEls.users.querySelector('#user-form');
    const roleField = form.elements.role;
    const accessLevelField = form.elements.accessLevel;

    roleField.addEventListener('change', () => {
      const nextAccess = accessLevelField.value || getDefaultAccessLevel(roleField.value);
      markPermissionCheckboxes(form, ensurePermissionsByRole(roleField.value, nextAccess));
      buildPermissionSummary(form);
    });

    accessLevelField.addEventListener('change', () => {
      markPermissionCheckboxes(form, ensurePermissionsByRole(roleField.value, accessLevelField.value));
      buildPermissionSummary(form);
    });

    form.querySelectorAll('input[name="permissions"]').forEach((input) => {
      input.addEventListener('change', () => buildPermissionSummary(form));
    });

    form.addEventListener('submit', async (event) => {
      try {
        await handleUserSubmit(event);
      } catch (error) {
        alert(error.message || 'Erro ao salvar usuário.');
      }
    });

    tabEls.users.querySelector('#user-reset-btn').addEventListener('click', () => {
      state.editingUserId = null;
      render();
    });

    tabEls.users.querySelectorAll('[data-role-template]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const role = btn.dataset.roleTemplate;
        form.elements.role.value = role;

        if (!state.editingUserId) {
          form.elements.accessLevel.value = getDefaultAccessLevel(role);
        }

        markPermissionCheckboxes(
          form,
          ensurePermissionsByRole(form.elements.role.value, form.elements.accessLevel.value)
        );

        buildPermissionSummary(form);
      });
    });

    tabEls.users.querySelectorAll('[data-user-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingUserId = btn.dataset.userEdit;
        render();
      });
    });

    tabEls.users.querySelectorAll('[data-user-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const current = state.users.find((item) => item.id === btn.dataset.userDelete);

          await deleteManagedUser(state.currentUser, btn.dataset.userDelete);

          await auditModule.log({
            module: 'users',
            action: 'inactivate',
            entityType: 'user',
            entityId: btn.dataset.userDelete,
            entityLabel: current?.fullName || '',
            description: 'Usuário inativado logicamente.'
          });

          state.users = await listUsers();
          render();
        } catch (error) {
          alert(error.message || 'Erro ao inativar usuário.');
        }
      });
    });

    tabEls.users.querySelector('#user-filter-apply').addEventListener('click', () => {
      filters.term = tabEls.users.querySelector('#user-filter-term').value || '';
      filters.role = tabEls.users.querySelector('#user-filter-role').value || '';
      filters.status = tabEls.users.querySelector('#user-filter-status').value || '';
      render();
    });

    tabEls.users.querySelector('#user-filter-clear').addEventListener('click', () => {
      filters = {
        term: '',
        role: '',
        status: ''
      };
      render();
    });
  }

  function render() {
    const editing = getEditingUser();
    const rows = getFiltereredUsers();

    tabEls.users.innerHTML = `
      <div class="users-layout">
        <div class="panel">
          <div class="section-header">
            <h2>${editing ? 'Editar usuário' : 'Cadastrar usuário'}</h2>
            <span class="muted">${editing ? 'Atualize os dados e permissões.' : 'Criação de contas com acompanhamento visual.'}</span>
          </div>

          <form id="user-form" class="form-grid">
            <div class="card" style="grid-column:1 / -1;">
              <div class="section-header">
                <h3>1. Dados básicos</h3>
                <span class="muted">Informações principais</span>
              </div>

              <div class="form-grid">
                <label>Nome completo<input name="fullName" required /></label>
                <label>Usuário<input name="username" required /></label>
                <label>E-mail<input name="email" type="email" required /></label>
                <label>Senha<input name="password" type="password" ${state.editingUserId ? '' : 'required'} /></label>
              </div>
            </div>

            <div class="card" style="grid-column:1 / -1;">
              <div class="section-header">
                <h3>2. Perfil do acesso</h3>
                <span class="muted">Cargo, nível e status</span>
              </div>

              <div class="form-grid">
                <label>Função
                  <select name="role">
                    ${ROLES.map((role) => `<option value="${role}">${role}</option>`).join('')}
                  </select>
                </label>

                <label>Nível de acesso
                  <select name="accessLevel">
                    ${buildAccessLevelOptions(state.currentUser, 'standard')}
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

            ${renderQuickTemplates()}

            <div class="card" style="grid-column:1 / -1;">
              <div class="section-header">
                <div>
                  <h3>3. Permissões</h3>
                  <span class="muted">Marque exatamente o que o usuário poderá acessar</span>
                </div>
                <div class="muted">Áreas liberadas: <strong id="user-permission-count">0</strong></div>
              </div>

              <div class="permission-grid">
                ${AREAS.map((area) => `
                  <label class="permission-item">
                    <input type="checkbox" name="permissions" value="${area}">
                    <span>${labelTab(area)}</span>
                  </label>
                `).join('')}
              </div>

              <div class="card" style="margin-top:14px; padding:14px;">
                <strong style="display:block; margin-bottom:10px;">Resumo do acesso</strong>
                <div id="user-permission-summary" class="inline-row" style="flex-wrap:wrap;"></div>
              </div>
            </div>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">${state.editingUserId ? 'Salvar usuário' : 'Cadastrar usuário'}</button>
              <button type="button" id="user-reset-btn" class="btn btn-secondary">Limpar</button>
            </div>
          </form>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Usuários cadastrados</h2>
            <span class="muted">${rows.length} registro(s)</span>
          </div>

          <div class="search-row" style="margin-bottom:14px;">
            <input id="user-filter-term" placeholder="Buscar por nome, usuário, e-mail, função ou nível" value="${escapeHtml(filters.term)}" />
            <select id="user-filter-role">
              <option value="">Todas as funções</option>
              ${ROLES.map((role) => `<option value="${role}" ${filters.role === role ? 'selected' : ''}>${role}</option>`).join('')}
            </select>
            <select id="user-filter-status">
              <option value="">Todos os status</option>
              <option value="ativo" ${filters.status === 'ativo' ? 'selected' : ''}>Ativo</option>
              <option value="inativo" ${filters.status === 'inativo' ? 'selected' : ''}>Inativo</option>
            </select>
            <button class="btn btn-secondary" id="user-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" id="user-filter-clear">Limpar</button>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Usuário</th>
                  <th>Função</th>
                  <th>Nível</th>
                  <th>Status</th>
                  <th>Permissões</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((user) => `
                  <tr>
                    <td>${escapeHtml(user.fullName)}</td>
                    <td>${escapeHtml(user.username)}</td>
                    <td>${escapeHtml(user.role)}</td>
                    <td>${escapeHtml(user.accessLevel || 'standard')}</td>
                    <td><span class="tag ${user.active ? 'success' : 'warning'}">${user.active ? 'Ativo' : 'Inativo'}</span></td>
                    <td>${(user.permissions || []).map(labelTab).join(', ')}</td>
                    <td>${renderUserActions(user)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="7">Nenhum usuário cadastrado.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const form = tabEls.users.querySelector('#user-form');
    fillEditingForm(form);
    bindEvents();
  }

  return {
    render
  };
}