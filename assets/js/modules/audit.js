export function createAuditModule(ctx) {
  const {
    state,
    refs,
    createDoc,
    formatDateTime
  } = ctx;

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

  function getFilteredLogs(filters = {}) {
    return [...(state.auditLogs || [])]
      .filter((item) => {
        const moduleValue = String(item.module || '');
        const actionValue = String(item.action || '');
        const entityTypeValue = String(item.entityType || '');
        const entityLabelValue = String(item.entityLabel || '').toLowerCase();
        const userValue = String(item.performedByName || '').toLowerCase();

        const created = item.createdAt?.toDate
          ? item.createdAt.toDate()
          : new Date(item.createdAt || 0);

        const dateValue = Number.isNaN(created.getTime())
          ? ''
          : `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;

        return (!filters.module || moduleValue === filters.module)
          && (!filters.action || actionValue === filters.action)
          && (!filters.entityType || entityTypeValue === filters.entityType)
          && (!filters.entityLabel || entityLabelValue.includes(filters.entityLabel.toLowerCase()))
          && (!filters.user || userValue.includes(filters.user.toLowerCase()))
          && (!filters.dateFrom || dateValue >= filters.dateFrom)
          && (!filters.dateTo || dateValue <= filters.dateTo);
      })
      .sort((a, b) => {
        const da = a.createdAt?.toDate
          ? a.createdAt.toDate().getTime()
          : new Date(a.createdAt || 0).getTime();

        const db = b.createdAt?.toDate
          ? b.createdAt.toDate().getTime()
          : new Date(b.createdAt || 0).getTime();

        return db - da;
      });
  }

  function renderAuditTable(filters = {}) {
    const rows = getFilteredLogs(filters);

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
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
                <td>${formatDateTime(item.createdAt)}</td>
                <td>${item.module || '-'}</td>
                <td>${item.action || '-'}</td>
                <td>${item.entityType || '-'}</td>
                <td>${item.entityLabel || '-'}</td>
                <td>${item.description || '-'}</td>
                <td>${item.performedByName || '-'}</td>
              </tr>
            `).join('') || '<tr><td colspan="7">Nenhum registro encontrado.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  return {
    log,
    getFilteredLogs,
    renderAuditTable
  };
}