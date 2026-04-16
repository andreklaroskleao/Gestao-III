import { escapeHtml, showToast } from './ui.js';

export function createSalesModule(ctx) {
  const {
    state,
    refs,
    tabEls,
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

  function calculateCartTotal() {
    const discountInput = tabEls.sales?.querySelector('input[name="discount"]');
    const paidInput = tabEls.sales?.querySelector('input[name="amountPaid"]');

    const subtotal = state.cart.reduce((sum, item) => {
      return sum + (Number(item.salePrice) * Number(item.quantity));
    }, 0);

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
    tabEls.sales.querySelector('#sale-items-count').textContent = String(state.cart.length);
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
      .filter((product) => {
        return product.status !== 'inativo'
          && [product.name, product.barcode, product.brand, product.supplier].join(' ').toLowerCase().includes(term);
      })
      .slice(0, 8);

    resultsEl.innerHTML = results.map((product) => `
      <div class="list-item">
        <strong>${escapeHtml(product.name)}</strong>
        <span>${escapeHtml(product.barcode || 'Sem código')} · Estoque: ${product.quantity} · ${currency(product.salePrice || 0)}</span>
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

  function getScannerModalRoot() {
    return document.getElementById('modal-root');
  }

  function getScannerElements() {
    return {
      video: document.getElementById('sale-barcode-video'),
      status: document.getElementById('sale-barcode-status')
    };
  }

  function setScannerStatus(message, type = 'info') {
    const { status } = getScannerElements();
    if (!status) return;

    status.textContent = message;
    status.dataset.type = type;
  }

  function openScannerModal() {
    const modalRoot = getScannerModalRoot();
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="sale-barcode-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Ler código de barras</h2>
            <button class="btn btn-secondary" type="button" id="sale-barcode-modal-close">Fechar</button>
          </div>

          <div class="scanner-card">
            <video id="sale-barcode-video" class="video-preview" autoplay muted playsinline></video>
            <div id="sale-barcode-status" class="auth-hint" style="margin-top:10px;">Aguardando câmera...</div>
            <div class="form-actions" style="margin-top:10px;">
              <button class="btn btn-secondary" type="button" id="sale-barcode-stop-btn">Parar leitura</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      closeScannerModal();
    };

    modalRoot.querySelector('#sale-barcode-modal-close').addEventListener('click', closeModal);
    modalRoot.querySelector('#sale-barcode-stop-btn').addEventListener('click', closeModal);
    modalRoot.querySelector('#sale-barcode-modal-backdrop').addEventListener('click', (event) => {
      if (event.target.id === 'sale-barcode-modal-backdrop') {
        closeModal();
      }
    });
  }

  function closeScannerModal() {
    const modalRoot = getScannerModalRoot();
    stopCameraScan();
    if (modalRoot) {
      modalRoot.innerHTML = '';
    }
  }

  async function handleBarcodeReadAction() {
    if (!isMobileDevice()) {
      focusSearchInput();
      showToast('No desktop, use o leitor USB no campo de busca.', 'info');
      return;
    }

    openScannerModal();
    await startCameraScan();
  }

  async function startCameraScan() {
    if (!isMobileDevice()) return;
    if (cameraRunning) return;

    setScannerStatus('Abrindo câmera traseira...', 'info');
    stopCameraScan();

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
        stopCameraScan();
        showToast('Não foi possível iniciar a leitura pela câmera.', 'error');
        closeScannerModal();
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
          showToast('Código lido com sucesso.', 'success');
          closeScannerModal();
        } else {
          setScannerStatus(`Código não cadastrado: ${value}`, 'error');
          closeScannerModal();
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
            showToast('Código lido com sucesso.', 'success');
            closeScannerModal();
          } else {
            setScannerStatus(`Código não cadastrado: ${value}`, 'error');
            closeScannerModal();
            handleNotFoundBarcode(value);
          }
        }

        if (error && error.name !== 'NotFoundException') {
          console.error('ZXing erro:', error);
        }
      }
    );
  }

  function stopCameraScan() {
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

  function showSaleDetailsModal(saleId) {
    const sale = (state.sales || []).find((item) => item.id === saleId);
    if (!sale) return;

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
            <div class="sale-details-box">
              <span>Cliente</span>
              <strong>${escapeHtml(sale.customerName || 'Balcão')}</strong>
            </div>

            <div class="sale-details-box">
              <span>Data</span>
              <strong>${formatDateTime(sale.createdAt)}</strong>
            </div>

            <div class="sale-details-box">
              <span>Pagamento</span>
              <strong>${escapeHtml(sale.paymentMethod || '-')}</strong>
            </div>

            <div class="sale-details-box">
              <span>Subtotal</span>
              <strong>${currency(sale.subtotal || 0)}</strong>
            </div>

            <div class="sale-details-box">
              <span>Desconto</span>
              <strong>${currency(sale.discount || 0)}</strong>
            </div>

            <div class="sale-details-box">
              <span>Total</span>
              <strong>${currency(sale.total || 0)}</strong>
            </div>

            <div class="sale-details-box">
              <span>Valor pago</span>
              <strong>${currency(sale.amountPaid || 0)}</strong>
            </div>

            <div class="sale-details-box">
              <span>Troco</span>
              <strong>${currency(sale.change || 0)}</strong>
            </div>

            <div class="sale-details-box">
              <span>Itens</span>
              <strong>${sale.items?.length || 0}</strong>
            </div>
          </div>

          <div class="table-card" style="padding:14px;">
            <div class="section-header">
              <h3>Itens da venda</h3>
              <button class="btn btn-primary" type="button" id="sale-details-reprint-btn">Reimprimir</button>
            </div>

            <div class="sale-items-list">
              ${(sale.items || []).map((item) => `
                <div class="sale-item-card">
                  <div class="sale-item-title">${escapeHtml(item.name || '-')}</div>
                  <div class="sale-item-meta">
                    <span><strong>Quantidade:</strong> ${Number(item.quantity || 0)}</span>
                    <span><strong>Unitário:</strong> ${currency(item.unitPrice || 0)}</span>
                    <span><strong>Total:</strong> ${currency(item.total || 0)}</span>
                  </div>
                </div>
              `).join('') || '<div class="empty-state">Nenhum item encontrado.</div>'}
            </div>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#sale-details-modal-close').addEventListener('click', closeModal);
    modalRoot.querySelector('#sale-details-reprint-btn').addEventListener('click', () => {
      printReceipt(sale);
    });
    modalRoot.querySelector('#sale-details-modal-backdrop').addEventListener('click', (event) => {
      if (event.target.id === 'sale-details-modal-backdrop') {
        closeModal();
      }
    });
  }

  function reprintSaleById(saleId) {
    const sale = (state.sales || []).find((item) => item.id === saleId);
    if (!sale) return;
    printReceipt(sale);
  }

  function bindHistoryModalEvents() {
    document.getElementById('sales-filter-apply-modal')?.addEventListener('click', () => {
      saleFilters.customer = document.getElementById('sales-filter-customer-modal')?.value || '';
      saleFilters.paymentMethod = document.getElementById('sales-filter-payment-modal')?.value || '';
      saleFilters.dateFrom = document.getElementById('sales-filter-date-from-modal')?.value || '';
      saleFilters.dateTo = document.getElementById('sales-filter-date-to-modal')?.value || '';
      renderHistoryModalContent();
    });

    document.getElementById('sales-filter-clear-modal')?.addEventListener('click', () => {
      saleFilters = {
        customer: '',
        paymentMethod: '',
        dateFrom: '',
        dateTo: ''
      };
      renderHistoryModalContent();
    });

    document.querySelectorAll('[data-sale-view-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        showSaleDetailsModal(btn.dataset.saleViewModal);
      });
    });

    document.querySelectorAll('[data-sale-reprint-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        reprintSaleById(btn.dataset.saleReprintModal);
      });
    });
  }

  function renderHistoryModalContent() {
    const filteredSales = getFilteredSales();
    const host = document.getElementById('sales-history-modal-host');
    if (!host) return;

    host.innerHTML = `
      <div class="sales-history-filters">
        <input
          id="sales-filter-customer-modal"
          class="field-span-2"
          placeholder="Cliente"
          value="${escapeHtml(saleFilters.customer)}"
        />

        <select id="sales-filter-payment-modal" class="field-span-1">
          <option value="">Todas as formas</option>
          ${paymentMethods.map((item) => `<option value="${item}" ${saleFilters.paymentMethod === item ? 'selected' : ''}>${item}</option>`).join('')}
        </select>

        <input
          id="sales-filter-date-from-modal"
          class="field-span-1"
          type="date"
          value="${saleFilters.dateFrom}"
        />

        <input
          id="sales-filter-date-to-modal"
          class="field-span-1"
          type="date"
          value="${saleFilters.dateTo}"
        />

        <button class="btn btn-secondary field-span-1" type="button" id="sales-filter-apply-modal">Filtrar</button>
        <button class="btn btn-secondary field-span-1" type="button" id="sales-filter-clear-modal">Limpar</button>
      </div>

      <div class="sales-history-desktop-table">
        <div class="sales-history-table-wrap">
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
              ${filteredSales.slice(0, 100).map((sale) => `
                <tr>
                  <td>${formatDateTime(sale.createdAt)}</td>
                  <td>${escapeHtml(sale.customerName || 'Balcão')}</td>
                  <td>${currency(sale.total)}</td>
                  <td>${escapeHtml(sale.paymentMethod || '-')}</td>
                  <td>${sale.items?.length || 0}</td>
                  <td>
                    <div class="clean-table-actions">
                      <button class="btn btn-secondary" type="button" data-sale-view-modal="${sale.id}">Detalhes</button>
                      <button class="btn btn-primary" type="button" data-sale-reprint-modal="${sale.id}">Reimprimir</button>
                    </div>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="6">Nenhuma venda registrada.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="sales-history-mobile-list">
        ${filteredSales.slice(0, 100).map((sale) => `
          <div class="sales-history-sale-card">
            <div class="sale-card-title">${escapeHtml(sale.customerName || 'Balcão')}</div>
            <div class="sale-card-meta">
              <span><strong>Data:</strong> ${formatDateTime(sale.createdAt)}</span>
              <span><strong>Total:</strong> ${currency(sale.total)}</span>
              <span><strong>Pagamento:</strong> ${escapeHtml(sale.paymentMethod || '-')}</span>
              <span><strong>Itens:</strong> ${sale.items?.length || 0}</span>
            </div>
            <div class="sale-card-actions">
              <button class="btn btn-secondary" type="button" data-sale-view-modal="${sale.id}">Detalhes</button>
              <button class="btn btn-primary" type="button" data-sale-reprint-modal="${sale.id}">Reimprimir</button>
            </div>
          </div>
        `).join('') || '<div class="empty-state">Nenhuma venda registrada.</div>'}
      </div>
    `;

    bindHistoryModalEvents();
  }

  function openHistoryModal() {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="sales-history-modal-backdrop">
        <div class="modal-card sales-history-modal-card">
          <div class="section-header">
            <h2>Histórico de vendas</h2>
            <button class="btn btn-secondary" type="button" id="sales-history-modal-close">Fechar</button>
          </div>
          <div id="sales-history-modal-host"></div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#sales-history-modal-close').addEventListener('click', closeModal);
    modalRoot.querySelector('#sales-history-modal-backdrop').addEventListener('click', (event) => {
      if (event.target.id === 'sales-history-modal-backdrop') {
        closeModal();
      }
    });

    renderHistoryModalContent();
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
        closeScannerModal();
      }
    });
  }

  function renderBarcodeActionButton() {
    return `
      <button
        class="icon-btn"
        id="camera-scan-btn"
        type="button"
        title="Ler código de barras"
        aria-label="Ler código de barras"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 7v10"></path>
          <path d="M7 7v10"></path>
          <path d="M10 7v10"></path>
          <path d="M14 7v10"></path>
          <path d="M17 7v10"></path>
          <path d="M20 7v10"></path>
        </svg>
      </button>
    `;
  }

  function render() {
    const cartTotal = calculateCartTotal();
    const mobile = isMobileDevice();

    tabEls.sales.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card">
            <span>Itens no carrinho</span>
            <strong id="sale-items-count">${state.cart.length}</strong>
          </div>
          <div class="metric-card">
            <span>Subtotal</span>
            <strong>${currency(cartTotal.subtotal)}</strong>
          </div>
          <div class="metric-card">
            <span>Total atual</span>
            <strong>${currency(cartTotal.total)}</strong>
          </div>
          <div class="metric-card">
            <span>Troco</span>
            <strong>${currency(cartTotal.change)}</strong>
          </div>
        </div>

        <div class="sales-layout">
          <div class="section-stack">
            <div class="panel">
              <div class="section-header">
                <h2>Busca de produtos</h2>
                <span class="muted">Nome, código de barras, leitor USB e câmera</span>
              </div>

              <div class="search-row">
                <div class="input-with-action" style="flex:1 1 240px;">
                  <input id="sale-product-search" placeholder="Pesquisar ou bipar código de barras" autocomplete="off" />
                  ${renderBarcodeActionButton()}
                </div>
                <button id="sale-product-search-btn" class="btn btn-secondary" type="button">Buscar</button>
              </div>

              <div class="auth-hint" style="margin-top:10px;">
                ${mobile
                  ? 'No celular, toque no ícone ao lado do campo para abrir a câmera.'
                  : 'No computador, toque no ícone para focar o campo e use a leitora USB.'}
              </div>

              <div class="form-actions" style="margin-top:12px;">
                <button id="open-sales-history-btn" class="btn btn-secondary" type="button">Histórico de vendas</button>
              </div>

              <div id="sale-search-results" class="stack-list slim-list" style="margin-top:14px;"></div>
            </div>
          </div>

          <div class="section-stack sticky-summary">
            <div class="panel summary-highlight">
              <div class="section-header">
                <h2>Venda atual</h2>
                <span class="badge-soft">${state.cart.length} item(ns)</span>
              </div>

              <div id="cart-list" class="cart-list">${renderCartItems()}</div>

              <form id="sale-form" class="form-grid" style="margin-top:16px;">
                <input type="hidden" id="sale-client-id" value="" />

                <label style="grid-column:1 / -1;">Cliente selecionado
                  <input id="sale-client-selected" value="" placeholder="Nenhum cliente selecionado" readonly />
                </label>

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
        </div>
      </div>
    `;

    const searchInput = tabEls.sales.querySelector('#sale-product-search');

    tabEls.sales.querySelector('#sale-product-search-btn').addEventListener('click', handleSaleSearch);
    tabEls.sales.querySelector('#open-sales-history-btn').addEventListener('click', openHistoryModal);
    searchInput.addEventListener('keydown', handleSalesSearchInputKeydown);
    searchInput.addEventListener('input', handleSalesSearchInputAutoScan);
    tabEls.sales.querySelector('#sale-form').addEventListener('submit', handleSaleSubmit);
    tabEls.sales.querySelector('#clear-cart-btn').addEventListener('click', clearCartWithFeedback);
    tabEls.sales.querySelector('#camera-scan-btn')?.addEventListener('click', handleBarcodeReadAction);

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