import { escapeHtml, renderBlocked, showToast } from './ui.js';

export function createPurchasesModule(ctx) {
  const {
    state,
    tabEls,
    refs,
    createDoc,
    updateByPath,
    currency,
    toNumber,
    hasPermission,
    inventoryModule,
    payablesModule,
    auditModule
  } = ctx;

  let orderItems = [];
  let filters = {
    supplier: '',
    status: ''
  };

  function getFilteredOrders() {
    return (state.purchaseOrders || [])
      .filter((item) => {
        const supplier = String(item.supplierName || '').toLowerCase();

        return (!filters.supplier || supplier.includes(filters.supplier.toLowerCase()))
          && (!filters.status || String(item.status || '') === filters.status);
      })
      .sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const db = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return db - da;
      });
  }

  function renderOrderItems() {
    if (!orderItems.length) {
      return '<div class="empty-state">Nenhum item no pedido.</div>';
    }

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Qtd</th>
              <th>Custo</th>
              <th>Total</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${orderItems.map((item, index) => `
              <tr>
                <td>${escapeHtml(item.productName || '-')}</td>
                <td>${item.quantity}</td>
                <td>${currency(item.costPrice || 0)}</td>
                <td>${currency((item.quantity || 0) * (item.costPrice || 0))}</td>
                <td>
                  <button class="btn btn-danger" data-order-remove="${index}">Remover</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function getOrderTotal(items = orderItems) {
    return items.reduce((sum, item) => {
      return sum + (Number(item.quantity || 0) * Number(item.costPrice || 0));
    }, 0);
  }

  function bindItemEvents() {
    tabEls.purchases.querySelectorAll('[data-order-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        orderItems.splice(Number(btn.dataset.orderRemove), 1);
        render();
      });
    });
  }

  async function createPurchaseOrder(payload) {
    if (!orderItems.length) {
      throw new Error('Adicione ao menos um item ao pedido.');
    }

    const data = {
      supplierId: payload.supplierId || '',
      supplierName: String(payload.supplierName || '').trim(),
      notes: String(payload.notes || '').trim(),
      expectedDate: payload.expectedDate || '',
      status: 'Aberto',
      items: orderItems.map((item) => ({
        productId: item.productId || '',
        productName: item.productName || '',
        quantity: Number(item.quantity || 0),
        costPrice: Number(item.costPrice || 0)
      })),
      totalAmount: getOrderTotal(orderItems),
      createdAt: new Date(),
      createdById: state.currentUser?.uid || '',
      createdByName: state.currentUser?.fullName || ''
    };

    const createdId = await createDoc(refs.purchaseOrders, data);

    await auditModule.log({
      module: 'purchases',
      action: 'create_order',
      entityType: 'purchase_order',
      entityId: createdId,
      entityLabel: data.supplierName || 'Pedido de compra',
      description: 'Pedido de compra criado.',
      metadata: {
        totalAmount: data.totalAmount,
        items: data.items.length
      }
    });

    orderItems = [];
    showToast('Pedido de compra criado.', 'success');
  }

  async function receivePurchase(orderId, paidNow = 0, dueDate = '') {
    const order = (state.purchaseOrders || []).find((item) => item.id === orderId);

    if (!order) {
      throw new Error('Pedido não encontrado.');
    }

    if (String(order.status || '') === 'Recebido') {
      throw new Error('Este pedido já foi recebido.');
    }

    const totalAmount = Number(order.totalAmount || 0);
    const paidAmount = toNumber(paidNow);
    const openAmount = Math.max(0, totalAmount - paidAmount);

    for (const item of order.items || []) {
      if (item.productId) {
        await inventoryModule.registerMovement({
          productId: item.productId,
          type: 'entrada',
          quantity: Number(item.quantity || 0),
          reason: `Recebimento de compra do fornecedor ${order.supplierName || ''}`,
          notes: `Pedido de compra ${orderId}`
        });
      }
    }

    const purchaseId = await createDoc(refs.purchases, {
      purchaseOrderId: orderId,
      supplierId: order.supplierId || '',
      supplierName: order.supplierName || '',
      items: order.items || [],
      totalAmount,
      paidAmount,
      openAmount,
      dueDate: dueDate || '',
      receivedAt: new Date(),
      receivedById: state.currentUser?.uid || '',
      receivedByName: state.currentUser?.fullName || ''
    });

    await updateByPath('purchase_orders', orderId, {
      status: 'Recebido',
      purchaseId
    });

    if (openAmount > 0) {
      await payablesModule.createPayable({
        supplierId: order.supplierId || '',
        supplierName: order.supplierName || '',
        description: `Compra recebida do pedido ${orderId}`,
        totalAmount,
        paidAmount,
        dueDate: dueDate || '',
        paymentMethod: 'Boleto',
        notes: `Gerado automaticamente a partir do pedido ${orderId}`
      });
    }

    await auditModule.log({
      module: 'purchases',
      action: 'receive_order',
      entityType: 'purchase_order',
      entityId: orderId,
      entityLabel: order.supplierName || 'Pedido de compra',
      description: 'Pedido de compra recebido.',
      metadata: {
        purchaseId,
        totalAmount,
        paidAmount,
        openAmount
      }
    });

    showToast('Compra recebida com sucesso.', 'success');
  }

  function renderReceiveModal(orderId) {
    const order = (state.purchaseOrders || []).find((item) => item.id === orderId);
    if (!order) return;

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="purchase-modal-backdrop">
        <div class="modal-card">
          <div class="section-header">
            <h2>Receber compra</h2>
            <button class="btn btn-secondary" id="purchase-modal-close">Fechar</button>
          </div>

          <div class="card" style="margin-bottom:16px;">
            <strong>${escapeHtml(order.supplierName || '-')}</strong>
            <p class="muted">Total do pedido: ${currency(order.totalAmount || 0)}</p>
            <p class="muted">Itens: ${(order.items || []).length}</p>
          </div>

          <form id="purchase-receive-form" class="form-grid">
            <label>Valor pago agora<input name="paidNow" type="number" min="0" step="0.01" value="0" /></label>
            <label>Vencimento do saldo<input name="dueDate" type="date" /></label>
            <div class="form-actions" style="grid-column:1 / -1;">
              <button class="btn btn-primary" type="submit">Confirmar recebimento</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#purchase-modal-close').addEventListener('click', closeModal);
    modalRoot.querySelector('#purchase-modal-backdrop').addEventListener('click', (event) => {
      if (event.target.id === 'purchase-modal-backdrop') {
        closeModal();
      }
    });

    modalRoot.querySelector('#purchase-receive-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      try {
        const values = Object.fromEntries(new FormData(event.currentTarget).entries());
        await receivePurchase(orderId, values.paidNow, values.dueDate);
        closeModal();
        render();
      } catch (error) {
        alert(error.message || 'Erro ao receber compra.');
      }
    });
  }

  function bindEvents() {
    tabEls.purchases.querySelector('#purchase-add-item-btn').addEventListener('click', () => {
      const productId = tabEls.purchases.querySelector('#purchase-item-product-id').value || '';
      const productName = tabEls.purchases.querySelector('#purchase-item-product-name').value || '';
      const quantity = toNumber(tabEls.purchases.querySelector('#purchase-item-quantity').value || 0);
      const costPrice = toNumber(tabEls.purchases.querySelector('#purchase-item-cost').value || 0);

      if (!productName || quantity <= 0 || costPrice < 0) {
        alert('Preencha produto, quantidade e custo corretamente.');
        return;
      }

      orderItems.push({
        productId,
        productName,
        quantity,
        costPrice
      });

      tabEls.purchases.querySelector('#purchase-item-product-id').value = '';
      tabEls.purchases.querySelector('#purchase-item-product-name').value = '';
      tabEls.purchases.querySelector('#purchase-item-quantity').value = '';
      tabEls.purchases.querySelector('#purchase-item-cost').value = '';

      render();
    });

    tabEls.purchases.querySelector('#purchase-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      try {
        const values = Object.fromEntries(new FormData(event.currentTarget).entries());
        await createPurchaseOrder(values);
        event.currentTarget.reset();
        render();
      } catch (error) {
        alert(error.message || 'Erro ao criar pedido de compra.');
      }
    });

    tabEls.purchases.querySelector('#purchase-filter-apply').addEventListener('click', () => {
      filters.supplier = tabEls.purchases.querySelector('#purchase-filter-supplier').value || '';
      filters.status = tabEls.purchases.querySelector('#purchase-filter-status').value || '';
      render();
    });

    tabEls.purchases.querySelector('#purchase-filter-clear').addEventListener('click', () => {
      filters = {
        supplier: '',
        status: ''
      };
      render();
    });

    tabEls.purchases.querySelectorAll('[data-purchase-receive]').forEach((btn) => {
      btn.addEventListener('click', () => {
        renderReceiveModal(btn.dataset.purchaseReceive);
      });
    });

    tabEls.purchases.querySelector('#purchase-product-picker-btn').addEventListener('click', () => {
      const modalRoot = document.getElementById('modal-root');
      if (!modalRoot) return;

      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="purchase-product-modal-backdrop">
          <div class="modal-card">
            <div class="section-header">
              <h2>Selecionar produto</h2>
              <button class="btn btn-secondary" id="purchase-product-modal-close">Fechar</button>
            </div>

            <div class="search-row">
              <input id="purchase-product-search" placeholder="Buscar produto" />
            </div>

            <div id="purchase-product-results" class="stack-list" style="margin-top:12px;"></div>
          </div>
        </div>
      `;

      const closeModal = () => {
        modalRoot.innerHTML = '';
      };

      modalRoot.querySelector('#purchase-product-modal-close').addEventListener('click', closeModal);
      modalRoot.querySelector('#purchase-product-modal-backdrop').addEventListener('click', (event) => {
        if (event.target.id === 'purchase-product-modal-backdrop') {
          closeModal();
        }
      });

      const searchInput = modalRoot.querySelector('#purchase-product-search');
      const resultsEl = modalRoot.querySelector('#purchase-product-results');

      const renderResults = () => {
        const term = String(searchInput.value || '').toLowerCase();

        const rows = (state.products || [])
          .filter((item) => String(item.name || '').toLowerCase().includes(term))
          .slice(0, 20);

        resultsEl.innerHTML = rows.map((item) => `
          <div class="list-item">
            <strong>${escapeHtml(item.name || '-')}</strong>
            <span>Custo atual: ${currency(item.costPrice || 0)} · Estoque: ${item.quantity || 0}</span>
            <div class="inline-row" style="margin-top:8px;">
              <button class="btn btn-primary" data-product-pick="${item.id}">Selecionar</button>
            </div>
          </div>
        `).join('') || '<div class="empty-state">Nenhum produto encontrado.</div>';

        resultsEl.querySelectorAll('[data-product-pick]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const product = (state.products || []).find((item) => item.id === btn.dataset.productPick);
            if (!product) return;

            tabEls.purchases.querySelector('#purchase-item-product-id').value = product.id;
            tabEls.purchases.querySelector('#purchase-item-product-name').value = product.name || '';
            tabEls.purchases.querySelector('#purchase-item-cost').value = Number(product.costPrice || 0);
            closeModal();
          });
        });
      };

      searchInput.addEventListener('input', renderResults);
      renderResults();
    });

    bindItemEvents();
  }

  function render() {
    if (!hasPermission(state.currentUser, 'purchases')) {
      tabEls.purchases.innerHTML = renderBlocked();
      return;
    }

    const rows = getFilteredOrders();

    tabEls.purchases.innerHTML = `
      <div class="panel">
        <div class="section-header">
          <h2>Pedido de compra</h2>
          <span class="muted">Solicitação e recebimento de compras de fornecedores</span>
        </div>

        <form id="purchase-form" class="form-grid">
          <label>Fornecedor
            <input name="supplierName" list="suppliers-purchase-datalist" required />
          </label>

          <datalist id="suppliers-purchase-datalist">
            ${(state.suppliers || [])
              .filter((item) => item.active !== false)
              .map((item) => `<option value="${escapeHtml(item.name || '')}"></option>`)
              .join('')}
          </datalist>

          <label>Previsão de entrega<input name="expectedDate" type="date" /></label>
          <label style="grid-column:1 / -1;">Observações<textarea name="notes"></textarea></label>

          <div class="card" style="grid-column:1 / -1;">
            <h3>Itens do pedido</h3>

            <input type="hidden" id="purchase-item-product-id" />

            <div class="search-row" style="margin-top:12px; flex-wrap:wrap;">
              <input id="purchase-item-product-name" placeholder="Produto" />
              <button class="btn btn-secondary" type="button" id="purchase-product-picker-btn">Selecionar produto</button>
              <input id="purchase-item-quantity" type="number" min="1" step="1" placeholder="Qtd" />
              <input id="purchase-item-cost" type="number" min="0" step="0.01" placeholder="Custo" />
              <button class="btn btn-secondary" type="button" id="purchase-add-item-btn">Adicionar item</button>
            </div>

            <div style="margin-top:12px;">
              ${renderOrderItems()}
            </div>

            <div class="summary-line total" style="margin-top:12px;">
              <span>Total do pedido</span>
              <strong>${currency(getOrderTotal())}</strong>
            </div>
          </div>

          <div class="form-actions" style="grid-column:1 / -1;">
            <button class="btn btn-primary" type="submit">Criar pedido de compra</button>
          </div>
        </form>
      </div>

      <div class="table-card" style="margin-top:18px;">
        <div class="section-header">
          <h2>Pedidos de compra</h2>
        </div>

        <div class="search-row" style="margin-bottom:14px;">
          <input id="purchase-filter-supplier" placeholder="Fornecedor" value="${escapeHtml(filters.supplier)}" />
          <select id="purchase-filter-status">
            <option value="">Todos</option>
            <option value="Aberto" ${filters.status === 'Aberto' ? 'selected' : ''}>Aberto</option>
            <option value="Recebido" ${filters.status === 'Recebido' ? 'selected' : ''}>Recebido</option>
          </select>
          <button class="btn btn-secondary" id="purchase-filter-apply">Filtrar</button>
          <button class="btn btn-secondary" id="purchase-filter-clear">Limpar</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Previsão</th>
                <th>Status</th>
                <th>Total</th>
                <th>Itens</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((item) => `
                <tr>
                  <td>${escapeHtml(item.supplierName || '-')}</td>
                  <td>${escapeHtml(item.expectedDate || '-')}</td>
                  <td>${escapeHtml(item.status || '-')}</td>
                  <td>${currency(item.totalAmount || 0)}</td>
                  <td>${(item.items || []).length}</td>
                  <td>
                    <div class="inline-row">
                      ${String(item.status || '') !== 'Recebido'
                        ? `<button class="btn btn-primary" data-purchase-receive="${item.id}">Receber compra</button>`
                        : ''}
                    </div>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="6">Nenhum pedido encontrado.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    bindEvents();
  }

  return {
    render,
    createPurchaseOrder,
    receivePurchase
  };
}