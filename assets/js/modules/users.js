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
      return;
    }

    const editing = state.users.find((item) => item.id === state.editingUserId);
    if (!editing) return;

    form.elements.fullName.value = editing.fullName || '';
    form.elements.username.value = editing.username || '';
    form.elements.email.value = editing.email || '';
    form.elements.role.value = editing.role || 'Vendedor';
    form.elements.accessLevel.innerHTML = buildAccessLevelOptions(state.currentUser, editing.accessLevel || 'standard');
    form.elements.accessLevel.value = editing.accessLevel || 'standard';
    form.elements.active.value = String(Boolean(editing.active));
    markPermissionCheckboxes(form, editing.permissions || []);
  }

  function bindEvents() {
    const form = tabEls.users.querySelector('#user-form');
    const roleField = form.elements.role;
    const accessLevelField = form.elements.accessLevel;

    roleField.addEventListener('change', () => {
      const nextAccess = accessLevelField.value || getDefaultAccessLevel(roleField.value);
      markPermissionCheckboxes(form, ensurePermissionsByRole(roleField.value, nextAccess));
    });

    accessLevelField.addEventListener('change', () => {
      markPermissionCheckboxes(form, ensurePermissionsByRole(roleField.value, accessLevelField.value));
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

  function render() {
    tabEls.users.innerHTML = `
      <div class="users-layout">
        <div class="panel">
          <div class="section-header">
            <h2>${state.editingUserId ? 'Editar usuário' : 'Cadastrar usuário'}</h2>
          </div>

          <form id="user-form" class="form-grid">
            <label>Nome completo<input name="fullName" required /></label>
            <label>Usuário<input name="username" required /></label>
            <label>E-mail<input name="email" type="email" required /></label>
            <label>Senha<input name="password" type="password" ${state.editingUserId ? '' : 'required'} /></label>
            <label>Função<select name="role">${ROLES.map((role) => `<option value="${role}">${role}</option>`).join('')}</select></label>
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

            <div style="grid-column:1 / -1;">
              <p class="muted">Áreas liberadas</p>
              <div class="permission-grid">
                ${AREAS.map((area) => `
                  <label class="permission-item">
                    <input type="checkbox" name="permissions" value="${area}"> ${labelTab(area)}
                  </label>
                `).join('')}
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
            <h2>Usuários</h2>
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
                ${(state.users || []).map((user) => `
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