import { escapeHtml, showToast } from './ui.js';

export function createReportsModule(ctx) {
  const {
    state,
    tabEls,
    exportModule
  } = ctx;

  function reportTable(headers, rows) {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${headers.map((head) => `<th>${head}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.length
              ? rows.map((row) => `<tr>${row.map((col) => `<td>${escapeHtml(col)}</td>`).join('')}</tr>`).join('')
              : `<tr><td colspan="${headers.length}">Sem dados.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function uniqueOptions(field) {
    return [...new Set((state.products || []).map((item) => item[field]).filter(Boolean))]
      .sort()
      .map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)
      .join('');
  }

  function aggregateProducts(field) {
    const map = new Map();

    (state.products || []).forEach((item) => {
      const key = item[field] || 'Não informado';
      const current = map.get(key) || {
        label: key,
        products: 0,
        qty: 0
      };

      current.products += 1;
      current.qty += Number(item.quantity || 0);
      map.set(key, current);
    });

    return [...map.values()].sort((a, b) => b.qty - a.qty);
  }

  function getTopSelling(limit = 5) {
    const map = new Map();

    (state.sales || []).forEach((sale) => {
      (sale.items || []).forEach((item) => {
        map.set(item.name, (map.get(item.name) || 0) + Number(item.quantity || 0));
      });
    });

    return [...map.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);
  }

  function getLowSelling(limit = 5) {
    const sold = getTopSelling(9999);
    const soldMap = new Map(sold.map((item) => [item.name, item.qty]));

    return (state.products || [])
      .map((item) => ({
        name: item.name,
        qty: soldMap.get(item.name) || 0
      }))
      .sort((a, b) => a.qty - b.qty)
      .slice(0, limit);
  }

  function getLowStockProducts() {
    const threshold = Number(state.settings.lowStockThreshold || 5);

    return (state.products || []).filter((item) => {
      return item.status !== 'inativo' && Number(item.quantity || 0) <= threshold;
    });
  }

  function bindEvents() {
    tabEls.reports.querySelector('#report-filter-form').addEventListener('submit', (event) => {
      event.preventDefault();

      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const term = (values.term || '').toLowerCase();

      const filtered = (state.products || []).filter((item) => {
        const haystack = [item.name, item.brand, item.barcode].join(' ').toLowerCase();

        return (!values.supplier || item.supplier === values.supplier)
          && (!values.manufacturer || item.manufacturer === values.manufacturer)
          && (!values.status || item.status === values.status)
          && (!term || haystack.includes(term));
      });

      tabEls.reports.querySelector('#combined-report-result').innerHTML = reportTable(
        ['Produto', 'Fornecedor', 'Fabricante', 'Qtd'],
        filtered.map((item) => [
          item.name,
          item.supplier || '-',
          item.manufacturer || '-',
          item.quantity
        ])
      );
    });

    const binds = [
      ['#export-products-btn', () => exportModule.exportProducts(), 'Relatório de produtos exportado.'],
      ['#export-sales-btn', () => exportModule.exportSales(), 'Relatório de vendas exportado.'],
      ['#export-deliveries-btn', () => exportModule.exportDeliveries(), 'Relatório de tele-entregas exportado.'],
      ['#export-clients-btn', () => exportModule.exportClients(), 'Relatório de clientes exportado.'],
      ['#export-inventory-btn', () => exportModule.exportInventoryMovements(), 'Relatório de movimentações exportado.'],
      ['#export-audit-btn', () => exportModule.exportAuditLogs(), 'Relatório de auditoria exportado.']
    ];

    binds.forEach(([selector, fn, message]) => {
      tabEls.reports.querySelector(selector)?.addEventListener('click', () => {
        fn();
        showToast(message, 'success');
      });
    });
  }

  function render() {
    const topSelling = getTopSelling(10);
    const lowSelling = getLowSelling(10);
    const lowStock = getLowStockProducts();
    const bySupplier = aggregateProducts('supplier');
    const byManufacturer = aggregateProducts('manufacturer');

    tabEls.reports.innerHTML = `
      <div class="cards-grid">
        <div class="card">
          <h3>Produtos em estoque</h3>
          <strong>${(state.products || []).filter((item) => item.status !== 'inativo').length}</strong>
          <p class="muted">Cadastrados como ativos.</p>
        </div>

        <div class="card">
          <h3>Quantidade em estoque</h3>
          <strong>${(state.products || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</strong>
          <p class="muted">Soma total das unidades.</p>
        </div>

        <div class="card">
          <h3>Estoque baixo</h3>
          <strong>${lowStock.length}</strong>
          <p class="muted">Abaixo do limite configurado.</p>
        </div>

        <div class="card">
          <h3>Produtos vendidos</h3>
          <strong>${(state.sales || []).reduce((sum, sale) => sum + ((sale.items || []).length), 0)}</strong>
          <p class="muted">Itens em vendas registradas.</p>
        </div>
      </div>

      <div class="card" style="margin-top:18px;">
        <div class="section-header">
          <h2>Exportação de relatórios</h2>
          <span class="muted">Baixe os dados em CSV</span>
        </div>

        <div class="inline-row" style="flex-wrap:wrap; gap:10px; margin-top:12px;">
          <button class="btn btn-secondary" id="export-products-btn">Exportar produtos</button>
          <button class="btn btn-secondary" id="export-sales-btn">Exportar vendas</button>
          <button class="btn btn-secondary" id="export-deliveries-btn">Exportar tele-entregas</button>
          <button class="btn btn-secondary" id="export-clients-btn">Exportar clientes</button>
          <button class="btn btn-secondary" id="export-inventory-btn">Exportar estoque</button>
          <button class="btn btn-secondary" id="export-audit-btn">Exportar auditoria</button>
        </div>
      </div>

      <div class="grid-2" style="margin-top:18px;">
        <div class="table-card">
          <h3>Produtos com estoque baixo</h3>
          ${reportTable(['Produto', 'Qtd', 'Fornecedor'], lowStock.map((item) => [item.name, item.quantity, item.supplier || '-']))}
        </div>

        <div class="table-card">
          <h3>Produtos mais vendidos</h3>
          ${reportTable(['Produto', 'Qtd'], topSelling.map((item) => [item.name, item.qty]))}
        </div>

        <div class="table-card">
          <h3>Produtos com baixa saída</h3>
          ${reportTable(['Produto', 'Qtd'], lowSelling.map((item) => [item.name, item.qty]))}
        </div>

        <div class="table-card">
          <h3>Relatório por fornecedor</h3>
          ${reportTable(['Fornecedor', 'Qtd itens', 'Estoque'], bySupplier.map((item) => [item.label, item.products, item.qty]))}
        </div>

        <div class="table-card">
          <h3>Relatório por fabricante</h3>
          ${reportTable(['Fabricante', 'Qtd itens', 'Estoque'], byManufacturer.map((item) => [item.label, item.products, item.qty]))}
        </div>

        <div class="table-card">
          <h3>Filtros combinados</h3>
          <form id="report-filter-form" class="form-grid">
            <label>Fornecedor
              <select name="supplier">
                <option value="">Todos</option>
                ${uniqueOptions('supplier')}
              </select>
            </label>

            <label>Fabricante
              <select name="manufacturer">
                <option value="">Todos</option>
                ${uniqueOptions('manufacturer')}
              </select>
            </label>

            <label>Status
              <select name="status">
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>

            <label>Texto livre<input name="term" placeholder="Nome, marca ou código" /></label>

            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">Aplicar</button>
            </div>
          </form>

          <div id="combined-report-result" style="margin-top:14px;">
            ${reportTable(
              ['Produto', 'Fornecedor', 'Fabricante', 'Qtd'],
              (state.products || []).slice(0, 8).map((item) => [
                item.name,
                item.supplier || '-',
                item.manufacturer || '-',
                item.quantity
              ])
            )}
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  return {
    render
  };
}