export function createAuditModule(ctx) {
  const { state, refs, createDoc, formatDateTime } = ctx;

  async function log({
    module,
    action,
    entityType,
    entityId,
    entityLabel = '',
    description = '',
    metadata = {}
  }) {
    await createDoc(refs.auditLogs, {
      module: module || '',
      action: action || '',
      entityType: entityType || '',
      entityId: entityId || '',
      entityLabel,
      description,
      performedById: state.currentUser?.uid || '',
      performedByName: state.currentUser?.fullName || '',
      metadata,
      createdAt: new Date()
    });
  }

  function getDateValue(dateLike) {
    const created = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike || 0);
    if (Number.isNaN(created.getTime())) return '';
    return `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;
  }

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function truncateText(value, max = 90) {
    const text = normalizeText(value);
    if (text.length <= max) return text || '-';
    return `${text.slice(0, max).trim()}...`;
  }

  function formatMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return '';
    }

    const parts = Object.entries(metadata)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .slice(0, 4)
      .map(([key, value]) => `${key}: ${String(value)}`);

    return parts.join(' | ');
  }

  function getFilteredLogs(filters = {}) {
    return [...(state.auditLogs || [])]
      .filter((item) => {
        const moduleValue = String(item.module || '');
        const actionValue = String(item.action || '');
        const entityTypeValue = String(item.entityType || '');
        const entityLabelValue = String(item.entityLabel || '').toLowerCase();
        const userValue = String(item.performedByName || '').toLowerCase();
        const dateValue = getDateValue(item.createdAt);

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

  function renderAuditTable(filters = {}) {
    const rows = getFilteredLogs(filters).slice(0, 120);

    return `
      <div class="table-wrap">
        <table>
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
            ${rows.map((item) => {
              const metadataText = formatMetadata(item.metadata);
              const summaryParts = [
                truncateText(item.description || '-', 80),
                metadataText ? truncateText(metadataText, 80) : ''
              ].filter(Boolean);

              return `
                <tr>
                  <td>${formatDateTime(item.createdAt)}</td>
                  <td>${normalizeText(item.module) || '-'}</td>
                  <td>${normalizeText(item.action) || '-'}</td>
                  <td>
                    <strong>${truncateText(item.entityLabel || '-', 42)}</strong>
                    <div class="muted" style="margin-top:4px;">${truncateText(item.entityType || '-', 24)}</div>
                  </td>
                  <td>
                    <div>${summaryParts[0] || '-'}</div>
                    ${summaryParts[1] ? `<div class="muted" style="margin-top:4px;">${summaryParts[1]}</div>` : ''}
                  </td>
                  <td>${truncateText(item.performedByName || '-', 28)}</td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="6">Nenhum registro encontrado.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${(state.auditLogs || []).length > 120 ? '<div class="auth-hint" style="margin-top:10px;">Exibindo os 120 registros mais recentes com os filtros atuais.</div>' : ''}
    `;
  }

  return {
    log,
    getFilteredLogs,
    renderAuditTable
  };
}