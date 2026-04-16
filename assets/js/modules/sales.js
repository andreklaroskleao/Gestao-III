import { escapeHtml, showToast } from './ui.js';

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

  let streamRef = null;
  let scanTimer = null;
  let barcodeTimer = null;
  let zxingReader = null;
  let cameraRunning = false;

  let saleFilters = {
    customer: '',
    paymentMethod: '',
    dateFrom: '',
    dateTo: ''
  };

  let keyboardBound = false;

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

  function renderCartItems() {
    if (!state.cart.length) {
      return '<div class="empty-state">Nenhum item adicionado.</div>';
    }

    return state.cart.map((item) => `
      <div class="cart-item">
        <div class="cart-line">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${currency(item.salePrice)}</span>
        </div>
        <div class="cart-line">
          <span>Qtd: ${item.quantity}</span>
          <span>Total: ${currency(item.salePrice * item.quantity)}</span>
        </div>
        <div class="cart-actions">
          <button class="btn btn-secondary" type="button" data-cart-decrease="${item.id}">-1</button>
          <button class="btn btn-secondary" type="button" data-cart-increase="${item.id}">+1</button>
          <button class="btn btn-danger" type="button" data-cart-remove="${item.id}">Remover</button>
        </div>
      </div>
    `).join('');
  }

  function calculateCartTotal() {
    const discountInput = tabEls.sales?.querySelector('input[name="discount"]');
    const paidInput = tabEls.sales?.querySelector('input[name="amountPaid"]');

    const subtotal = state.cart.reduce((sum, item) => sum + (Number(item.salePrice) * Number(item.quantity)), 0);
    const discount = toNumber(discountInput?.value || 0);
    const total = Math.max(0, subtotal - discount);
    const amountPaid = toNumber(paidInput?.value || 0);
    const change = Math.max(0, amountPaid - total);

    return {
      subtotal,
      discount,
      total,
      amountPaid,
      change
    };
  }

  function updateSaleSummary() {
    const { subtotal, discount, total, change } = calculateCartTotal();

    tabEls.sales.querySelector('#sale-subtotal').textContent = currency(subtotal);
    tabEls.sales.querySelector('#sale-discount-view').textContent = currency(discount);
    tabEls.sales.querySelector('#sale-total').textContent = currency(total);
    tabEls.sales.querySelector('#sale-change').textContent = currency(change);
  }

  function findProductByBarcode(barcode) {
    const code = String(barcode || '').trim();
    if (!code) return null;

    return (state.products || []).find((item) => String(item.barcode || '').trim() === code) || null;
  }

  function addProductToCart(productId) {
    const product = (state.products || []).find((item) => item.id === productId);
    if (!product) return;

    const existing = state.cart.find((item) => item.id === productId);

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
      if (showWarning) {
        handleNotFoundBarcode(normalized);
      }
      return false;
    }

    addProductToCart(product.id);

    const input = tabEls.sales.querySelector('#sale-product-search');
    if (input) {
      input.value = product.barcode || '';
      input.focus();
      input.select?.();
    }

    return true;
  }

  function handleSaleSearch() {
    const term = tabEls.sales.querySelector('#sale-product-search').value.trim().toLowerCase();
    const resultsEl = tabEls.sales.querySelector('#sale-search-results');

    const results = (state.products || [])
      .filter((product) => product.status !== 'inativo' && [product.name, product.barcode].join(' ').toLowerCase().includes(term))
      .slice(0, 8);

    resultsEl.innerHTML = results.map((product) => `
      <div class="list-item">
        <strong>${escapeHtml(product.name)}</strong>
        <span>${escapeHtml(product.barcode || 'Sem código')} · Estoque: ${product.quantity}</span>
        <div class="inline-row" style="margin-top:8px;">
          <button class="btn btn-primary" type="button" data-add-cart="${product.id}">Adicionar</button>
        </div>
      </div>
    `).join('') || '<div class="empty-state">Nenhum produto encontrado.</div>';

    resultsEl.querySelectorAll('[data-add-cart]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        addProductToCart(btn.dataset.addCart);
      });
    });
  }

  function handleSalesSearchInputKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();

      const value = event.currentTarget.value.trim();
      if (!tryAddProductByBarcode(value, true)) {
        handleSaleSearch();
      }
    }
  }

  function handleSalesSearchInputAutoScan(event) {
    const value = event.currentTarget.value.trim();

    window.clearTimeout(barcodeTimer);
    barcodeTimer = window.setTimeout(() => {
      if (value.length >= 6) {
        tryAddProductByBarcode(value, true);
      }
    }, 120);
  }

  async function handleBarcodeReadAction() {
    if (!isMobileDevice()) {
      focusSearchInput();
      showToast('No desktop, use o leitor USB no campo de busca.', 'info');
      return;
    }

    await startCameraScan();
  }

  function getScannerElements() {
    return {
      scannerCard: document.getElementById('scanner-card'),
      video: document.getElementById('barcode-video'),
      status: document.getElementById('barcode-status')
    };
  }

  function setScannerStatus(message, type = 'info') {
    const { status } = getScannerElements();
    if (!status) return;

    status.textContent = message;
    status.dataset.type = type;
  }

  function showScannerCard() {
    const { scannerCard } = getScannerElements();
    if (scannerCard) {
      scannerCard.style.display = 'block';
    }
  }

  function hideScannerCard() {
    const { scannerCard } = getScannerElements();
    if (scannerCard) {
      scannerCard.style.display = 'none';
    }
  }

  async function startCameraScan() {
    if (!isMobileDevice()) return;
    if (cameraRunning) return;

    showScannerCard();
    setScannerStatus('Abrindo câmera traseira...', 'info');
    stopCameraScan(false);

    try {
      if ('BarcodeDetector' in window) {
        await startBarcodeDetectorScan();
        return;
      }

      await startZxingScan();
    } catch (error) {
      console.error('Erro ao iniciar câmera:', error);

      try {
        await startZxingScan();
      } catch (fallbackError) {
        console.error('Erro no fallback ZXing:', fallbackError);
        stopCameraScan(true);
        showToast('Não foi possível iniciar a leitura pela câmera.', 'error');
      }
    }
  }

  async function startBarcodeDetectorScan() {
    const { video } = getScannerElements();

    if (!navigator.mediaDevices?.getUserMedia || !video) {
      throw new Error('Câmera indisponível.');
    }

    streamRef = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' }
      },
      audio: false
    });

    video.srcObject = streamRef;
    await video.play();

    const detector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'code_39', 'itf']
    });

    cameraRunning = true;
    setScannerStatus('Aponte a câmera para o código de barras.', 'info');

    scanTimer = window.setInterval(async () => {
      try {
        const codes = await detector.detect(video);
        if (!codes.length) return;

        const value = String(codes[0].rawValue || '').trim();
        if (!value) return;

        const found = tryAddProductByBarcode(value, false);

        if (found) {
          setScannerStatus(`Código lido: ${value}`, 'success');
          stopCameraScan(true);
        } else {
          setScannerStatus(`Código não cadastrado: ${value}`, 'error');
          stopCameraScan(true);
          handleNotFoundBarcode(value);
        }
      } catch (error) {
        console.error('Erro ao detectar código:', error);
      }
    }, 600);
  }

  async function startZxingScan() {
    const { video } = getScannerElements();

    if (!window.ZXing || !video) {
      throw new Error('ZXing não disponível.');
    }

    const ZXingLib = window.ZXing;
    zxingReader = new ZXingLib.BrowserMultiFormatReader();

    cameraRunning = true;
    setScannerStatus('Aponte a câmera para o código de barras.', 'info');

    await zxingReader.decodeFromConstraints(
      {
        video: {
          facingMode: { ideal: 'environment' }
        }
      },
      video,
      (result, error) => {
        if (result) {
          const value = String(result.text || '').trim();
          if (!value) return;

          const found = tryAddProductByBarcode(value, false);

          if (found) {
            setScannerStatus(`Código lido: ${value}`, 'success');
            stopCameraScan(true);
          } else {
            setScannerStatus(`Código não cadastrado: ${value}`, 'error');
            stopCameraScan(true);
            handleNotFoundBarcode(value);
          }
        }

        if (error && error.name !== 'NotFoundException') {
          console.error('ZXing erro:', error);
        }
      }
    );
  }

  function stopCameraScan(hideCard = true) {
    if (scanTimer) {
      window.clearInterval(scanTimer);
      scanTimer = null;
    }

    if (zxingReader) {
      try {
        zxingReader.reset();
      } catch (error) {
        console.error(error);
      }
      zxingReader = null;
    }

    if (streamRef) {
      streamRef.getTracks().forEach((track) => track.stop());
      streamRef = null;
    }

    const { video } = getScannerElements();
    if (video) {
      try {
        video.pause();
      } catch (error) {
        console.error(error);
      }
      video.srcObject = null;
    }

    cameraRunning = false;

    if (hideCard) {
      hideScannerCard();
    }
  }

  function bindCartButtons() {
    tabEls.sales.querySelectorAll('[data-cart-decrease]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const item = state.cart.find((row) => row.id === btn.dataset.cartDecrease);
        if (!item) return;

        item.quantity = Math.max(1, item.quantity - 1);
        render();
      });
    });

    tabEls.sales.querySelectorAll('[data-cart-increase]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const item = state.cart.find((row) => row.id === btn.dataset.cartIncrease);
        if (!item) return;

        item.quantity += 1;
        render();
      });
    });

    tabEls.sales.querySelectorAll('[data-cart-remove]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        state.cart = state.cart.filter((row) => row.id !== btn.dataset.cartRemove);
        render();
      });
    });
  }

  async function handleSaleSubmit(event) {
    event?.preventDefault?.();

    if (!state.cart.length) {
      alert('Adicione ao menos um produto na venda.');
      return;
    }

    const form = tabEls.sales.querySelector('#sale-form');
    const values = Object.fromEntries(new FormData(form).entries());
    const totals = calculateCartTotal();

    const insufficient = state.cart.find((item) => {
      const product = (state.products || []).find((row) => row.id === item.id);
      return !product || Number(product.quantity) < Number(item.quantity);
    });

    if (insufficient) {
      alert(`Estoque insuficiente para ${insufficient.name}.`);
      return;
    }

    const selectedClientId = tabEls.sales.querySelector('#sale-client-id')?.value || '';

    const payload = {
      clientId: selectedClientId || '',
      customerName: values.customerName || '',
      paymentMethod: values.paymentMethod,
      discount: totals.discount,
      subtotal: totals.subtotal,
      total: totals.total,
      amountPaid: totals.amountPaid,
      change: totals.change,
      cashierId: state.currentUser.uid,
      cashierName: state.currentUser.fullName,
      items: state.cart.map((item) => ({
        productId: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.salePrice,
        total: item.salePrice * item.quantity
      }))
    };

    await createDoc(refs.sales, payload);

    for (const item of state.cart) {
      const product = (state.products || []).find((row) => row.id === item.id);

      await updateByPath('products', item.id, {
        quantity: Number(product.quantity) - Number(item.quantity)
      });
    }

    printReceipt(payload);
    state.cart = [];
    form.reset();
    render();
    showToast('Venda finalizada com sucesso.', 'success');
  }

  function printReceipt(sale) {
    printModule.printSaleReceipt(sale);
  }

  function getFilteredSales() {
    return (state.sales || []).filter((sale) => {
      const customer = String(sale.customerName || '').toLowerCase();
      const paymentMethod = String(sale.paymentMethod || '');

      const saleDate = sale.createdAt?.toDate
        ? sale.createdAt.toDate()
        : new Date(sale.createdAt || 0);

      const dateValue = Number.isNaN(saleDate.getTime())
        ? ''
        : `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}-${String(saleDate.getDate()).padStart(2, '0')}`;

      return (!saleFilters.customer || customer.includes(saleFilters.customer.toLowerCase()))
        && (!saleFilters.paymentMethod || paymentMethod === saleFilters.paymentMethod)
        && (!saleFilters.dateFrom || dateValue >= saleFilters.dateFrom)
        && (!saleFilters.dateTo || dateValue <= saleFilters.dateTo);
    });
  }

  function bindHistoryEvents() {
    const customerInput = tabEls.sales.querySelector('#sales-filter-customer');
    const paymentInput = tabEls.sales.querySelector('#sales-filter-payment');
    const dateFromInput = tabEls.sales.querySelector('#sales-filter-date-from');
    const dateToInput = tabEls.sales.querySelector('#sales-filter-date-to');

    tabEls.sales.querySelector('#sales-filter-apply')?.addEventListener('click', () => {
      saleFilters.customer = customerInput.value || '';
      saleFilters.paymentMethod = paymentInput.value || '';
      saleFilters.dateFrom = dateFromInput.value || '';
      saleFilters.dateTo = dateToInput.value || '';
      render();
    });

    tabEls.sales.querySelector('#sales-filter-clear')?.addEventListener('click', () => {
      saleFilters = {
        customer: '',
        paymentMethod: '',
        dateFrom: '',
        dateTo: ''
      };
      render();
    });

    tabEls.sales.querySelectorAll('[data-sale-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sale = (state.sales || []).find((item) => item.id === btn.dataset.saleView);
        if (!sale) return;

        const details = `
Cliente: ${sale.customerName || 'Balcão'}
Pagamento: ${sale.paymentMethod || '-'}
Subtotal: ${currency(sale.subtotal)}
Desconto: ${currency(sale.discount)}
Total: ${currency(sale.total)}
Valor pago: ${currency(sale.amountPaid)}
Troco: ${currency(sale.change)}

Itens:
${(sale.items || []).map((item) => `- ${item.name} | Qtd: ${item.quantity} | Unit: ${currency(item.unitPrice)} | Total: ${currency(item.total)}`).join('\n')}
        `.trim();

        alert(details);
      });
    });

    tabEls.sales.querySelectorAll('[data-sale-reprint]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sale = (state.sales || []).find((item) => item.id === btn.dataset.saleReprint);
        if (!sale) return;
        printReceipt(sale);
      });
    });
  }

  function bindKeyboardShortcuts() {
    if (keyboardBound) return;
    keyboardBound = true;

    document.addEventListener('keydown', async (event) => {
      if (state.activeTab !== 'sales') return;

      if (event.key === 'F2') {
        event.preventDefault();
        focusSearchInput();
        return;
      }

      if (event.key === 'F4') {
        event.preventDefault();
        clearCartWithFeedback();
        return;
      }

      if (event.key === 'F9') {
        event.preventDefault();
        await handleSaleSubmit();
        return;
      }

      if (event.key === 'Escape') {
        stopCameraScan(true);
      }
    });
  }

  function render() {
    const cartTotal = calculateCartTotal();
    const mobile = isMobileDevice();
    const filteredSales = getFilteredSales();

    tabEls.sales.innerHTML = `
      <div class="sales-layout">
        <div class="panel">
          <div class="section-header">
            <h2>Novo atendimento</h2>
            <span class="muted">Busca por nome, código de barras e leitor USB</span>
          </div>

          <div class="search-row">
            <input id="sale-product-search" placeholder="Pesquisar ou bipar código de barras" autocomplete="off" />
            <button id="sale-product-search-btn" class="btn btn-secondary" type="button">Buscar</button>
            ${mobile ? '<button id="camera-scan-btn" class="btn btn-primary" type="button">Ler código de barras</button>' : ''}
          </div>

          <div class="auth-hint" style="margin-top:10px;">
            ${mobile ? 'No celular, use a câmera traseira para leitura. Se o código não existir, o sistema avisará.' : 'No computador: F2 busca, F4 limpa carrinho, F9 finaliza venda.'}
          </div>

          <div id="sale-search-results" class="stack-list" style="margin-top:14px;"></div>

          ${mobile ? `
            <div class="scanner-card" id="scanner-card" style="margin-top:14px; display:none;">
              <h3>Leitura de código de barras</h3>
              <video id="barcode-video" class="video-preview" autoplay muted playsinline></video>
              <div id="barcode-status" class="auth-hint" style="margin-top:10px;">Aguardando câmera...</div>
              <div class="inline-row" style="margin-top:10px;">
                <button id="stop-scan-btn" class="btn btn-secondary" type="button">Parar leitura</button>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="panel">
          <div class="section-header">
            <h2>Itens da venda</h2>
            <span class="muted">${state.cart.length} item(ns)</span>
          </div>

          <div id="cart-list" class="cart-list">${renderCartItems()}</div>

          <form id="sale-form" class="form-grid" style="margin-top:16px;">
            <input type="hidden" id="sale-client-id" value="" />

            <label>Cliente selecionado<input id="sale-client-selected" value="" placeholder="Nenhum cliente selecionado" readonly /></label>

            <div class="form-actions" style="grid-column:1 / -1; justify-content:flex-start;">
              <button class="btn btn-secondary" type="button" id="sale-client-picker-btn">Selecionar cliente</button>
              <button class="btn btn-secondary" type="button" id="sale-client-clear-btn">Limpar cliente</button>
            </div>

            <label>Cliente<input name="customerName" placeholder="Opcional" /></label>
            <label>Forma de pagamento
              <select name="paymentMethod">
                ${paymentMethods.map((item) => `<option value="${item}">${item}</option>`).join('')}
              </select>
            </label>
            <label>Desconto<input name="discount" type="number" step="0.01" min="0" value="0" /></label>
            <label>Valor pago<input name="amountPaid" type="number" step="0.01" min="0" value="0" /></label>

            <div class="summary-box" style="grid-column: 1 / -1;">
              <div class="summary-line"><span>Subtotal</span><strong id="sale-subtotal">${currency(cartTotal.subtotal)}</strong></div>
              <div class="summary-line"><span>Desconto</span><strong id="sale-discount-view">${currency(cartTotal.discount)}</strong></div>
              <div class="summary-line total"><span>Total</span><strong id="sale-total">${currency(cartTotal.total)}</strong></div>
              <div class="summary-line"><span>Troco</span><strong id="sale-change">${currency(cartTotal.change)}</strong></div>
            </div>

            <div class="form-actions" style="grid-column: 1 / -1;">
              <button class="btn btn-success" type="submit">Finalizar venda</button>
              <button class="btn btn-secondary" type="button" id="clear-cart-btn">Limpar carrinho</button>
            </div>
          </form>
        </div>
      </div>

      <div class="table-card" style="margin-top:18px;">
        <div class="section-header">
          <h2>Histórico detalhado de vendas</h2>
        </div>

        <div class="search-row" style="margin-bottom:14px;">
          <input id="sales-filter-customer" placeholder="Cliente" value="${escapeHtml(saleFilters.customer)}" />
          <select id="sales-filter-payment">
            <option value="">Todas as formas</option>
            ${paymentMethods.map((item) => `<option value="${item}" ${saleFilters.paymentMethod === item ? 'selected' : ''}>${item}</option>`).join('')}
          </select>
          <input id="sales-filter-date-from" type="date" value="${saleFilters.dateFrom}" />
          <input id="sales-filter-date-to" type="date" value="${saleFilters.dateTo}" />
          <button class="btn btn-secondary" type="button" id="sales-filter-apply">Filtrar</button>
          <button class="btn btn-secondary" type="button" id="sales-filter-clear">Limpar</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Pagamento</th>
                <th>Itens</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${filteredSales.slice(0, 50).map((sale) => `
                <tr>
                  <td>${formatDateTime(sale.createdAt)}</td>
                  <td>${escapeHtml(sale.customerName || 'Balcão')}</td>
                  <td>${currency(sale.total)}</td>
                  <td>${escapeHtml(sale.paymentMethod || '-')}</td>
                  <td>${sale.items?.length || 0}</td>
                  <td>
                    <div class="inline-row">
                      <button class="btn btn-secondary" type="button" data-sale-view="${sale.id}">Detalhes</button>
                      <button class="btn btn-primary" type="button" data-sale-reprint="${sale.id}">Reimprimir</button>
                    </div>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="6">Nenhuma venda registrada.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const searchInput = tabEls.sales.querySelector('#sale-product-search');

    tabEls.sales.querySelector('#sale-product-search-btn').addEventListener('click', handleSaleSearch);
    searchInput.addEventListener('keydown', handleSalesSearchInputKeydown);
    searchInput.addEventListener('input', handleSalesSearchInputAutoScan);
    tabEls.sales.querySelector('#sale-form').addEventListener('submit', handleSaleSubmit);
    tabEls.sales.querySelector('#clear-cart-btn').addEventListener('click', clearCartWithFeedback);

    if (mobile) {
      tabEls.sales.querySelector('#camera-scan-btn').addEventListener('click', handleBarcodeReadAction);
      tabEls.sales.querySelector('#stop-scan-btn').addEventListener('click', () => {
        stopCameraScan(true);
      });
    }

    tabEls.sales.querySelector('#sale-client-picker-btn')?.addEventListener('click', () => {
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

      modalRoot.querySelector('#sale-client-modal-close').addEventListener('click', closeModal);
      modalRoot.querySelector('#sale-client-modal-backdrop').addEventListener('click', (event) => {
        if (event.target.id === 'sale-client-modal-backdrop') {
          closeModal();
        }
      });

      clientsModule.renderClientPicker({
        target: '#sale-client-picker-host',
        onSelect: (client) => {
          tabEls.sales.querySelector('#sale-client-id').value = client.id;
          tabEls.sales.querySelector('#sale-client-selected').value = `${client.name} - ${client.phone || ''}`;
          tabEls.sales.querySelector('input[name="customerName"]').value = client.name || '';
          closeModal();
        }
      });
    });

    tabEls.sales.querySelector('#sale-client-clear-btn')?.addEventListener('click', () => {
      tabEls.sales.querySelector('#sale-client-id').value = '';
      tabEls.sales.querySelector('#sale-client-selected').value = '';
    });

    bindCartButtons();
    bindHistoryEvents();
    bindKeyboardShortcuts();

    const discountField = tabEls.sales.querySelector('input[name="discount"]');
    const paidField = tabEls.sales.querySelector('input[name="amountPaid"]');

    [discountField, paidField].forEach((field) => {
      field.addEventListener('input', updateSaleSummary);
    });

    if (!mobile) {
      setTimeout(() => focusSearchInput(), 50);
    }
  }

  return {
    render,
    stopCameraScan
  };
}