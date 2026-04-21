import { formatDateTime } from '../services/utils.js';

export function createAuditModule(ctx) {
  const {
    state,
    refs,
    createDoc
  } = ctx;

  async function log({
    module = '',
    action = '',
    entityType = '',
    entityId = '',
    entityLabel = '',
    description = '',
    metadata = {}
  } = {}) {
    try {
      await createDoc(refs.auditLogs, {
        module,
        action,
        entityType,
        entityId,
        entityLabel,
        description,
        metadata,
        userId: state.currentUser?.uid || '',
        userName: state.currentUser?.fullName || state.currentUser?.email || 'Usuário',
        deleted: false
      });
    } catch (error) {
      console.error('Erro ao gravar auditoria:', error);
    }
  }

  function normalizeDateKey(value) {
    if (!value) return '';

    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      }
      return value.slice(0, 10);
    }

    if (value?.toDate && typeof value.toDate === 'function') {
      const parsed = value.toDate();
      if (!Number.isNaN(parsed.getTime())) {
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      }
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }

    return '';
  }

  function matchFilter(value, filter) {
    const rawValue = String(value || '').toLowerCase();
    const rawFilter = String(filter || '').trim().toLowerCase();

    if (!rawFilter) return true;
    return rawValue.includes(rawFilter);
  }

  function getFilteredLogs(filters = {}) {
    const rows = Array.isArray(state.auditLogs) ? state.auditLogs : [];

    return rows.filter((item) => {
      if (item.deleted === true) return false;

      const createdKey = normalizeDateKey(item.createdAt);

      return matchFilter(item.module, filters.module)
        && matchFilter(item.action, filters.action)
        && matchFilter(item.entityType, filters.entityType)
        && matchFilter(item.entityLabel, filters.entityLabel)
        && matchFilter(item.userName || item.userId, filters.user)
        && (!filters.dateFrom || !createdKey || createdKey >= filters.dateFrom)
        && (!filters.dateTo || !createdKey || createdKey <= filters.dateTo);
    });
  }

  function renderAuditTable(filters = {}, shouldShow = false, limit = 40) {
    if (!shouldShow) {
      return `
        <div class="empty-state">
          <strong>Auditoria oculta</strong>
          <span>Aplique os filtros para exibir os logs.</span>
        </div>
      `;
    }

    const rows = getFilteredLogs(filters).slice(0, Number(limit || 40));

    if (!rows.length) {
      return `
        <div class="empty-state">
          <strong>Nenhum log encontrado</strong>
          <span>Não há registros para os filtros aplicados.</span>
        </div>
      `;
    }

    return `
      <table class="audit-table">
        <thead>
          <tr>
            <th>Data/Hora</th>
            <th>Módulo</th>
            <th>Ação</th>
            <th>Tipo</th>
            <th>Registro</th>
            <th>Descrição</th>
            <th>Usuário</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
              <td>${escapeHtml(item.module || '-')}</td>
              <td>${renderActionTag(item.action || '-')}</td>
              <td>${escapeHtml(item.entityType || '-')}</td>
              <td>${escapeHtml(item.entityLabel || item.entityId || '-')}</td>
              <td>${escapeHtml(item.description || '-')}</td>
              <td>${escapeHtml(item.userName || item.userId || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderActionTag(action) {
    const value = String(action || '').toLowerCase();
    let className = 'tag info';

    if (['create', 'reactivate', 'receive', 'payment'].includes(value)) {
      className = 'tag success';
    } else if (['delete'].includes(value)) {
      className = 'tag danger';
    } else if (['update', 'inactivate', 'password_change'].includes(value)) {
      className = 'tag warning';
    }

    return `<span class="${className}">${escapeHtml(action || '-')}</span>`;
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]));
  }

  return {
    log,
    renderAuditTable,
    getFilteredLogs
  };
}