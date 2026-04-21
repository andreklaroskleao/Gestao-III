import { escapeHtml, showToast, bindSubmitGuard, bindAsyncButton } from './ui.js';

export function createSalesModule(ctx) {
  const {
    state,
    tabEls,
    refs,
    createDoc,
    updateByPath,
    currency,
    toNumber,
    formatDateTime,
    paymentMethods,
    clientsModule,
    printModule
  } = ctx;

  let filters = {
    term: '',
    paymentMethod: '',
    dateFrom: '',
    dateTo: ''
  };

  let saleFormState = {
    customerId: '',
    customerName: '',
    paymentMethod: paymentMethods?.[0] || 'Dinheiro',
    discount: 0,
    amountPaid: 0,
    notes: ''
  };

  let productSearchTerm = '';
  let isSavingSale = false;

  function getProducts() {
    return (state.products || []).filter((item) => {
      return item.deleted !== true
        && item.status !== 'inativo'
        && Number(item.quantity || 0) > 0;
    });
  }

  function getSalesRows() {
    return (state.sales || []).filter((item) => item.deleted !== true);
  }

  function getFilteredSalesRows() {
    return getSalesRows().filter((item) => {
      const haystack = [
        item.customerName,
        item.paymentMethod,
        item.cashierName,
        ...(item.items || []).map((p) => p.name)
      ].join(' ').toLowerCase();

      const createdDate = normalizeDate(item.createdAt);

      return (!filters.term || haystack.includes(filters.term.toLowerCase()))
        && (!filters.paymentMethod || String(item.paymentMethod || '') === filters.paymentMethod)
        && (!filters.dateFrom || !createdDate || createdDate >= filters.dateFrom)
        && (!filters.dateTo || !createdDate || createdDate <= filters.dateTo);
    });
  }

  function normalizeDate(value) {
    if (!value) return '';

    if (value?.toDate) {
      return formatDateKey(value.toDate());
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateKey(parsed);
    }

    return '';
  }

  function formatDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function getSummary() {
    const today = new Date();
    const todayKey = formatDateKey(today);
    const rows = getSalesRows();

    const todaySales = rows.filter((item) => normalizeDate(item.createdAt) === todayKey);
    const todayTotal = todaySales.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const monthTotal = rows.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const totalCount = rows.length;
    const ticket = totalCount ? monthTotal / totalCount : 0;

    return {
      todayCount: todaySales.length,
      todayTotal,
      totalCount,
      ticket
    };
  }

  function getCartRows() {
    return Array.isArray(state.cart) ? state.cart : [];
  }

  function getCartSubtotal() {
    return getCartRows().reduce((sum, item) => sum + Number(item.total || 0), 0);
  }

  function getCartDiscount() {
    return Number(saleFormState.discount || 0);
  }

  function getCartTotal() {
    return Math.max(0, getCartSubtotal() - getCartDiscount());
  }

  function getCartChange() {
    const paid = Number(saleFormState.amountPaid || 0);
    const total = getCartTotal();
    return Math.max(0, paid - total);
  }

  function getFilteredProducts() {
    const term = String(productSearchTerm || '').trim().toLowerCase();
    if (!term) return getProducts().slice(0, 30);

    return getProducts()
      .filter((item) => {
        const haystack = [
          item.name,
          item.barcode,
          item.brand,
          item.serialNumber,
          item.supplier
        ].join(' ').toLowerCase();

        return haystack.includes(term);
      })
      .slice(0, 30);
  }

  function addProductToCart(productId) {
    const product = getProducts().find((item) => item.id === productId);
    if (!product) return;

    const existing = getCartRows().find((item) => item.productId === productId);
    const currentQty = Number(existing?.quantity || 0);

    if (currentQty + 1 > Number(product.quantity || 0)) {
      showToast('Quantidade maior que o estoque disponível.', 'error');
      return;
    }

    if (existing) {
      existing.quantity += 1;
      existing.total = Number(existing.quantity || 0) * Number(existing.unitPrice || 0);
    } else {
      state.cart.push({
        productId: product.id,
        name: product.name || 'Produto',
        quantity: 1,
        unitPrice: Number(product.salePrice || 0),
        total: Number(product.salePrice || 0)
      });
    }

    render();
  }

  function updateCartItemQuantity(productId, nextQty) {
    const product = getProducts().find((item) => item.id === productId);
    if (!product) return;

    const row = getCartRows().find((item) => item.productId === productId);
    if (!row) return;

    const qty = Math.max(1, Number(nextQty || 1));
    if (qty > Number(product.quantity || 0)) {
      showToast('Quantidade maior que o estoque disponível.', 'error');
      return;
    }

    row.quantity = qty;
    row.total = qty * Number(row.unitPrice || 0);
    render();
  }

  function removeCartItem(productId) {
    state.cart = getCartRows().filter((item) => item.productId !== productId);
    render();
  }

  function clearCart() {
    state.cart = [];
    saleFormState.discount = 0;
    saleFormState.amountPaid = 0;
    saleFormState.notes = '';
    render();
  }

  async function finalizeSale() {
    if (isSavingSale) return;
    isSavingSale = true;

    try {
      const cart = getCartRows();
      if (!cart.length) {
        alert('Adicione pelo menos um produto.');
        return;
      }

      const total = getCartTotal();
      const amountPaid = Number(saleFormState.amountPaid || 0);

      if (amountPaid < total) {
        alert('O valor pago é menor que o total da venda.');
        return;
      }

      const payload = {
        customerId: saleFormState.customerId || '',
        customerName: saleFormState.customerName || 'Balcão',
        paymentMethod: saleFormState.paymentMethod || paymentMethods?.[0] || 'Dinheiro',
        discount: Number(saleFormState.discount || 0),
        subtotal: getCartSubtotal(),
        total,
        amountPaid,
        change: getCartChange(),
        notes: saleFormState.notes || '',
        items: cart.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          total: Number(item.total || 0)
        })),
        cashierName: state.currentUser?.fullName || '',
        deleted: false
      };

      const createdId = await createDoc(refs.sales, payload);

      for (const item of cart) {
        const product = (state.products || []).find((p) => p.id === item.productId);
        if (!product) continue;

        await updateByPath('products', item.productId, {
          quantity: Math.max(0, Number(product.quantity || 0) - Number(item.quantity || 0))
        });
      }

      printModule.printSaleReceipt?.({
        ...payload,
        id: createdId
      });

      showToast('Venda finalizada com sucesso.', 'success');
      clearCart();
      saleFormState.customerId = '';
      saleFormState.customerName = '';
      saleFormState.paymentMethod = paymentMethods?.[0] || 'Dinheiro';

      render();
    } finally {
      isSavingSale = false;
    }
  }

  function openClientPicker() {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="sale-client-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Selecionar cliente</h2>
            <button class="btn btn-secondary" type="button" id="sale-client-modal-close">Fechar</button>
          </div>
          <div id="sale-client-picker-host"></div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#sale-client-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#sale-client-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'sale-client-modal-backdrop') {
        closeModal();
      }
    });

    clientsModule.renderClientPicker?.({
      target: '#sale-client-picker-host',
      onSelect: (client) => {
        saleFormState.customerId = client.id || '';
        saleFormState.customerName = client.name || '';
        closeModal();
        render();
      }
    });
  }

  function clearSelectedClient() {
    saleFormState.customerId = '';
    saleFormState.customerName = '';
    render();
  }

  function openSaleDetailsModal(saleId) {
    const row = getSalesRows().find((item) => item.id === saleId);
    if (!row) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="sale-details-modal-backdrop">
        <div class="modal-card sale-details-modal-card">
          <div class="section-header">
            <h2>Detalhes da venda</h2>
            <button class="btn btn-secondary" type="button" id="sale-details-modal-close">Fechar</button>
          </div>

          <div class="sale-details-grid">
            <div class="sale-details-box"><span>Cliente</span><strong>${escapeHtml(row.customerName || 'Balcão')}</strong></div>
            <div class="sale-details-box"><span>Pagamento</span><strong>${escapeHtml(row.paymentMethod || '-')}</strong></div>
            <div class="sale-details-box"><span>Data</span><strong>${escapeHtml(formatDateTime(row.createdAt))}</strong></div>
            <div class="sale-details-box"><span>Subtotal</span><strong>${currency(row.subtotal || 0)}</strong></div>
            <div class="sale-details-box"><span>Desconto</span><strong>${currency(row.discount || 0)}</strong></div>
            <div class="sale-details-box"><span>Total</span><strong>${currency(row.total || 0)}</strong></div>
          </div>

          <div class="section-header" style="margin-top:16px;">
            <h3>Itens</h3>
          </div>

          <div class="stack-list list-scroll">
            ${(row.items || []).map((item) => `
              <div class="sale-item-card">
                <div class="sale-item-title">${escapeHtml(item.name || '-')}</div>
                <div class="sale-item-meta">
                  <span>Quantidade: ${Number(item.quantity || 0)}</span>
                  <span>Unitário: ${currency(item.unitPrice || 0)}</span>
                  <span>Total: ${currency(item.total || 0)}</span>
                </div>
              </div>
            `).join('') || '<div class="empty-state">Sem itens.</div>'}
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#sale-details-modal-close')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#sale-details-modal-backdrop')?.addEventListener('click', (event) => {
      if (event.target.id === 'sale-details-modal-backdrop') {
        closeModal();
      }
    });
  }

  function renderProductResults() {
    const rows = getFilteredProducts();

    return `
      <div class="stack-list list-scroll">
        ${rows.map((item) => `
          <button class="list-item search-result-item" type="button" data-sale-add-product="${item.id}">
            <strong>${escapeHtml(item.name || '-')}</strong>
            <span>${escapeHtml(item.barcode || 'Sem código')} · Estoque: ${Number(item.quantity || 0)} · ${currency(item.salePrice || 0)}</span>
          </button>
        `).join('') || '<div class="empty-state">Nenhum produto encontrado.</div>'}
      </div>
    `;
  }

  function renderCart() {
    const rows = getCartRows();

    if (!rows.length) {
      return '<div class="empty-state">Nenhum item adicionado.</div>';
    }

    return `
      <div class="cart-list card-scroll-y">
        ${rows.map((item) => `
          <div class="cart-item">
            <div class="cart-line">
              <strong>${escapeHtml(item.name || '-')}</strong>
              <button class="icon-action-btn" type="button" data-sale-remove-item="${item.productId}" title="Remover" aria-label="Remover">🗑️</button>
            </div>

            <div class="cart-line">
              <span>${currency(item.unitPrice || 0)}</span>
              <div class="cart-actions">
                <button class="icon-action-btn" type="button" data-sale-qty-down="${item.productId}" aria-label="Diminuir">-</button>
                <strong>${Number(item.quantity || 0)}</strong>
                <button class="icon-action-btn" type="button" data-sale-qty-up="${item.productId}" aria-label="Aumentar">+</button>
              </div>
            </div>

            <div class="summary-line">
              <span>Total do item</span>
              <strong>${currency(item.total || 0)}</strong>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderHistoryTable() {
    const rows = getFilteredSalesRows();

    return `
      <div class="table-wrap scroll-dual">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Cliente</th>
              <th>Pagamento</th>
              <th>Total</th>
              <th>Itens</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(formatDateTime(row.createdAt))}</td>
                <td>${escapeHtml(row.customerName || 'Balcão')}</td>
                <td>${escapeHtml(row.paymentMethod || '-')}</td>
                <td>${currency(row.total || 0)}</td>
                <td>${(row.items || []).length}</td>
                <td>
                  <div class="actions-inline-compact">
                    <button class="icon-action-btn info" type="button" data-sale-view="${row.id}" title="Detalhes" aria-label="Detalhes">👁️</button>
                  </div>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6">Nenhuma venda encontrada.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  function bindEvents() {
    const searchInput = tabEls.sales.querySelector('#sale-product-search');
    searchInput?.addEventListener('input', (event) => {
      productSearchTerm = event.currentTarget.value || '';
      tabEls.sales.querySelector('#sale-product-results').innerHTML = renderProductResults();
      bindProductResultEvents();
    });

    bindAsyncButton(tabEls.sales.querySelector('#sale-select-client-btn'), async () => {
      openClientPicker();
    }, { busyLabel: 'Abrindo...' });

    bindAsyncButton(tabEls.sales.querySelector('#sale-clear-client-btn'), async () => {
      clearSelectedClient();
    }, { busyLabel: 'Limpando...' });

    tabEls.sales.querySelector('#sale-payment-method')?.addEventListener('change', (event) => {
      saleFormState.paymentMethod = event.currentTarget.value || paymentMethods?.[0] || 'Dinheiro';
    });

    tabEls.sales.querySelector('#sale-discount')?.addEventListener('input', (event) => {
      saleFormState.discount = toNumber(event.currentTarget.value);
      renderSummaryOnly();
    });

    tabEls.sales.querySelector('#sale-amount-paid')?.addEventListener('input', (event) => {
      saleFormState.amountPaid = toNumber(event.currentTarget.value);
      renderSummaryOnly();
    });

    tabEls.sales.querySelector('#sale-notes')?.addEventListener('input', (event) => {
      saleFormState.notes = event.currentTarget.value || '';
    });

    bindAsyncButton(tabEls.sales.querySelector('#sale-clear-cart-btn'), async () => {
      clearCart();
    }, { busyLabel: 'Limpando...' });

    bindAsyncButton(tabEls.sales.querySelector('#sale-finish-btn'), async () => {
      await finalizeSale();
    }, { busyLabel: 'Finalizando...' });

    tabEls.sales.querySelector('#sales-filter-apply')?.addEventListener('click', () => {
      filters.term = tabEls.sales.querySelector('#sales-filter-term')?.value || '';
      filters.paymentMethod = tabEls.sales.querySelector('#sales-filter-payment')?.value || '';
      filters.dateFrom = tabEls.sales.querySelector('#sales-filter-date-from')?.value || '';
      filters.dateTo = tabEls.sales.querySelector('#sales-filter-date-to')?.value || '';
      renderHistoryOnly();
    });

    bindAsyncButton(tabEls.sales.querySelector('#sales-filter-clear'), async () => {
      filters = {
        term: '',
        paymentMethod: '',
        dateFrom: '',
        dateTo: ''
      };
      renderHistoryOnly();
      const termInput = tabEls.sales.querySelector('#sales-filter-term');
      const paymentInput = tabEls.sales.querySelector('#sales-filter-payment');
      const fromInput = tabEls.sales.querySelector('#sales-filter-date-from');
      const toInput = tabEls.sales.querySelector('#sales-filter-date-to');
      if (termInput) termInput.value = '';
      if (paymentInput) paymentInput.value = '';
      if (fromInput) fromInput.value = '';
      if (toInput) toInput.value = '';
    }, { busyLabel: 'Limpando...' });

    bindProductResultEvents();
    bindCartEvents();
    bindHistoryEvents();
  }

  function bindProductResultEvents() {
    tabEls.sales.querySelectorAll('[data-sale-add-product]').forEach((btn) => {
      btn.addEventListener('click', () => {
        addProductToCart(btn.dataset.saleAddProduct);
      });
    });
  }

  function bindCartEvents() {
    tabEls.sales.querySelectorAll('[data-sale-remove-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeCartItem(btn.dataset.saleRemoveItem);
      });
    });

    tabEls.sales.querySelectorAll('[data-sale-qty-down]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = getCartRows().find((item) => item.productId === btn.dataset.saleQtyDown);
        if (!row) return;
        if (Number(row.quantity || 0) <= 1) {
          removeCartItem(btn.dataset.saleQtyDown);
          return;
        }
        updateCartItemQuantity(btn.dataset.saleQtyDown, Number(row.quantity || 0) - 1);
      });
    });

    tabEls.sales.querySelectorAll('[data-sale-qty-up]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = getCartRows().find((item) => item.productId === btn.dataset.saleQtyUp);
        if (!row) return;
        updateCartItemQuantity(btn.dataset.saleQtyUp, Number(row.quantity || 0) + 1);
      });
    });
  }

  function bindHistoryEvents() {
    tabEls.sales.querySelectorAll('[data-sale-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openSaleDetailsModal(btn.dataset.saleView);
      });
    });
  }

  function renderSummaryOnly() {
    const host = tabEls.sales.querySelector('#sale-summary-box');
    if (!host) return;

    host.innerHTML = `
      <div class="summary-line"><span>Subtotal</span><strong>${currency(getCartSubtotal())}</strong></div>
      <div class="summary-line"><span>Desconto</span><strong>${currency(getCartDiscount())}</strong></div>
      <div class="summary-line total"><span>Total</span><strong>${currency(getCartTotal())}</strong></div>
      <div class="summary-line"><span>Pago</span><strong>${currency(Number(saleFormState.amountPaid || 0))}</strong></div>
      <div class="summary-line"><span>Troco</span><strong>${currency(getCartChange())}</strong></div>
    `;
  }

  function renderHistoryOnly() {
    const host = tabEls.sales.querySelector('#sales-history-host');
    if (!host) return;
    host.innerHTML = renderHistoryTable();
    bindHistoryEvents();
  }

  function render() {
    const summary = getSummary();

    tabEls.sales.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card"><span>Vendas hoje</span><strong>${summary.todayCount}</strong></div>
          <div class="metric-card"><span>Total hoje</span><strong>${currency(summary.todayTotal)}</strong></div>
          <div class="metric-card"><span>Total de vendas</span><strong>${summary.totalCount}</strong></div>
          <div class="metric-card"><span>Ticket médio</span><strong>${currency(summary.ticket)}</strong></div>
        </div>

        <div class="sales-layout">
          <div class="panel">
            <div class="section-header">
              <h2>Nova venda</h2>
              <span class="muted">Campo de busca ampliado no desktop</span>
            </div>

            <div class="sales-search-row search-row sales-search" style="margin-bottom:14px;">
              <input
                id="sale-product-search"
                type="search"
                placeholder="Digite nome do produto ou código de barras"
                value="${escapeHtml(productSearchTerm)}"
                autocomplete="off"
              />
              <button class="btn btn-secondary" type="button" id="sale-select-client-btn">Selecionar cliente</button>
              <button class="btn btn-secondary" type="button" id="sale-clear-client-btn">Limpar cliente</button>
            </div>

            <div class="summary-box" style="margin-bottom:14px;">
              <div class="summary-line">
                <span>Cliente</span>
                <strong>${escapeHtml(saleFormState.customerName || 'Balcão')}</strong>
              </div>
            </div>

            <div id="sale-product-results">
              ${renderProductResults()}
            </div>
          </div>

          <div class="panel sticky-summary">
            <div class="section-header">
              <h2>Carrinho</h2>
              <span class="muted">${getCartRows().length} item(ns)</span>
            </div>

            ${renderCart()}

            <div class="form-grid" style="margin-top:14px;">
              <label>Pagamento
                <select id="sale-payment-method">
                  ${(paymentMethods || ['Dinheiro']).map((item) => `
                    <option value="${escapeHtml(item)}" ${saleFormState.paymentMethod === item ? 'selected' : ''}>${escapeHtml(item)}</option>
                  `).join('')}
                </select>
              </label>

              <label>Desconto
                <input id="sale-discount" type="number" step="0.01" min="0" value="${Number(saleFormState.discount || 0)}" />
              </label>

              <label>Valor pago
                <input id="sale-amount-paid" type="number" step="0.01" min="0" value="${Number(saleFormState.amountPaid || 0)}" />
              </label>

              <label style="grid-column:1 / -1;">Observações
                <textarea id="sale-notes">${escapeHtml(saleFormState.notes || '')}</textarea>
              </label>
            </div>

            <div class="summary-box" id="sale-summary-box" style="margin-top:14px;">
              <div class="summary-line"><span>Subtotal</span><strong>${currency(getCartSubtotal())}</strong></div>
              <div class="summary-line"><span>Desconto</span><strong>${currency(getCartDiscount())}</strong></div>
              <div class="summary-line total"><span>Total</span><strong>${currency(getCartTotal())}</strong></div>
              <div class="summary-line"><span>Pago</span><strong>${currency(Number(saleFormState.amountPaid || 0))}</strong></div>
              <div class="summary-line"><span>Troco</span><strong>${currency(getCartChange())}</strong></div>
            </div>

            <div class="form-actions" style="margin-top:14px;">
              <button class="btn btn-primary" type="button" id="sale-finish-btn">Finalizar venda</button>
              <button class="btn btn-secondary" type="button" id="sale-clear-cart-btn">Limpar carrinho</button>
            </div>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Histórico de vendas</h2>
            <span class="muted">${getFilteredSalesRows().length} resultado(s)</span>
          </div>

          <div class="search-row sales-history-filters" style="margin-bottom:14px;">
            <input id="sales-filter-term" placeholder="Buscar por cliente, pagamento ou item" value="${escapeHtml(filters.term)}" />
            <select id="sales-filter-payment">
              <option value="">Todos os pagamentos</option>
              ${(paymentMethods || ['Dinheiro']).map((item) => `
                <option value="${escapeHtml(item)}" ${filters.paymentMethod === item ? 'selected' : ''}>${escapeHtml(item)}</option>
              `).join('')}
            </select>
            <input id="sales-filter-date-from" type="date" value="${filters.dateFrom}" />
            <input id="sales-filter-date-to" type="date" value="${filters.dateTo}" />
            <button class="btn btn-secondary" type="button" id="sales-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="sales-filter-clear">Limpar</button>
          </div>

          <div id="sales-history-host">
            ${renderHistoryTable()}
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