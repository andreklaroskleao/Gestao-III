import { escapeHtml, showToast, bindAsyncButton } from './ui.js';

export function createSalesModule(ctx) {
  const {
    state,
    refs,
    createDoc,
    updateByPath,
    tabEls,
    currency,
    toNumber,
    formatDateTime,
    paymentMethods,
    clientsModule,
    printModule
  } = ctx;

  let streamRef = null;
  let scanTimer = null;
  let barcodeTimer = null;
  let zxingReader = null;
  let cameraRunning = false;
  let saleFilters = { customer: '', paymentMethod: '', dateFrom: '', dateTo: '' };
  let keyboardBound = false;
  let isFinishingSale = false;

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Opera Mini/i.test(navigator.userAgent)
      || window.matchMedia('(max-width: 768px)').matches;
  }

  function focusSearchInput() {
    const input = tabEls.sales?.querySelector('#sale-product-search');
    if (input) {
      input.focus();
      input.select?.();
    }
  }

  function clearCartWithFeedback() {
    state.cart = [];
    render();
    showToast('Carrinho limpo.', 'info');
  }

  function calculateCartTotal() {
    const discountInput = tabEls.sales?.querySelector('input[name="discount"]');
    const paidInput = tabEls.sales?.querySelector('input[name="amountPaid"]');

    const subtotal = state.cart.reduce((sum, item) => sum + (Number(item.salePrice) * Number(item.quantity)), 0);
    const discount = toNumber(discountInput?.value || 0);
    const total = Math.max(0, subtotal - discount);
    const amountPaid = toNumber(paidInput?.value || 0);
    const change = Math.max(0, amountPaid - total);

    return { subtotal, discount, total, amountPaid, change };
  }

  function updateSaleSummary() {
    const { subtotal, discount, total, change } = calculateCartTotal();

    tabEls.sales.querySelector('#sale-subtotal').textContent = currency(subtotal);
    tabEls.sales.querySelector('#sale-discount-view').textContent = currency(discount);
    tabEls.sales.querySelector('#sale-total').textContent = currency(total);
    tabEls.sales.querySelector('#sale-change').textContent = currency(change);
    tabEls.sales.querySelector('#sale-items-count').textContent = String(state.cart.length);
  }

  function normalizeSaleForPrint(sale) {
    return {
      customerName: sale.customerName || '',
      paymentMethod: sale.paymentMethod || '',
      subtotal: Number(sale.subtotal || 0),
      discount: Number(sale.discount || 0),
      total: Number(sale.total || 0),
      amountPaid: Number(sale.amountPaid || 0),
      change: Number(sale.change || 0),
      items: Array.isArray(sale.items)
        ? sale.items.map((item) => ({
            productId: item.productId || '',
            name: item.name || '',
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || 0),
            total: Number(item.total || 0)
          }))
        : []
    };
  }

  function findProductByBarcode(barcode) {
    const code = String(barcode || '').trim();
    if (!code) return null;

    return (state.products || []).find((item) =>
      item.deleted !== true && String(item.barcode || '').trim() === code
    ) || null;
  }

  function addProductToCart(productId) {
    const product = (state.products || []).find((item) => item.id === productId && item.deleted !== true);
    if (!product) return;

    const existing = state.cart.find((item) => item.id === productId);
    const currentQty = Number(existing?.quantity || 0);
    const stockQty = Number(product.quantity || 0);

    if (currentQty + 1 > stockQty) {
      showToast('Quantidade maior que o estoque disponível.', 'error');
      return;
    }

    if (existing) {
      existing.quantity += 1;
    } else {
      state.cart.push({
        id: product.id,
        name: product.name,
        salePrice: Number(product.salePrice || 0),
        quantity: 1,
        barcode: product.barcode
      });
    }

    render();
    showToast('Produto adicionado à venda.', 'success');
  }

  function changeCartQuantity(productId, delta) {
    const row = state.cart.find((item) => item.id === productId);
    const product = (state.products || []).find((item) => item.id === productId && item.deleted !== true);

    if (!row || !product) return;

    const nextQty = Number(row.quantity || 0) + Number(delta || 0);
    const stockQty = Number(product.quantity || 0);

    if (nextQty <= 0) {
      state.cart = state.cart.filter((item) => item.id !== productId);
      render();
      return;
    }

    if (nextQty > stockQty) {
      showToast('Quantidade maior que o estoque disponível.', 'error');
      return;
    }

    row.quantity = nextQty;
    render();
  }

  function handleNotFoundBarcode(value) {
    const input = tabEls.sales.querySelector('#sale-product-search');
    if (input) {
      input.value = value || '';
      input.focus();
      input.select?.();
    }
    handleSaleSearch();
    showToast('Produto não cadastrado.', 'error');
  }

  function tryAddProductByBarcode(barcode, showWarning = true) {
    const normalized = String(barcode || '').trim();
    const product = findProductByBarcode(normalized);

    if (!product) {
      if (showWarning) handleNotFoundBarcode(normalized);
      return false;
    }

    addProductToCart(product.id);

    const input = tabEls.sales.querySelector('#sale-product-search');
    if (input) {
      input.value = '';
      input.focus();
    }

    return true;
  }

  function handleSaleSearch() {
    const input = tabEls.sales.querySelector('#sale-product-search');
    const resultsEl = tabEls.sales.querySelector('#sale-search-results');
    const term = String(input?.value || '').trim().toLowerCase();

    if (!resultsEl) return;

    if (!term) {
      resultsEl.innerHTML = `
        <div class="empty-state">
          <strong>Pesquise um produto</strong>
          <span>Digite nome ou código de barras para listar resultados.</span>
        </div>
      `;
      return;
    }

    const results = (state.products || [])
      .filter((product) =>
        product.deleted !== true
        && product.status !== 'inativo'
        && [product.name, product.barcode, product.brand, product.supplier].join(' ').toLowerCase().includes(term)
      )
      .slice(0, 8);

    resultsEl.innerHTML = results.map((product) => `
      <div class="list-item">
        <strong>${escapeHtml(product.name)}</strong>
        <span>${escapeHtml(product.barcode || 'Sem código')} · Estoque: ${product.quantity} · ${currency(product.salePrice || 0)}</span>
        <div class="form-actions">
          <button class="btn btn-secondary" type="button" data-add-product="${product.id}">Adicionar</button>
        </div>
      </div>
    `).join('') || `
      <div class="empty-state">
        <strong>Nenhum produto encontrado</strong>
        <span>Refine sua pesquisa.</span>
      </div>
    `;

    resultsEl.querySelectorAll('[data-add-product]').forEach((btn) => {
      btn.addEventListener('click', () => addProductToCart(btn.dataset.addProduct));
    });
  }

  function renderCart() {
    const cartEl = tabEls.sales.querySelector('#sale-cart-items');

    if (!cartEl) return;

    if (!state.cart.length) {
      cartEl.innerHTML = `
        <div class="empty-state">
          <strong>Carrinho vazio</strong>
          <span>Pesquise um produto para adicionar.</span>
        </div>
      `;
      return;
    }

    cartEl.innerHTML = state.cart.map((item) => `
      <div class="cart-item">
        <div class="cart-line">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${currency(Number(item.salePrice || 0))}</span>
        </div>

        <div class="cart-line">
          <div class="cart-actions">
            <button class="icon-action-btn" type="button" data-cart-decrease="${item.id}" aria-label="Diminuir">−</button>
            <strong>${Number(item.quantity || 0)}</strong>
            <button class="icon-action-btn" type="button" data-cart-increase="${item.id}" aria-label="Aumentar">+</button>
          </div>

          <button class="icon-action-btn" type="button" data-cart-remove="${item.id}" aria-label="Remover">🗑️</button>
        </div>
      </div>
    `).join('');

    cartEl.querySelectorAll('[data-cart-decrease]').forEach((btn) => {
      btn.addEventListener('click', () => changeCartQuantity(btn.dataset.cartDecrease, -1));
    });

    cartEl.querySelectorAll('[data-cart-increase]').forEach((btn) => {
      btn.addEventListener('click', () => changeCartQuantity(btn.dataset.cartIncrease, 1));
    });

    cartEl.querySelectorAll('[data-cart-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.cart = state.cart.filter((item) => item.id !== btn.dataset.cartRemove);
        render();
      });
    });
  }

  function renderHistory() {
    const historyEl = tabEls.sales.querySelector('#sales-history-table');
    if (!historyEl) return;

    const rows = (state.sales || []).filter((sale) => {
      if (sale.deleted === true) return false;

      const customer = String(sale.customerName || '').toLowerCase();
      const paymentMethod = String(sale.paymentMethod || '');
      const created = sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt || 0);
      const createdKey = Number.isNaN(created.getTime()) ? '' : `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;

      return (!saleFilters.customer || customer.includes(saleFilters.customer.toLowerCase()))
        && (!saleFilters.paymentMethod || paymentMethod === saleFilters.paymentMethod)
        && (!saleFilters.dateFrom || !createdKey || createdKey >= saleFilters.dateFrom)
        && (!saleFilters.dateTo || !createdKey || createdKey <= saleFilters.dateTo);
    });

    historyEl.innerHTML = rows.map((sale) => `
      <tr>
        <td>${escapeHtml(formatDateTime(sale.createdAt))}</td>
        <td>${escapeHtml(sale.customerName || 'Balcão')}</td>
        <td>${escapeHtml(sale.paymentMethod || '-')}</td>
        <td>${currency(sale.total || 0)}</td>
        <td>${Array.isArray(sale.items) ? sale.items.length : 0}</td>
        <td>
          <div class="actions-inline-compact">
            <button class="icon-action-btn" type="button" data-print-sale="${sale.id}" aria-label="Imprimir">🖨️</button>
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6">Nenhuma venda encontrada.</td></tr>';

    historyEl.querySelectorAll('[data-print-sale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sale = (state.sales || []).find((item) => item.id === btn.dataset.printSale);
        if (!sale) return;
        printModule.printSaleReceipt(normalizeSaleForPrint(sale));
      });
    });
  }

  async function finishSale() {
    if (isFinishingSale) return;
    isFinishingSale = true;

    try {
      if (!state.cart.length) {
        alert('Adicione pelo menos um produto à venda.');
        return;
      }

      const paymentMethod = tabEls.sales.querySelector('#sale-payment-method')?.value || 'Dinheiro';
      const notes = tabEls.sales.querySelector('textarea[name="notes"]')?.value || '';
      const { subtotal, discount, total, amountPaid, change } = calculateCartTotal();

      if (amountPaid < total) {
        alert('O valor pago é menor que o total da venda.');
        return;
      }

      const items = state.cart.map((item) => ({
        productId: item.id,
        name: item.name,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.salePrice || 0),
        total: Number(item.salePrice || 0) * Number(item.quantity || 0)
      }));

      const payload = {
        customerName: tabEls.sales.querySelector('#sale-customer-name')?.value || 'Balcão',
        paymentMethod,
        subtotal,
        discount,
        total,
        amountPaid,
        change,
        notes,
        items,
        cashierName: state.currentUser?.fullName || '',
        deleted: false
      };

      const saleId = await createDoc(refs.sales, payload);

      for (const item of items) {
        const product = (state.products || []).find((row) => row.id === item.productId);
        if (!product) continue;

        await updateByPath('products', item.productId, {
          quantity: Math.max(0, Number(product.quantity || 0) - Number(item.quantity || 0))
        });
      }

      printModule.printSaleReceipt({
        ...payload,
        id: saleId
      });

      state.cart = [];
      const searchInput = tabEls.sales.querySelector('#sale-product-search');
      if (searchInput) searchInput.value = '';
      tabEls.sales.querySelector('#sale-customer-name').value = 'Balcão';
      tabEls.sales.querySelector('#sale-payment-method').value = paymentMethods?.[0] || 'Dinheiro';
      tabEls.sales.querySelector('input[name="discount"]').value = '0';
      tabEls.sales.querySelector('input[name="amountPaid"]').value = '0';
      tabEls.sales.querySelector('textarea[name="notes"]').value = '';

      showToast('Venda finalizada com sucesso.', 'success');
      render();
      focusSearchInput();
    } finally {
      isFinishingSale = false;
    }
  }

  function bindKeyboardShortcuts() {
    if (keyboardBound) return;
    keyboardBound = true;

    document.addEventListener('keydown', (event) => {
      if (!tabEls.sales?.classList.contains('active')) return;

      if (event.key === 'F2') {
        event.preventDefault();
        focusSearchInput();
      }
    });
  }

  function render() {
    const { subtotal, discount, total, change } = calculateCartTotal();

    tabEls.sales.innerHTML = `
      <div class="section-stack">
        <div class="sales-layout">
          <div class="panel">
            <div class="section-header">
              <h2>Venda</h2>
              <span class="muted">Pesquisa de produto e código de barras</span>
            </div>

            <div class="sales-search-row search-row sales-search" style="margin-bottom:14px;">
              <input
                id="sale-product-search"
                type="text"
                placeholder="Digite nome do produto ou código de barras"
                autocomplete="off"
              />
              <button class="btn btn-secondary" type="button" id="sale-select-client-btn">Selecionar cliente</button>
              <button class="btn btn-secondary" type="button" id="sale-clear-client-btn">Limpar cliente</button>
            </div>

            <div class="form-grid" style="margin-bottom:14px;">
              <label style="grid-column:1 / -1;">
                Cliente
                <input id="sale-customer-name" type="text" value="Balcão" />
              </label>
            </div>

            <div id="sale-search-results" class="panel-scroll">
              <div class="empty-state">
                <strong>Pesquise um produto</strong>
                <span>Digite nome ou código de barras para listar resultados.</span>
              </div>
            </div>
          </div>

          <div class="panel sticky-summary">
            <div class="section-header">
              <h2>Carrinho</h2>
              <span class="muted"><span id="sale-items-count">${state.cart.length}</span> item(ns)</span>
            </div>

            <div id="sale-cart-items" class="card-scroll-y"></div>

            <div class="form-grid" style="margin-top:14px;">
              <label>
                Forma de pagamento
                <select id="sale-payment-method">
                  ${paymentMethods.map((method) => `
                    <option value="${escapeHtml(method)}">${escapeHtml(method)}</option>
                  `).join('')}
                </select>
              </label>

              <label>
                Desconto
                <input name="discount" type="number" step="0.01" min="0" value="0" />
              </label>

              <label>
                Valor pago
                <input name="amountPaid" type="number" step="0.01" min="0" value="0" />
              </label>

              <label style="grid-column:1 / -1;">
                Observações
                <textarea name="notes"></textarea>
              </label>
            </div>

            <div class="summary-box" style="margin-top:14px;">
              <div class="summary-line"><span>Subtotal</span><strong id="sale-subtotal">${currency(subtotal)}</strong></div>
              <div class="summary-line"><span>Desconto</span><strong id="sale-discount-view">${currency(discount)}</strong></div>
              <div class="summary-line total"><span>Total</span><strong id="sale-total">${currency(total)}</strong></div>
              <div class="summary-line"><span>Troco</span><strong id="sale-change">${currency(change)}</strong></div>
            </div>

            <div class="form-actions" style="margin-top:14px;">
              <button class="btn btn-primary" type="button" id="finish-sale-btn">Finalizar venda</button>
              <button class="btn btn-secondary" type="button" id="clear-cart-btn">Limpar carrinho</button>
            </div>
          </div>
        </div>

        <div class="table-card">
          <div class="section-header">
            <h2>Histórico de vendas</h2>
          </div>

          <div class="search-row sales-history-filters" style="margin-bottom:14px;">
            <input id="sales-filter-customer" placeholder="Cliente" value="${escapeHtml(saleFilters.customer)}" />
            <select id="sales-filter-payment">
              <option value="">Todas as formas</option>
              ${paymentMethods.map((method) => `
                <option value="${escapeHtml(method)}" ${saleFilters.paymentMethod === method ? 'selected' : ''}>${escapeHtml(method)}</option>
              `).join('')}
            </select>
            <input id="sales-filter-date-from" type="date" value="${saleFilters.dateFrom}" />
            <input id="sales-filter-date-to" type="date" value="${saleFilters.dateTo}" />
            <button class="btn btn-secondary" type="button" id="sales-filter-apply">Filtrar</button>
            <button class="btn btn-secondary" type="button" id="sales-filter-clear">Limpar</button>
          </div>

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
              <tbody id="sales-history-table"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    tabEls.sales.querySelector('#sale-product-search')?.addEventListener('input', handleSaleSearch);
    tabEls.sales.querySelector('#sale-product-search')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const value = event.currentTarget.value || '';
        tryAddProductByBarcode(value, true);
      }
    });

    bindAsyncButton(tabEls.sales.querySelector('#sale-select-client-btn'), async () => {
      openClientPicker();
    }, { busyLabel: 'Abrindo...' });

    bindAsyncButton(tabEls.sales.querySelector('#sale-clear-client-btn'), async () => {
      tabEls.sales.querySelector('#sale-customer-name').value = 'Balcão';
      showToast('Cliente limpo.', 'info');
    }, { busyLabel: 'Limpando...' });

    tabEls.sales.querySelector('#sale-payment-method')?.addEventListener('change', updateSaleSummary);
    tabEls.sales.querySelector('input[name="discount"]')?.addEventListener('input', updateSaleSummary);
    tabEls.sales.querySelector('input[name="amountPaid"]')?.addEventListener('input', updateSaleSummary);

    bindAsyncButton(tabEls.sales.querySelector('#finish-sale-btn'), async () => {
      await finishSale();
    }, { busyLabel: 'Finalizando...' });

    bindAsyncButton(tabEls.sales.querySelector('#clear-cart-btn'), async () => {
      clearCartWithFeedback();
    }, { busyLabel: 'Limpando...' });

    tabEls.sales.querySelector('#sales-filter-apply')?.addEventListener('click', () => {
      saleFilters.customer = tabEls.sales.querySelector('#sales-filter-customer')?.value || '';
      saleFilters.paymentMethod = tabEls.sales.querySelector('#sales-filter-payment')?.value || '';
      saleFilters.dateFrom = tabEls.sales.querySelector('#sales-filter-date-from')?.value || '';
      saleFilters.dateTo = tabEls.sales.querySelector('#sales-filter-date-to')?.value || '';
      renderHistory();
    });

    bindAsyncButton(tabEls.sales.querySelector('#sales-filter-clear'), async () => {
      saleFilters = { customer: '', paymentMethod: '', dateFrom: '', dateTo: '' };
      render();
    }, { busyLabel: 'Limpando...' });

    renderCart();
    renderHistory();
    updateSaleSummary();
    bindKeyboardShortcuts();
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
      if (event.target.id === 'sale-client-modal-backdrop') closeModal();
    });

    clientsModule.renderClientPicker?.({
      target: '#sale-client-picker-host',
      onSelect: (client) => {
        const input = tabEls.sales.querySelector('#sale-customer-name');
        if (input) input.value = client.name || 'Balcão';
        closeModal();
      }
    });
  }

  return {
    render
  };
}