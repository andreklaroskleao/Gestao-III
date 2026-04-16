import { escapeHtml } from './ui.js';

export function createProductsModule(ctx) {
  const {
    state,
    tabEls,
    refs,
    createDoc,
    updateByPath,
    currency,
    toNumber,
    inventoryModule,
    auditModule
  } = ctx;

  let movementFilters = {
    product: '',
    type: '',
    reason: '',
    dateFrom: '',
    dateTo: ''
  };

  let productFilters = {
    text: '',
    status: ''
  };

  function getFilteredProducts() {
    return (state.products || []).filter((product) => {
      const haystack = [
        product.name,
        product.barcode,
        product.supplier,
        product.brand,
        product.manufacturer,
        product.serialNumber
      ].join(' ').toLowerCase();

      return (!productFilters.text || haystack.includes(productFilters.text.toLowerCase()))
        && (!productFilters.status || product.status === productFilters.status);
    });
  }

  function getEditingProduct() {
    return (state.products || []).find((item) => item.id === state.editingProductId) || null;
  }

  function getProductSummary() {
    const allProducts = state.products || [];
    const activeProducts = allProducts.filter((item) => item.status !== 'inativo');
    const lowStockCount = activeProducts.filter((item) => Number(item.quantity || 0) <= Number(state.settings?.lowStockThreshold || 5)).length;
    const totalUnits = activeProducts.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const inventoryValue = activeProducts.reduce((sum, item) => {
      return sum + (Number(item.quantity || 0) * Number(item.costPrice || 0));
    }, 0);

    return {
      totalCount: allProducts.length,
      activeCount: activeProducts.length,
      lowStockCount,
      totalUnits,
      inventoryValue
    };
  }

  function bindProductTableActions(scope) {
    scope.querySelectorAll('[data-product-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingProductId = btn.dataset.productEdit;
        render();
      });
    });

    scope.querySelectorAll('[data-product-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const product = state.products.find((item) => item.id === btn.dataset.productDelete);

        await updateByPath('products', btn.dataset.productDelete, {
          deleted: false,
          status: 'inativo'
        });

        await auditModule.log({
          module: 'products',
          action: 'inactivate',
          entityType: 'product',
          entityId: btn.dataset.productDelete,
          entityLabel: product?.name || '',
          description: 'Produto inativado.'
        });
      });
    });

    scope.querySelectorAll('[data-product-reactivate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const product = state.products.find((item) => item.id === btn.dataset.productReactivate);

        await updateByPath('products', btn.dataset.productReactivate, {
          deleted: false,
          status: 'ativo'
        });

        await auditModule.log({
          module: 'products',
          action: 'reactivate',
          entityType: 'product',
          entityId: btn.dataset.productReactivate,
          entityLabel: product?.name || '',
          description: 'Produto reativado.'
        });
      });
    });

    scope.querySelectorAll('[data-product-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        inventoryModule.renderMovementModal(btn.dataset.productMove, render);
      });
    });
  }

  function applyMovementFilters() {
    movementFilters.product = tabEls.products.querySelector('#movement-filter-product')?.value || '';
    movementFilters.type = tabEls.products.querySelector('#movement-filter-type')?.value || '';
    movementFilters.reason = tabEls.products.querySelector('#movement-filter-reason')?.value || '';
    movementFilters.dateFrom = tabEls.products.querySelector('#movement-filter-date-from')?.value || '';
    movementFilters.dateTo = tabEls.products.querySelector('#movement-filter-date-to')?.value || '';
    render();
  }

  async function handleProductSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    payload.costPrice = toNumber(payload.costPrice);
    payload.salePrice = toNumber(payload.salePrice);
    payload.quantity = toNumber(payload.quantity);
    payload.status = payload.status || 'ativo';
    payload.deleted = false;

    if (state.editingProductId) {
      const current = state.products.find((item) => item.id === state.editingProductId);

      await updateByPath('products', state.editingProductId, payload);

      await auditModule.log({
        module: 'products',
        action: 'update',
        entityType: 'product',
        entityId: state.editingProductId,
        entityLabel: payload.name || current?.name || '',
        description: 'Produto atualizado.',
        metadata: {
          previousName: current?.name || '',
          newName: payload.name || ''
        }
      });

      state.editingProductId = null;
    } else {
      const createdId = await createDoc(refs.products, payload);

      await auditModule.log({
        module: 'products',
        action: 'create',
        entityType: 'product',
        entityId: createdId,
        entityLabel: payload.name || '',
        description: 'Produto cadastrado.'
      });
    }

    form.reset();
    render();
  }

  function fillEditingForm(form) {
    const editing = getEditingProduct();
    if (!editing) return;

    Object.entries(editing).forEach(([key, value]) => {
      if (form.elements[key]) {
        form.elements[key].value = value ?? '';
      }
    });
  }

  function bindEvents() {
    const form = tabEls.products.querySelector('#product-form');

    form.addEventListener('submit', handleProductSubmit);

    tabEls.products.querySelector('#product-reset-btn').addEventListener('click', () => {
      state.editingProductId = null;
      render();
    });

    tabEls.products.querySelector('#product-filter-apply').addEventListener('click', () => {
      productFilters.text = tabEls.products.querySelector('#product-filter-input').value || '';
      productFilters.status = tabEls.products.querySelector('#product-status-filter').value || '';
      render();
    });

    tabEls.products.querySelector('#product-filter-clear').addEventListener('click', () => {
      productFilters = {
        text: '',
        status: ''
      };
      render();
    });

    tabEls.products.querySelector('#movement-filter-apply').addEventListener('click', applyMovementFilters);

    tabEls.products.querySelector('#movement-filter-clear').addEventListener('click', () => {
      movementFilters = {
        product: '',
        type: '',
        reason: '',
        dateFrom: '',
        dateTo: ''
      };
      render();
    });

    bindProductTableActions(tabEls.products);
  }

  function renderActionButtons(product) {
    if (product.status === 'inativo') {
      return `
        <div class="clean-table-actions">
          <button class="btn btn-secondary" type="button" data-product-edit="${product.id}">Editar</button>
          <button class="btn btn-secondary" type="button" data-product-reactivate="${product.id}">Reativar</button>
        </div>
      `;
    }

    return `
      <div class="clean-table-actions">
        <button class="btn btn-secondary" type="button" data-product-edit="${product.id}">Editar</button>
        <button class="btn btn-secondary" type="button" data-product-move="${product.id}">Movimentar</button>
        <button class="btn btn-danger" type="button" data-product-delete="${product.id}">Inativar</button>
      </div>
    `;
  }

  function render() {
    const rows = getFilteredProducts();
    const editing = getEditingProduct();
    const summary = getProductSummary();

    tabEls.products.innerHTML = `
      <div class="section-stack">
        <div class="cards-grid">
          <div class="metric-card">
            <span>Total de produtos</span>
            <strong>${summary.totalCount}</strong>
          </div>
          <div class="metric-card">
            <span>Produtos ativos</span>
            <strong>${summary.activeCount}</strong>
          </div>
          <div class="metric-card">
            <span>Estoque baixo</span>
            <strong>${summary.lowStockCount}</strong>
          </div>
          <div class="metric-card">
            <span>Valor em custo</span>
            <strong>${currency(summary.inventoryValue)}</strong>
          </div>
        </div>

        <div class="users-layout">
          <div class="panel">
            <div class="section-header">
              <h2>${editing ? 'Editar produto' : 'Cadastro de produtos'}</h2>
              <span class="muted">${editing ? 'Atualize os dados do produto.' : 'Cadastro otimizado para celular e desktop.'}</span>
            </div>

            <form id="product-form" class="form-grid mobile-optimized">
              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>1. Identificação</h3>
                  <span>Dados principais do produto</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Nome do produto<input name="name" required /></label>
                  <label>Número de série<input name="serialNumber" /></label>
                  <label>Código de barras<input name="barcode" /></label>
                  <label>Status
                    <select name="status">
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </select>
                  </label>
                </div>
              </div>

              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>2. Comercial e estoque</h3>
                  <span>Valores e quantidade</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Preço de custo<input name="costPrice" type="number" step="0.01" min="0" /></label>
                  <label>Preço de venda<input name="salePrice" type="number" step="0.01" min="0" required /></label>
                  <label>Quantidade<input name="quantity" type="number" step="1" min="0" required /></label>
                  <label>Fornecedor
                    <input name="supplier" list="suppliers-datalist" />
                    <datalist id="suppliers-datalist">
                      ${(state.suppliers || [])
                        .filter((item) => item.active !== false)
                        .map((item) => `<option value="${escapeHtml(item.name || '')}"></option>`)
                        .join('')}
                    </datalist>
                  </label>
                </div>
              </div>

              <div class="form-section" style="grid-column:1 / -1;">
                <div class="form-section-title">
                  <h3>3. Marca e fabricante</h3>
                  <span>Complemento do cadastro</span>
                </div>
                <div class="soft-divider"></div>

                <div class="form-grid">
                  <label>Marca<input name="brand" /></label>
                  <label>Fabricante<input name="manufacturer" /></label>
                </div>
              </div>

              <div class="form-actions" style="grid-column: 1 / -1;">
                <button class="btn btn-primary" type="submit">${editing ? 'Salvar alterações' : 'Cadastrar produto'}</button>
                <button class="btn btn-secondary" type="button" id="product-reset-btn">Limpar</button>
              </div>
            </form>
          </div>

          <div class="section-stack">
            <div class="table-card">
              <div class="section-header">
                <h2>Lista de produtos</h2>
                <span class="muted">${rows.length} resultado(s)</span>
              </div>

              <div class="search-row">
                <input id="product-filter-input" placeholder="Pesquisar por nome, código, fornecedor, marca ou fabricante" value="${escapeHtml(productFilters.text)}" />
                <select id="product-status-filter">
                  <option value="">Todos os status</option>
                  <option value="ativo" ${productFilters.status === 'ativo' ? 'selected' : ''}>Ativo</option>
                  <option value="inativo" ${productFilters.status === 'inativo' ? 'selected' : ''}>Inativo</option>
                </select>
                <button class="btn btn-secondary" type="button" id="product-filter-apply">Filtrar</button>
                <button class="btn btn-secondary" type="button" id="product-filter-clear">Limpar</button>
              </div>

              <div class="table-wrap" style="margin-top:14px;">
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Série</th>
                      <th>Marca</th>
                      <th>Fornecedor</th>
                      <th>Custo</th>
                      <th>Venda</th>
                      <th>Qtd</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody id="products-tbody">
                    ${rows.map((product) => `
                      <tr>
                        <td>${escapeHtml(product.name)}</td>
                        <td>${escapeHtml(product.serialNumber || '-')}</td>
                        <td>${escapeHtml(product.brand || '-')}</td>
                        <td>${escapeHtml(product.supplier || '-')}</td>
                        <td>${currency(product.costPrice)}</td>
                        <td>${currency(product.salePrice)}</td>
                        <td>${product.quantity ?? 0}</td>
                        <td><span class="tag ${product.status === 'ativo' ? 'success' : 'warning'}">${product.status || 'ativo'}</span></td>
                        <td>${renderActionButtons(product)}</td>
                      </tr>
                    `).join('') || '<tr><td colspan="9">Nenhum produto cadastrado.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="table-card">
              <div class="section-header">
                <h2>Movimentação de estoque</h2>
                <span class="muted">Histórico e rastreabilidade</span>
              </div>

              <div class="search-row" style="margin-bottom:14px; flex-wrap:wrap;">
                <input id="movement-filter-product" placeholder="Produto" value="${escapeHtml(movementFilters.product)}" />
                <select id="movement-filter-type">
                  <option value="">Todos os tipos</option>
                  <option value="entrada" ${movementFilters.type === 'entrada' ? 'selected' : ''}>Entrada</option>
                  <option value="saida" ${movementFilters.type === 'saida' ? 'selected' : ''}>Saída</option>
                  <option value="ajuste" ${movementFilters.type === 'ajuste' ? 'selected' : ''}>Ajuste</option>
                </select>
                <input id="movement-filter-reason" placeholder="Motivo" value="${escapeHtml(movementFilters.reason)}" />
                <input id="movement-filter-date-from" type="date" value="${movementFilters.dateFrom}" />
                <input id="movement-filter-date-to" type="date" value="${movementFilters.dateTo}" />
                <button class="btn btn-secondary" type="button" id="movement-filter-apply">Filtrar</button>
                <button class="btn btn-secondary" type="button" id="movement-filter-clear">Limpar</button>
              </div>

              ${inventoryModule.renderMovementTable(movementFilters)}
            </div>
          </div>
        </div>
      </div>
    `;

    const form = tabEls.products.querySelector('#product-form');
    fillEditingForm(form);
    bindEvents();
  }

  return {
    render
  };
}