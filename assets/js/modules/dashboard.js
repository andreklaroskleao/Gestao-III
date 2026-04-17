import { escapeHtml } from './ui.js';

export function createDashboardModule(ctx) {
  const { state, tabEls, currency, formatDate, formatDateTime } = ctx;

  function renderSimpleList(items) {
    if (!items.length) {
      return '<div class="empty-state">Nada para exibir.</div>';
    }

    return `
      <div class="stack-list slim-list">
        ${items.map((text) => `
          <div class="list-item">
            <strong>${escapeHtml(text)}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  function getLowStockProducts() {
    const threshold = Number(state.settings.lowStockThreshold || 5);

    return (state.products || []).filter((item) => {
      return item.status !== 'inativo' && Number(item.quantity || 0) <= threshold;
    });
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
      .map((item) => ({ name: item.name, qty: soldMap.get(item.name) || 0 }))
      .sort((a, b) => a.qty - b.qty)
      .slice(0, limit);
  }

  function getSalesDate(dateLike) {
    const date = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike || 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  function getTodaySales() {
    const today = new Date();

    return (state.sales || []).filter((sale) => {
      const saleDate = getSalesDate(sale.createdAt);
      return saleDate && isSameDay(saleDate, today);
    });
  }

  function getMonthSales() {
    const today = new Date();

    return (state.sales || []).filter((sale) => {
      const saleDate = getSalesDate(sale.createdAt);
      return saleDate
        && saleDate.getFullYear() === today.getFullYear()
        && saleDate.getMonth() === today.getMonth();
    });
  }

  function getTodayDeliveries() {
    const today = new Date();

    return (state.deliveries || []).filter((item) => {
      const raw = item.scheduledAt?.toDate ? item.scheduledAt.toDate() : new Date(item.scheduledAt || 0);
      return !Number.isNaN(raw.getTime()) && isSameDay(raw, today);
    });
  }

  function getPendingDeliveries() {
    return (state.deliveries || []).filter((item) => {
      return ['Agendado', 'Em rota', 'Reagendado', 'Recolhimento'].includes(item.status);
    });
  }

  function getLast7DaysSales() {
    const today = new Date();
    const result = [];

    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(today);
      day.setHours(0, 0, 0, 0);
      day.setDate(today.getDate() - i);

      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + 1);

      const total = (state.sales || []).reduce((sum, sale) => {
        const saleDate = getSalesDate(sale.createdAt);
        if (!saleDate) return sum;

        return saleDate >= day && saleDate < nextDay
          ? sum + Number(sale.total || 0)
          : sum;
      }, 0);

      result.push({
        label: day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        total
      });
    }

    return result;
  }

  function renderMiniChart(data) {
    const max = Math.max(...data.map((item) => item.total), 1);
    const highestIndex = data.findIndex((item) => item.total === max);

    function shortCurrency(value) {
      const amount = Number(value || 0);

      if (amount >= 1000) {
        return `R$ ${(amount / 1000).toFixed(1).replace('.', ',')}k`;
      }

      return amount.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    }

    return `
      <div class="dashboard-sales-7d-chart">
        ${data.map((item, index) => {
          const height = item.total <= 0 ? 8 : Math.max(12, (item.total / max) * 180);
          const isHighest = index === highestIndex;
          const labelValue = shortCurrency(item.total);

          return `
            <div class="dashboard-sales-7d-col">
              <div class="dashboard-sales-7d-value ${isHighest ? 'is-highlight' : ''}">
                ${labelValue}
              </div>

              <div class="dashboard-sales-7d-bar-wrap">
                <div
                  class="dashboard-sales-7d-bar ${isHighest ? 'is-highlight' : ''}"
                  style="height:${height}px;"
                  title="${labelValue} em ${item.label}"
                ></div>
              </div>

              <div class="dashboard-sales-7d-label">
                ${item.label}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function getFinancialSummary() {
    const accounts = state.accountsReceivable || [];
    const cashSessions = state.cashSessions || [];

    const openReceivables = accounts.reduce((sum, item) => sum + Number(item.openAmount || 0), 0);
    const totalReceived = accounts.reduce((sum, item) => sum + Number(item.receivedAmount || 0), 0);

    const overdueReceivables = accounts.reduce((sum, item) => {
      if (!item.dueDate || Number(item.openAmount || 0) <= 0) return sum;

      const due = new Date(`${item.dueDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return due < today ? sum + Number(item.openAmount || 0) : sum;
    }, 0);

    const dueSoonCount = accounts.filter((item) => {
      if (!item.dueDate || Number(item.openAmount || 0) <= 0) return false;

      const due = new Date(`${item.dueDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
      return diff >= 0 && diff <= 3;
    }).length;

    const latestClosedCash = [...cashSessions]
      .filter((item) => item.status === 'closed')
      .sort((a, b) => {
        const da = a.closedAt?.toDate ? a.closedAt.toDate().getTime() : new Date(a.closedAt || 0).getTime();
        const db = b.closedAt?.toDate ? b.closedAt.toDate().getTime() : new Date(b.closedAt || 0).getTime();
        return db - da;
      })[0];

    return {
      openReceivables,
      totalReceived,
      overdueReceivables,
      dueSoonCount,
      latestCashClosed: Number(latestClosedCash?.closingAmount || 0),
      latestCashDifference: Number(latestClosedCash?.difference || 0)
    };
  }

  function getDueSoonList(limit = 5) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (state.accountsReceivable || [])
      .filter((item) => Number(item.openAmount || 0) > 0 && item.dueDate)
      .map((item) => {
        const due = new Date(`${item.dueDate}T00:00:00`);
        const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
        return { ...item, diff };
      })
      .filter((item) => item.diff <= 3)
      .sort((a, b) => a.diff - b.diff)
      .slice(0, limit);
  }

  function renderLatestSales() {
    const rows = (state.sales || []).slice(0, 6);

    if (!rows.length) {
      return '<div class="empty-state">Nenhuma venda registrada.</div>';
    }

    return `
      <div class="stack-list slim-list">
        ${rows.map((sale) => `
          <div class="list-item">
            <strong>${escapeHtml(sale.customerName || 'Venda balcão')}</strong>
            <span>${currency(sale.total)} · ${formatDateTime(sale.createdAt)} · ${escapeHtml(sale.paymentMethod || '-')}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function render() {
    const lowStock = getLowStockProducts();
    const todaySales = getTodaySales();
    const monthSales = getMonthSales();
    const pendingDeliveries = getPendingDeliveries();
    const todayDeliveries = getTodayDeliveries();

    const totalStock = (state.products || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const todayRevenue = todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const monthRevenue = monthSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const todayTicketAverage = todaySales.length ? todayRevenue / todaySales.length : 0;

    const sales7Days = getLast7DaysSales();
    const financial = getFinancialSummary();
    const dueSoonList = getDueSoonList();

    tabEls.dashboard.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card"><span>Faturamento de hoje</span><strong>${currency(todayRevenue)}</strong></div>
          <div class="metric-card"><span>Faturamento do mês</span><strong>${currency(monthRevenue)}</strong></div>
          <div class="metric-card"><span>Vendas de hoje</span><strong>${todaySales.length}</strong></div>
          <div class="metric-card"><span>Ticket médio de hoje</span><strong>${currency(todayTicketAverage)}</strong></div>
          <div class="metric-card"><span>Itens em estoque</span><strong>${totalStock}</strong></div>
          <div class="metric-card"><span>Alertas de estoque</span><strong>${lowStock.length}</strong></div>
          <div class="metric-card"><span>Entregas pendentes</span><strong>${pendingDeliveries.length}</strong></div>
          <div class="metric-card"><span>Entregas de hoje</span><strong>${todayDeliveries.length}</strong></div>
          <div class="metric-card"><span>Contas em aberto</span><strong>${currency(financial.openReceivables)}</strong></div>
          <div class="metric-card"><span>Total recebido</span><strong>${currency(financial.totalReceived)}</strong></div>
          <div class="metric-card"><span>Contas vencidas</span><strong>${currency(financial.overdueReceivables)}</strong></div>
          <div class="metric-card"><span>Vencendo em até 3 dias</span><strong>${financial.dueSoonCount}</strong></div>
        </div>

        <div class="grid-2">
          <div class="table-card">
            <div class="section-header">
              <h2>Vendas dos últimos 7 dias</h2>
              <span class="muted">Visão rápida de faturamento</span>
            </div>
            ${renderMiniChart(sales7Days)}
          </div>

          <div class="table-card">
            <div class="section-header">
              <h2>Últimas vendas</h2>
              <span class="muted">Resumo em tempo real</span>
            </div>
            ${renderLatestSales()}
          </div>
        </div>

        <div class="grid-2">
          <div class="table-card">
            <div class="section-header">
              <h2>Entregas e recolhimentos</h2>
              <span class="muted">${pendingDeliveries.length} em aberto</span>
            </div>
            <div class="stack-list slim-list">
              ${pendingDeliveries.slice(0, 6).map((item) => `
                <div class="list-item">
                  <strong>${escapeHtml(item.customerName || item.clientName || '-')}</strong>
                  <span>${escapeHtml(item.address || '-')} · ${formatDate(item.scheduledAt)} ${escapeHtml(item.scheduledTime || item.time || '')} · ${escapeHtml(item.status || '-')}</span>
                </div>
              `).join('') || '<div class="empty-state">Sem atendimentos pendentes.</div>'}
            </div>
          </div>

          <div class="table-card">
            <div class="section-header">
              <h2>Resumo financeiro</h2>
              <span class="muted">Último caixa fechado: ${currency(financial.latestCashClosed)}</span>
            </div>
            <div class="kpi-inline">
              <div class="compact-card"><span class="muted">Último caixa</span><strong>${currency(financial.latestCashClosed)}</strong></div>
              <div class="compact-card"><span class="muted">Diferença</span><strong>${currency(financial.latestCashDifference)}</strong></div>
              <div class="compact-card"><span class="muted">Contas vencendo</span><strong>${financial.dueSoonCount}</strong></div>
            </div>
          </div>
        </div>

        <div class="grid-2">
          <div class="table-card">
            <div class="section-header">
              <h2>Produtos com estoque baixo</h2>
            </div>
            ${renderSimpleList(lowStock.map((item) => `${item.name} · ${item.quantity} un.`))}
          </div>

          <div class="table-card">
            <div class="section-header">
              <h2>Mais vendidos</h2>
            </div>
            ${renderSimpleList(getTopSelling().map((item) => `${item.name} · ${item.qty} un.`))}
          </div>
        </div>

        <div class="grid-2">
          <div class="table-card">
            <div class="section-header">
              <h2>Baixa saída</h2>
            </div>
            ${renderSimpleList(getLowSelling().map((item) => `${item.name} · ${item.qty} un.`))}
          </div>

          <div class="table-card">
            <div class="section-header">
              <h2>Contas vencendo</h2>
            </div>
            ${renderSimpleList(dueSoonList.map((item) => `${item.clientName || 'Cliente'} · ${currency(item.openAmount || 0)} · ${item.dueDate}`))}
          </div>
        </div>
      </div>
    `;
  }

  return {
    render,
    getLowStockProducts
  };
}