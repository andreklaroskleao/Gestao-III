import { renderEmptyState, escapeHtml } from './ui.js';

export function createAuditModule(ctx) {
  const { state, refs, createDoc, formatDateTime } = ctx;

  function log({
    module,
    action,
    entityType,
    entityId,
    entityLabel = '',
    description = '',
    metadata = {}
  }) {
    return createDoc(refs.auditLogs, {
      module: module || '',
      action: action || '',
      entityType: entityType || '',
      entityId: entityId || '',
      entityLabel,
      description,
      metadata,
      performedById: state.currentUser?.uid || '',
      performedByName: state.currentUser?.fullName || '',
      createdAt: new Date()
    });
  }

  function normalizeDateValue(dateLike) {
    const created = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike || 0);
    if (Number.isNaN(created.getTime())) return '';
    return `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;
  }

  function truncateText(value, max = 90) {
    const text = String(value || '').trim();
    if (!text) return '-';
    if (text.length <= max) return text;
    return `${text.slice(0, max).trim()}...`;
  }

  function formatMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return '';
    }

    return Object.entries(metadata)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .slice(0, 5)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(' | ');
  }

  function getFilteredLogs(filters = {}) {
    return [...(state.auditLogs || [])]
      .filter((item) => {
        const moduleValue = String(item.module || '');
        const actionValue = String(item.action || '');
        const entityTypeValue = String(item.entityType || '');
        const entityLabelValue = String(item.entityLabel || '').toLowerCase();
        const userValue = String(item.performedByName || '').toLowerCase();
        const dateValue = normalizeDateValue(item.createdAt);

        return (!filters.module || moduleValue === filters.module)
          && (!filters.action || actionValue === filters.action)
          && (!filters.entityType || entityTypeValue === filters.entityType)
          && (!filters.entityLabel || entityLabelValue.includes(filters.entityLabel.toLowerCase()))
          && (!filters.user || userValue.includes(filters.user.toLowerCase()))
          && (!filters.dateFrom || dateValue >= filters.dateFrom)
          && (!filters.dateTo || dateValue <= filters.dateTo);
      })
      .sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const db = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return db - da;
      });
  }

  function renderAuditTable(filters = {}, shouldShow = false, pageSize = 40) {
    if (!shouldShow) {
      return renderEmptyState('A auditoria será exibida somente depois de aplicar os filtros.');
    }

    const rows = getFilteredLogs(filters);
    if (!rows.length) {
      return renderEmptyState('Nenhum registro encontrado para os filtros informados.');
    }

    const visibleRows = rows.slice(0, pageSize);

    return `
      <div class="audit-table-scroll">
        <div class="table-wrap">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Módulo</th>
                <th>Ação</th>
                <th>Registro</th>
                <th>Resumo</th>
                <th>Usuário</th>
              </tr>
            </thead>
            <tbody>
              ${visibleRows.map((item) => {
                const metadataText = formatMetadata(item.metadata);
                return `
                  <tr>
                    <td>${formatDateTime(item.createdAt)}</td>
                    <td>${escapeHtml(truncateText(item.module || '-', 18))}</td>
                    <td>${escapeHtml(truncateText(item.action || '-', 18))}</td>
                    <td>
                      <strong>${escapeHtml(truncateText(item.entityLabel || '-', 34))}</strong>
                      <div class="muted" style="margin-top:4px;">${escapeHtml(truncateText(item.entityType || '-', 22))}</div>
                    </td>
                    <td>
                      <div>${escapeHtml(truncateText(item.description || '-', 84))}</div>
                      ${metadataText ? `<div class="muted" style="margin-top:4px;">${escapeHtml(truncateText(metadataText, 100))}</div>` : ''}
                    </td>
                    <td>${escapeHtml(truncateText(item.performedByName || '-', 24))}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="audit-summary-line">
        <span>Total encontrado: <strong>${rows.length}</strong></span>
        <span>Exibindo: <strong>${visibleRows.length}</strong></span>
      </div>
    `;
  }

  return {
    log,
    getFilteredLogs,
    renderAuditTable
  };
}