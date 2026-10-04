// Insumos Lifting: punto de venta, stock, compras, clientes y despachos.
const App = (() => {
  const { esc, clp } = Print;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const num = v => { const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
  const int = v => Math.round(num(v));

  const MEDIOS_PAGO = ['Efectivo', 'Transferencia', 'MercadoPago'];
  const EMPRESAS_ENVIO = ['Starken', 'Blue Express'];
  const ORIGENES = ['RRSS', 'Web', 'WhatsApp', 'Otro'];
  const DOCUMENTOS = ['Boleta', 'Factura', 'Sin documento'];
  const ESTADOS_ENVIO = ['Por preparar', 'Listo para enviar', 'Enviado', 'Entregado'];

  let config = {};
  let view = 'vender';
  let stock = new Map();
  let search = '';
  let cart = loadCart();

  // ---------- Datos ----------
  function computeStock() {
    stock = new Map();
    for (const m of DB.all('movimientos')) stock.set(m.varianteId, (stock.get(m.varianteId) || 0) + m.cantidad);
  }
  const stockOf = id => stock.get(id) || 0;
  const producto = id => DB.get('productos', id);
  const variante = id => DB.get('variantes', id);
  const variantesDe = pid => DB.all('variantes').filter(v => v.productoId === pid);
  function nombreVariante(v) {
    const p = producto(v.productoId);
    return (p ? p.nombre : '¿?') + (v.nombre ? ' · ' + v.nombre : '');
  }
  const productosActivos = () => DB.all('productos').filter(p => p.activo !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const cliente = id => id ? DB.get('clientes', id) : null;
  function folio(prefix) {
    const d = new Date();
    const ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return `${prefix}${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }
  const match = (text, q) => !q || text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .includes(q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));

  // ---------- Carrito ----------
  function emptyCart() {
    return { lines: [], descTipo: '%', descValor: 0, entrega: 'retiro', empresa: EMPRESAS_ENVIO[0], envioCosto: 0,
      clienteId: null, medioPago: MEDIOS_PAGO[0], documento: DOCUMENTOS[0], nota: '' };
  }
  function loadCart() { try { return { ...emptyCart(), ...JSON.parse(localStorage.getItem('carrito') || '{}') }; } catch { return emptyCart(); } }
  function saveCart() { try { localStorage.setItem('carrito', JSON.stringify(cart)); } catch {} }
  function lineTotals(l) {
    const bruto = l.precio * l.cantidad;
    const desc = l.descTipo === '%' ? Math.round(bruto * (num(l.descValor) / 100)) : Math.min(bruto, int(l.descValor));
    return { bruto, desc, total: bruto - desc };
  }
  function cartTotals() {
    const subtotal = cart.lines.reduce((s, l) => s + lineTotals(l).total, 0);
    const descuento = cart.descTipo === '%' ? Math.round(subtotal * (num(cart.descValor) / 100)) : Math.min(subtotal, int(cart.descValor));
    const envio = cart.entrega === 'despacho' ? int(cart.envioCosto) : 0;
    return { subtotal, descuento, envio, total: subtotal - descuento + envio };
  }
  function addToCart(varianteId) {
    const v = variante(varianteId);
    const line = cart.lines.find(l => l.varianteId === varianteId);
    if (line) line.cantidad++;
    else cart.lines.push({ varianteId, cantidad: 1, precio: v.precio || 0, descTipo: '%', descValor: 0 });
    saveCart();
    render();
  }

  async function registrarVenta() {
    const t = cartTotals();
    if (!cart.lines.length) return toast('Agrega productos a la venta.');
    if (cart.entrega === 'despacho' && !cart.clienteId) return toast('Para despacho elige o crea un cliente.');
    const faltan = cart.lines.filter(l => stockOf(l.varianteId) < l.cantidad);
    if (faltan.length && !confirm('Hay productos sin stock suficiente:\n' + faltan.map(l => '• ' + nombreVariante(variante(l.varianteId))).join('\n') + '\n\n¿Registrar la venta igual?')) return;

    const id = DB.uid();
    const fecha = new Date().toISOString();
    // Reparte el descuento general entre las líneas para que la ganancia por producto sea correcta.
    const items = cart.lines.map(l => {
      const v = variante(l.varianteId);
      const lt = lineTotals(l);
      const parte = t.subtotal ? Math.round(t.descuento * lt.total / t.subtotal) : 0;
      return { varianteId: l.varianteId, productoId: v.productoId, nombre: nombreVariante(v), sku: v.sku || '',
        cantidad: l.cantidad, precio: l.precio, descuento: lt.desc + parte, total: lt.total, costo: v.costo || 0 };
    });
    const venta = {
      id, folio: folio('V'), fecha, usuario: config.usuario || '', clienteId: cart.clienteId,
      items, subtotal: t.subtotal, descuento: t.descuento, total: t.total, medioPago: cart.medioPago,
      documento: { tipo: cart.documento, estado: cart.documento === 'Sin documento' ? 'no aplica' : 'pendiente' },
      envio: cart.entrega === 'despacho'
        ? { tipo: 'despacho', empresa: cart.empresa, costo: t.envio, estado: ESTADOS_ENVIO[0], seguimiento: '' }
        : { tipo: 'retiro' },
      // Con MercadoPago la venta queda pendiente hasta que el cliente pague; el stock queda reservado.
      estado: cart.medioPago === 'MercadoPago' ? 'pendiente' : 'completada', nota: cart.nota || '',
      pago: cart.medioPago === 'MercadoPago' ? { estado: 'pendiente', link: '' } : { estado: 'pagado' },
    };
    await DB.save('ventas', venta);
    await DB.save('movimientos', items.map(it => ({ varianteId: it.varianteId, cantidad: -it.cantidad, tipo: 'venta', refId: id, fecha })));
    cart = emptyCart();
    saveCart();
    computeStock();
    render();
    if (venta.estado === 'pendiente') {
      toast(`Venta ${venta.folio} pendiente de pago. Generando link…`);
      await generarLinkPago(id);
    } else toast(`Venta ${venta.folio} registrada por ${clp(venta.total)}`);
    openVenta(id);
  }

  // ---------- MercadoPago ----------
  async function generarLinkPago(id) {
    const v = DB.get('ventas', id);
    if (!navigator.onLine) { toast('Sin internet: genera el link desde la venta cuando vuelva la conexión.'); return; }
    try {
      const r = await Sync.call({ action: 'mpLink', ventaId: v.id, titulo: `Insumos Lifting · pedido ${v.folio}`, monto: v.total,
        email: cliente(v.clienteId)?.email || '' });
      await DB.save('ventas', { ...v, pago: { ...(v.pago || {}), estado: 'pendiente', link: r.link } });
    } catch (e) { toast('No se pudo generar el link: ' + e.message); }
  }

  async function marcarPagada(id, detalle = {}) {
    const v = DB.get('ventas', id);
    if (v.estado !== 'pendiente') return;
    await DB.save('ventas', { ...v, estado: 'completada', pago: { ...(v.pago || {}), ...detalle, estado: 'pagado', pagadoEn: new Date().toISOString() } });
  }

  // Revisa en MercadoPago si las ventas pendientes ya se pagaron y las cierra solas.
  let revisando = false, ultimaRevision = 0;
  async function revisarPagos(ids) {
    if (revisando || !navigator.onLine || !config.url) return 0;
    if (!ids && Date.now() - ultimaRevision < 120000) return 0; // revisión automática cada 2 minutos
    if (!ids) ultimaRevision = Date.now();
    revisando = true;
    let cerradas = 0;
    try {
      const pendientes = (ids || DB.all('ventas').filter(v => v.estado === 'pendiente' && v.pago?.link && Date.now() - new Date(v.fecha) < 14 * 864e5).map(v => v.id)).slice(0, 20);
      for (const id of pendientes) {
        const r = await Sync.call({ action: 'mpEstado', ventaId: id });
        if (r.pagado) { await marcarPagada(id, { mpPagoId: r.pagoId, medio: r.medio || '' }); cerradas++; }
      }
    } catch (e) { /* se reintenta en la próxima sincronización */ }
    finally { revisando = false; }
    if (cerradas) { toast(cerradas === 1 ? 'Se recibió un pago de MercadoPago.' : `Se recibieron ${cerradas} pagos de MercadoPago.`); render(); }
    return cerradas;
  }

  // ---------- Vistas ----------
  const views = {
    vender() {
      const t = cartTotals();
      const cli = cliente(cart.clienteId);
      const prods = productosActivos().filter(p => match(p.nombre + ' ' + (p.categoria || '') + ' ' + (p.sku || '') + ' ' +
        variantesDe(p.id).map(v => v.nombre + ' ' + (v.sku || '')).join(' '), search));
      return `<div class="pos">
        <section>
          <input id="search" type="search" placeholder="Buscar producto, color, medida o código…" value="${esc(search)}" autocomplete="off">
          <div class="products">
            ${prods.map(p => {
              const vs = variantesDe(p.id);
              const total = vs.reduce((s, v) => s + stockOf(v.id), 0);
              const precios = vs.map(v => v.precio || 0);
              const min = Math.min(...precios), max = Math.max(...precios);
              return `<button class="prod ${total <= 0 ? 'out' : ''}" data-prod="${p.id}">
                <span class="name">${esc(p.nombre)}</span>
                <span class="muted">${vs.length > 1 ? vs.length + ' opciones · ' : ''}stock ${total}</span>
                <span class="price">${vs.length ? (min === max ? clp(min) : clp(min) + ' – ' + clp(max)) : '—'}</span>
              </button>`;
            }).join('') || `<div class="empty">${DB.all('productos').length ? 'Sin resultados.' : 'Aún no hay productos. Agrégalos en Inventario o impórtalos en Ajustes.'}</div>`}
          </div>
        </section>
        <aside class="card cart stack">
          <h2>Venta actual</h2>
          <div>
            ${cart.lines.map((l, i) => {
              const v = variante(l.varianteId); const lt = lineTotals(l);
              if (!v) return '';
              return `<div class="cart-line">
                <div><b>${esc(nombreVariante(v))}</b><div class="muted">${clp(l.precio)} c/u · stock ${stockOf(v.id)}</div></div>
                <div class="right num"><b>${clp(lt.total)}</b>${lt.desc ? `<div class="muted">-${clp(lt.desc)}</div>` : ''}</div>
                <div class="qty"><button data-dec="${i}">−</button><input data-qty="${i}" value="${l.cantidad}" inputmode="numeric"><button data-inc="${i}">+</button></div>
                <div class="row" style="justify-content:flex-end"><button class="btn small" data-linedesc="${i}">Descuento</button><button class="icon" data-del="${i}" aria-label="Quitar">✕</button></div>
              </div>`;
            }).join('') || '<div class="empty">Toca un producto para agregarlo.</div>'}
          </div>
          <div class="row"><label class="grow" style="margin:0">Descuento a la venta</label>
            <div class="seg">${['%', '$'].map(x => `<button data-desctipo="${x}" class="${cart.descTipo === x ? 'on' : ''}">${x}</button>`).join('')}</div>
            <input id="descValor" style="width:90px" inputmode="numeric" value="${cart.descValor || ''}" placeholder="0">
          </div>
          <div>
            <label>Entrega</label>
            <div class="seg">${[['retiro', 'Retiro / en mano'], ['despacho', 'Despacho']].map(([k, n]) => `<button data-entrega="${k}" class="${cart.entrega === k ? 'on' : ''}">${n}</button>`).join('')}</div>
          </div>
          ${cart.entrega === 'despacho' ? `<div class="grid2">
            <div><label>Empresa</label><select id="empresa">${EMPRESAS_ENVIO.map(e => `<option ${cart.empresa === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
            <div><label>Costo envío (lo paga el cliente)</label><input id="envioCosto" inputmode="numeric" value="${cart.envioCosto || ''}" placeholder="0"></div>
          </div>` : ''}
          <div>
            <label>Cliente ${cart.entrega === 'despacho' ? '(obligatorio para despacho)' : '(opcional)'}</label>
            <div class="row">
              <div class="grow">${cli ? `<b>${esc(cli.nombre)}</b><div class="muted">${esc([cli.comuna, cli.telefono].filter(Boolean).join(' · '))}</div>` : '<span class="muted">Sin cliente</span>'}</div>
              <button class="btn small" id="pickCliente">${cli ? 'Cambiar' : 'Elegir'}</button>
              ${cli ? '<button class="icon" id="clearCliente" aria-label="Quitar cliente">✕</button>' : ''}
            </div>
          </div>
          <div class="grid2">
            <div><label>Medio de pago</label><select id="medioPago">${MEDIOS_PAGO.map(m => `<option ${cart.medioPago === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
            <div><label>Documento</label><select id="documento">${DOCUMENTOS.map(m => `<option ${cart.documento === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
          </div>
          <div class="totals num">
            <div><span>Subtotal</span><span>${clp(t.subtotal)}</span></div>
            ${t.descuento ? `<div><span>Descuento</span><span>-${clp(t.descuento)}</span></div>` : ''}
            ${t.envio ? `<div><span>Envío</span><span>${clp(t.envio)}</span></div>` : ''}
            <div class="grand"><span>Total</span><span>${clp(t.total)}</span></div>
          </div>
          <div class="row">
            <button class="btn" id="clearCart" ${cart.lines.length ? '' : 'disabled'}>Vaciar</button>
            <button class="btn primary grow" id="checkout" ${cart.lines.length ? '' : 'disabled'}>${cart.medioPago === 'MercadoPago' ? 'Generar link de pago' : 'Registrar venta'}</button>
          </div>
        </aside>
      </div>`;
    },

    ventas() {
      const periodo = state.ventasPeriodo || '7';
      const desde = periodoDesde(periodo);
      const list = DB.all('ventas').filter(v => !desde || v.fecha >= desde)
        .filter(v => match(v.folio + ' ' + (cliente(v.clienteId)?.nombre || '') + ' ' + v.items.map(i => i.nombre).join(' '), state.ventasQ || ''))
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
      const total = list.filter(v => v.estado === 'completada').reduce((s, v) => s + v.total, 0);
      const nPend = list.filter(v => v.estado === 'pendiente').length;
      return `<div class="card stack">
        <div class="row"><h2 class="grow">Ventas</h2>${periodoSelect('ventasPeriodo', periodo)}</div>
        <input id="ventasQ" type="search" placeholder="Buscar por folio, cliente o producto…" value="${esc(state.ventasQ || '')}">
        <div class="muted">${list.length} venta(s) · ${clp(total)} cobrado${nPend ? ` · <b>${nPend} pendiente(s) de pago</b>` : ''}</div>
        <div class="table-wrap"><table>
          <tr><th>Fecha</th><th>Folio</th><th>Cliente</th><th>Entrega</th><th>Pago</th><th class="right">Total</th></tr>
          ${list.map(v => `<tr class="click" data-venta="${v.id}">
            <td>${new Date(v.fecha).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td>${esc(v.folio)} ${estadoPill(v)}</td>
            <td>${esc(cliente(v.clienteId)?.nombre || '—')}</td>
            <td>${v.envio?.tipo === 'despacho' ? `${esc(v.envio.empresa)} <span class="pill ${v.envio.estado === 'Entregado' ? 'ok' : v.envio.estado === 'Enviado' ? '' : 'warn'}">${esc(v.envio.estado)}</span>` : 'Retiro'}</td>
            <td>${esc(v.medioPago)}</td>
            <td class="right num">${clp(v.total)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No hay ventas en este periodo.</td></tr>'}
        </table></div></div>`;
    },

    inventario() {
      const q = state.invQ || '';
      const soloBajo = !!state.invBajo;
      const rows = [];
      let valorCosto = 0, valorVenta = 0;
      for (const p of DB.all('productos').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))) {
        for (const v of variantesDe(p.id)) {
          const s = stockOf(v.id);
          valorCosto += Math.max(0, s) * (v.costo || 0);
          valorVenta += Math.max(0, s) * (v.precio || 0);
          const bajo = s <= (p.stockMin ?? 0);
          if (soloBajo && !bajo) continue;
          if (!match(p.nombre + ' ' + v.nombre + ' ' + (v.sku || '') + ' ' + (p.categoria || ''), q)) continue;
          rows.push({ p, v, s, bajo });
        }
      }
      return `<div class="stack">
        <div class="kpis">
          <div class="card kpi"><div class="muted">Productos</div><div class="v">${DB.all('productos').length}</div></div>
          <div class="card kpi"><div class="muted">Inventario a costo</div><div class="v">${clp(valorCosto)}</div></div>
          <div class="card kpi"><div class="muted">Inventario a precio venta</div><div class="v">${clp(valorVenta)}</div></div>
        </div>
        <div class="card stack">
          <div class="row"><h2 class="grow">Inventario</h2><button class="btn primary" id="newProduct">Nuevo producto</button></div>
          <div class="row"><input class="grow" id="invQ" type="search" placeholder="Buscar…" value="${esc(q)}">
            <label class="row" style="margin:0"><input type="checkbox" id="invBajo" ${soloBajo ? 'checked' : ''}> Solo stock bajo</label></div>
          <div class="table-wrap"><table>
            <tr><th>Producto</th><th>Opción</th><th>Código</th><th class="right">Costo</th><th class="right">Precio</th><th class="right">Stock</th><th></th></tr>
            ${rows.map(({ p, v, s, bajo }) => `<tr>
              <td><a href="#" data-editprod="${p.id}">${esc(p.nombre)}</a>${p.activo === false ? ' <span class="pill">Inactivo</span>' : ''}<div class="muted">${esc(p.categoria || '')}</div></td>
              <td>${esc(v.nombre || '—')}</td><td>${esc(v.sku || '')}</td>
              <td class="right num">${clp(v.costo)}</td><td class="right num">${clp(v.precio)}</td>
              <td class="right num"><span class="pill ${bajo ? 'low' : 'ok'}">${s}</span></td>
              <td class="right"><button class="btn small" data-ajuste="${v.id}">Ajustar</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin productos.</td></tr>'}
          </table></div></div></div>`;
    },

    compras() {
      const list = DB.all('compras').sort((a, b) => b.fecha.localeCompare(a.fecha));
      return `<div class="card stack">
        <div class="row"><h2 class="grow">Compras a proveedores</h2><button class="btn primary" id="newCompra">Registrar compra</button></div>
        <p class="muted">Cada compra suma las unidades al stock y puede actualizar el precio costo.</p>
        <div class="table-wrap"><table>
          <tr><th>Fecha</th><th>Proveedor</th><th>Documento</th><th>Productos</th><th class="right">Total</th></tr>
          ${list.map(c => `<tr class="click" data-compra="${c.id}"><td>${new Date(c.fecha).toLocaleDateString('es-CL')}</td><td>${esc(c.proveedor)}</td>
            <td>${esc(c.documento || '')}</td><td>${c.items.reduce((s, i) => s + i.cantidad, 0)} u.</td><td class="right num">${clp(c.total)}</td></tr>`).join('')
            || '<tr><td colspan="5" class="empty">Aún no hay compras registradas.</td></tr>'}
        </table></div></div>`;
    },

    clientes() {
      const q = state.cliQ || '';
      const ventas = DB.all('ventas').filter(v => v.estado === 'completada');
      const list = DB.all('clientes').filter(c => match([c.nombre, c.rut, c.telefono, c.email, c.rrss, c.comuna].join(' '), q))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      return `<div class="card stack">
        <div class="row"><h2 class="grow">Clientes</h2><button class="btn primary" id="newCliente">Nuevo cliente</button></div>
        <input id="cliQ" type="search" placeholder="Buscar por nombre, RUT, teléfono, email o RRSS…" value="${esc(q)}">
        <div class="table-wrap"><table>
          <tr><th>Nombre</th><th>Contacto</th><th>Comuna</th><th>Origen</th><th class="right">Compras</th></tr>
          ${list.map(c => {
            const vs = ventas.filter(v => v.clienteId === c.id);
            return `<tr class="click" data-cliente="${c.id}"><td><b>${esc(c.nombre)}</b><div class="muted">${esc(c.rut || '')}</div></td>
              <td>${esc(c.telefono || '')}<div class="muted">${esc(c.email || '')} ${esc(c.rrss || '')}</div></td>
              <td>${esc(c.comuna || '')}</td><td>${esc(c.origen || '')}</td>
              <td class="right num">${vs.length} · ${clp(vs.reduce((s, v) => s + v.total, 0))}</td></tr>`;
          }).join('') || '<tr><td colspan="5" class="empty">Sin clientes.</td></tr>'}
        </table></div></div>`;
    },

    resumen() {
      const periodo = state.resPeriodo || '30';
      const desde = periodoDesde(periodo);
      const ventas = DB.all('ventas').filter(v => v.estado === 'completada' && (!desde || v.fecha >= desde));
      let neto = 0, costo = 0, envios = 0;
      const porPago = {}, porProd = {}, porOrigen = {};
      for (const v of ventas) {
        envios += v.envio?.costo || 0;
        porPago[v.medioPago] = (porPago[v.medioPago] || 0) + v.total;
        const o = cliente(v.clienteId)?.origen || 'Sin cliente';
        porOrigen[o] = (porOrigen[o] || 0) + 1;
        for (const it of v.items) {
          const venta = it.total - (it.descuento - (it.precio * it.cantidad - it.total));
          neto += venta; costo += it.costo * it.cantidad;
          const k = it.nombre; porProd[k] = porProd[k] || { u: 0, monto: 0 }; porProd[k].u += it.cantidad; porProd[k].monto += venta;
        }
      }
      const top = Object.entries(porProd).sort((a, b) => b[1].u - a[1].u).slice(0, 10);
      const bajos = [];
      for (const p of productosActivos()) for (const v of variantesDe(p.id)) if (stockOf(v.id) <= (p.stockMin ?? 0)) bajos.push(v);
      const box = (t, obj) => `<div class="card"><h3>${t}</h3><table>${Object.entries(obj).map(([k, n]) => `<tr><td>${esc(k)}</td><td class="right num">${typeof n === 'number' && t.includes('pago') ? clp(n) : n}</td></tr>`).join('') || '<tr><td class="muted">Sin datos</td></tr>'}</table></div>`;
      return `<div class="stack">
        <div class="row"><h2 class="grow">Resumen</h2>${periodoSelect('resPeriodo', periodo)}</div>
        <div class="kpis">
          <div class="card kpi"><div class="muted">Ventas (sin envío)</div><div class="v">${clp(neto)}</div></div>
          <div class="card kpi"><div class="muted">Costo de lo vendido</div><div class="v">${clp(costo)}</div></div>
          <div class="card kpi"><div class="muted">Ganancia</div><div class="v">${clp(neto - costo)}</div><div class="muted">${neto ? Math.round((neto - costo) / neto * 100) : 0}% margen</div></div>
          <div class="card kpi"><div class="muted">N° de ventas</div><div class="v">${ventas.length}</div><div class="muted">Promedio ${clp(ventas.length ? neto / ventas.length : 0)}</div></div>
          <div class="card kpi"><div class="muted">Envíos cobrados</div><div class="v">${clp(envios)}</div></div>
        </div>
        <div class="grid2">
          ${box('Por medio de pago', porPago)}
          ${box('Ventas por origen del cliente', porOrigen)}
          <div class="card"><h3>Más vendidos</h3><table>${top.map(([k, d]) => `<tr><td>${esc(k)}</td><td class="right num">${d.u} u.</td><td class="right num">${clp(d.monto)}</td></tr>`).join('') || '<tr><td class="muted">Sin datos</td></tr>'}</table></div>
          <div class="card"><h3>Stock bajo (${bajos.length})</h3><table>${bajos.slice(0, 15).map(v => `<tr><td>${esc(nombreVariante(v))}</td><td class="right"><span class="pill low">${stockOf(v.id)}</span></td></tr>`).join('') || '<tr><td class="muted">Todo en orden</td></tr>'}</table></div>
        </div></div>`;
    },

    ajustes() {
      const e = config.empresa || {};
      const s = Sync.status;
      return `<div class="stack" style="max-width:760px">
        <div class="card stack"><h2>Este dispositivo</h2>
          <div><label>Nombre de quien usa este dispositivo</label><input id="cfgUsuario" value="${esc(config.usuario || '')}" placeholder="Ej: Fabi"></div>
        </div>
        <div class="card stack"><h2>Datos del remitente (para etiquetas)</h2>
          <div class="grid2">
            <div><label>Nombre empresa</label><input data-emp="nombre" value="${esc(e.nombre || 'Insumos Lifting')}"></div>
            <div><label>RUT</label><input data-emp="rut" value="${esc(e.rut || '')}"></div>
            <div><label>Teléfono</label><input data-emp="telefono" value="${esc(e.telefono || '')}"></div>
            <div><label>Comuna</label><input data-emp="comuna" value="${esc(e.comuna || '')}"></div>
          </div>
          <div><label>Dirección</label><input data-emp="direccion" value="${esc(e.direccion || '')}"></div>
        </div>
        <div class="card stack"><h2>Planilla de respaldo (Google Sheets)</h2>
          <p class="muted">Pega aquí la dirección y la clave del Apps Script de tu planilla. Cada cambio se envía al instante; sin internet queda guardado y se envía solo al volver.</p>
          <div><label>Dirección del Apps Script</label><input id="cfgUrl" value="${esc(config.url || '')}" placeholder="https://script.google.com/macros/s/…/exec"></div>
          <div><label>Clave</label><input id="cfgClave" type="password" value="${esc(config.clave || '')}"></div>
          <div class="row"><button class="btn primary" id="saveCfg">Guardar</button><button class="btn" id="syncNow">Sincronizar ahora</button>
            <span class="muted grow">${s.state === 'ok' ? 'Sincronizado' + (s.last ? ' ' + s.last.toLocaleTimeString('es-CL') : '') : esc(s.error || '')}${s.pending ? ` · ${s.pending} cambio(s) en cola` : ''}</span></div>
        </div>
        <div class="card stack"><h2>Importar productos</h2>
          <p class="muted">Copia las celdas desde Google Sheets (con la fila de títulos) y pégalas aquí. Columnas reconocidas: producto, variante (o color / tamaño / medida), código, categoría, costo, precio, stock.</p>
          <textarea id="importText" rows="6" placeholder="producto	variante	costo	precio	stock"></textarea>
          <div class="row"><button class="btn" id="importBtn">Revisar e importar lo pegado</button><button class="btn primary" id="importSheet">Importar desde la hoja "Carga de productos"</button></div>
        </div>
        <div class="card stack"><h2>Respaldo manual</h2>
          <div class="row"><button class="btn" id="exportBtn">Descargar respaldo (.json)</button></div>
        </div></div>`;
    },
  };

  const state = {};
  function estadoPill(v) {
    if (v.estado === 'anulada') return '<span class="pill low">Anulada</span>';
    if (v.estado === 'pendiente') return '<span class="pill warn">Pago pendiente</span>';
    return '';
  }
  function periodoDesde(p) {
    if (p === 'todo') return '';
    const d = new Date();
    if (p === 'hoy') d.setHours(0, 0, 0, 0);
    else if (p === 'mes') { d.setDate(1); d.setHours(0, 0, 0, 0); }
    else d.setDate(d.getDate() - Number(p));
    return d.toISOString();
  }
  function periodoSelect(key, val) {
    const opts = [['hoy', 'Hoy'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['mes', 'Este mes'], ['todo', 'Todo']];
    return `<select data-periodo="${key}" style="width:auto">${opts.map(([k, n]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  }

  // ---------- Render y eventos ----------
  // Agrupa los redibujos: un cambio que llega mientras se redibuja (por ejemplo al salir de un campo) no rompe la pantalla.
  let renderQueued = false;
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => { renderQueued = false; draw(); });
  }
  function draw() {
    const main = $('#view');
    const focused = document.activeElement && document.activeElement.id;
    const caret = focused && document.activeElement.selectionStart;
    main.innerHTML = views[view]();
    $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    bind[view] && bind[view](main);
    $$('[data-periodo]', main).forEach(s => s.onchange = () => { state[s.dataset.periodo] = s.value; render(); });
    if (focused && $('#' + focused)) { const el = $('#' + focused); el.focus(); try { el.setSelectionRange(caret, caret); } catch {} }
  }
  const onInput = (el, fn) => el && (el.oninput = () => { fn(el.value); render(); });

  const bind = {
    vender(root) {
      onInput($('#search', root), v => search = v);
      $$('[data-prod]', root).forEach(b => b.onclick = () => {
        const vs = variantesDe(b.dataset.prod);
        if (vs.length === 1) addToCart(vs[0].id);
        else if (vs.length > 1) pickVariante(b.dataset.prod);
      });
      $$('[data-inc]', root).forEach(b => b.onclick = () => { cart.lines[b.dataset.inc].cantidad++; saveCart(); render(); });
      $$('[data-dec]', root).forEach(b => b.onclick = () => { const l = cart.lines[b.dataset.dec]; if (l.cantidad > 1) l.cantidad--; saveCart(); render(); });
      $$('[data-qty]', root).forEach(i => i.onchange = () => { cart.lines[i.dataset.qty].cantidad = Math.max(1, int(i.value)); saveCart(); render(); });
      $$('[data-del]', root).forEach(b => b.onclick = () => { cart.lines.splice(b.dataset.del, 1); saveCart(); render(); });
      $$('[data-linedesc]', root).forEach(b => b.onclick = () => lineDiscount(+b.dataset.linedesc));
      $$('[data-desctipo]', root).forEach(b => b.onclick = () => { cart.descTipo = b.dataset.desctipo; saveCart(); render(); });
      $$('[data-entrega]', root).forEach(b => b.onclick = () => { cart.entrega = b.dataset.entrega; saveCart(); render(); });
      const change = (id, key, fn = x => x) => { const el = $('#' + id, root); if (el) el.onchange = () => { cart[key] = fn(el.value); saveCart(); render(); }; };
      change('descValor', 'descValor', num); change('envioCosto', 'envioCosto', int);
      change('empresa', 'empresa'); change('medioPago', 'medioPago'); change('documento', 'documento');
      $('#pickCliente', root).onclick = () => pickCliente(id => { cart.clienteId = id; saveCart(); render(); });
      const cc = $('#clearCliente', root); if (cc) cc.onclick = () => { cart.clienteId = null; saveCart(); render(); };
      $('#clearCart', root).onclick = () => { if (confirm('¿Vaciar la venta actual?')) { cart = emptyCart(); saveCart(); render(); } };
      $('#checkout', root).onclick = registrarVenta;
    },
    ventas(root) {
      onInput($('#ventasQ', root), v => state.ventasQ = v);
      $$('[data-venta]', root).forEach(r => r.onclick = () => openVenta(r.dataset.venta));
    },
    inventario(root) {
      onInput($('#invQ', root), v => state.invQ = v);
      $('#invBajo', root).onchange = e => { state.invBajo = e.target.checked; render(); };
      $('#newProduct', root).onclick = () => editProducto(null);
      $$('[data-editprod]', root).forEach(a => a.onclick = e => { e.preventDefault(); editProducto(a.dataset.editprod); });
      $$('[data-ajuste]', root).forEach(b => b.onclick = () => ajustarStock(b.dataset.ajuste));
    },
    compras(root) {
      $('#newCompra', root).onclick = () => nuevaCompra();
      $$('[data-compra]', root).forEach(r => r.onclick = () => verCompra(r.dataset.compra));
    },
    clientes(root) {
      onInput($('#cliQ', root), v => state.cliQ = v);
      $('#newCliente', root).onclick = () => editCliente(null);
      $$('[data-cliente]', root).forEach(r => r.onclick = () => editCliente(r.dataset.cliente));
    },
    ajustes(root) {
      $('#cfgUsuario', root).onchange = e => { config.usuario = e.target.value.trim(); saveConfig(); };
      $$('[data-emp]', root).forEach(i => i.onchange = () => { config.empresa = { ...(config.empresa || {}), [i.dataset.emp]: i.value.trim() }; saveConfig(); });
      $('#saveCfg', root).onclick = async () => {
        config.url = $('#cfgUrl').value.trim(); config.clave = $('#cfgClave').value.trim();
        await saveConfig();
        try { await Sync.call({ action: 'ping' }); toast('Conectado con la planilla.'); Sync.run(); }
        catch (e) { toast('No se pudo conectar: ' + e.message); }
      };
      $('#syncNow', root).onclick = () => Sync.run();
      $('#importBtn', root).onclick = () => importarProductos($('#importText').value);
      $('#importSheet', root).onclick = async () => {
        try { const r = await Sync.call({ action: 'carga' }); importarProductos(r.filas.map(f => f.join('\t')).join('\n')); }
        catch (e) { toast('No se pudo leer la planilla: ' + e.message); }
      };
      $('#exportBtn', root).onclick = exportar;
    },
  };

  // ---------- Modales ----------
  function modal(title, html, onBind) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    $('#modal').hidden = false;
    onBind && onBind($('#modalBody'));
  }
  function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => t.hidden = true, 3500);
  }

  function pickVariante(pid) {
    const p = producto(pid);
    modal(p.nombre, `<div class="list-pick">${variantesDe(pid).map(v => `<button data-v="${v.id}"><b>${esc(v.nombre || 'Única')}</b>
      <span class="muted"> · ${clp(v.precio)} · stock ${stockOf(v.id)}</span></button>`).join('')}</div>`,
      root => $$('[data-v]', root).forEach(b => b.onclick = () => { closeModal(); addToCart(b.dataset.v); }));
  }

  function lineDiscount(i) {
    const l = cart.lines[i];
    modal('Descuento en ' + nombreVariante(variante(l.varianteId)), `<div class="stack">
      <div class="seg">${['%', '$'].map(x => `<button data-t="${x}" class="${l.descTipo === x ? 'on' : ''}">${x === '%' ? 'Porcentaje' : 'Monto'}</button>`).join('')}</div>
      <input id="ldv" inputmode="numeric" value="${l.descValor || ''}" placeholder="0">
      <div class="row"><button class="btn primary" id="ldOk">Aplicar</button></div></div>`, root => {
      let tipo = l.descTipo;
      $$('[data-t]', root).forEach(b => b.onclick = () => { tipo = b.dataset.t; $$('[data-t]', root).forEach(x => x.classList.toggle('on', x === b)); });
      $('#ldOk', root).onclick = () => { l.descTipo = tipo; l.descValor = num($('#ldv', root).value); saveCart(); closeModal(); render(); };
    });
  }

  function pickCliente(onPick) {
    const draw = q => DB.all('clientes').filter(c => match([c.nombre, c.rut, c.telefono, c.rrss, c.email].join(' '), q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).slice(0, 50)
      .map(c => `<button data-c="${c.id}"><b>${esc(c.nombre)}</b> <span class="muted">${esc([c.rut, c.telefono, c.comuna].filter(Boolean).join(' · '))}</span></button>`).join('')
      || '<div class="empty">Sin resultados</div>';
    modal('Elegir cliente', `<div class="stack">
      <div class="row"><input class="grow" id="cq" type="search" placeholder="Buscar por nombre, RUT, teléfono o RRSS…"><button class="btn primary" id="cNew">Nuevo</button></div>
      <div class="list-pick" id="clist">${draw('')}</div></div>`, root => {
      const wire = () => $$('[data-c]', root).forEach(b => b.onclick = () => { closeModal(); onPick(b.dataset.c); });
      $('#cq', root).oninput = e => { $('#clist', root).innerHTML = draw(e.target.value); wire(); };
      $('#cNew', root).onclick = () => editCliente(null, onPick);
      wire();
      $('#cq', root).focus();
    });
  }

  function editCliente(id, onSaved) {
    const c = id ? { ...cliente(id) } : { origen: ORIGENES[0] };
    const f = (k, label, extra = '') => `<div><label>${label}</label><input data-f="${k}" value="${esc(c[k] || '')}" ${extra}></div>`;
    const ventas = id ? DB.all('ventas').filter(v => v.clienteId === id).sort((a, b) => b.fecha.localeCompare(a.fecha)) : [];
    modal(id ? 'Editar cliente' : 'Nuevo cliente', `<div class="stack">
      <div class="grid2">${f('nombre', 'Nombre *')}${f('rut', 'RUT')}${f('telefono', 'Teléfono', 'inputmode="tel"')}${f('email', 'Email', 'type="email"')}
        ${f('rrss', 'Usuario en RRSS (ej: @cliente)')}
        <div><label>¿De dónde viene?</label><select data-f="origen">${ORIGENES.map(o => `<option ${c.origen === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div>
      ${f('direccion', 'Dirección (calle, número, depto)')}
      <div class="grid2">${f('comuna', 'Comuna')}${f('region', 'Región')}</div>
      <div><label>Notas</label><textarea data-f="notas" rows="2">${esc(c.notas || '')}</textarea></div>
      <div class="row"><button class="btn primary" id="cSave">Guardar</button></div>
      ${ventas.length ? `<h3>Compras</h3><table>${ventas.map(v => `<tr><td>${new Date(v.fecha).toLocaleDateString('es-CL')}</td><td>${esc(v.folio)}</td><td class="right num">${clp(v.total)}</td></tr>`).join('')}</table>` : ''}
      </div>`, root => {
      $('#cSave', root).onclick = async () => {
        $$('[data-f]', root).forEach(i => c[i.dataset.f] = i.value.trim());
        if (!c.nombre) return toast('El nombre es obligatorio.');
        const [saved] = await DB.save('clientes', c);
        closeModal(); toast('Cliente guardado.');
        if (onSaved) onSaved(saved.id); else render();
      };
    });
  }

  function editProducto(id) {
    const p = id ? { ...producto(id) } : { activo: true, stockMin: 2 };
    const vs = id ? variantesDe(id).map(v => ({ ...v })) : [{ nombre: '', sku: '', costo: 0, precio: 0, nuevo: true, stockInicial: 0 }];
    const rowHtml = (v, i) => `<tr data-row="${i}">
      <td><input data-v="nombre" value="${esc(v.nombre || '')}" placeholder="Ej: Negro / 10 mm"></td>
      <td><input data-v="sku" value="${esc(v.sku || '')}"></td>
      <td><input data-v="costo" inputmode="numeric" value="${v.costo || ''}"></td>
      <td><input data-v="precio" inputmode="numeric" value="${v.precio || ''}"></td>
      <td>${v.nuevo ? `<input data-v="stockInicial" inputmode="numeric" value="${v.stockInicial || ''}" placeholder="0">` : `<span class="num">${stockOf(v.id)}</span>`}</td>
      <td><button class="icon" data-rm="${i}" aria-label="Quitar">✕</button></td></tr>`;
    modal(id ? 'Editar producto' : 'Nuevo producto', `<div class="stack">
      <div class="grid2">
        <div><label>Nombre *</label><input id="pNombre" value="${esc(p.nombre || '')}"></div>
        <div><label>Categoría</label><input id="pCat" value="${esc(p.categoria || '')}" list="cats"></div>
        <div><label>Avisar con stock igual o menor a</label><input id="pMin" inputmode="numeric" value="${p.stockMin ?? 0}"></div>
        <div><label>Estado</label><select id="pActivo"><option value="1" ${p.activo !== false ? 'selected' : ''}>Activo (aparece en ventas)</option><option value="0" ${p.activo === false ? 'selected' : ''}>Inactivo</option></select></div>
      </div>
      <datalist id="cats">${[...new Set(DB.all('productos').map(x => x.categoria).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <div><h3>Opciones (color, tamaño, medida)</h3><p class="muted">Si el producto no tiene opciones deja una sola fila sin nombre.</p>
        <div class="table-wrap"><table id="vt"><tr><th>Opción</th><th>Código</th><th>Costo</th><th>Precio</th><th>Stock</th><th></th></tr>${vs.map(rowHtml).join('')}</table></div>
        <button class="btn small" id="addRow">+ Agregar opción</button></div>
      <div class="row"><button class="btn primary" id="pSave">Guardar</button></div></div>`, root => {
      const readRows = () => $$('[data-row]', root).forEach(tr => {
        const v = vs[tr.dataset.row];
        $$('[data-v]', tr).forEach(i => v[i.dataset.v] = ['costo', 'precio', 'stockInicial'].includes(i.dataset.v) ? int(i.value) : i.value.trim());
      });
      const redraw = () => { $('#vt', root).innerHTML = '<tr><th>Opción</th><th>Código</th><th>Costo</th><th>Precio</th><th>Stock</th><th></th></tr>' + vs.map((v, i) => v.quitar ? '' : rowHtml(v, i)).join(''); wire(); };
      const wire = () => $$('[data-rm]', root).forEach(b => b.onclick = () => {
        readRows(); const v = vs[b.dataset.rm];
        if (!v.nuevo && stockOf(v.id) !== 0 && !confirm('Esta opción tiene stock. ¿Quitarla igual?')) return;
        v.quitar = true; redraw();
      });
      wire();
      $('#addRow', root).onclick = () => { readRows(); vs.push({ nombre: '', sku: '', costo: vs[0]?.costo || 0, precio: vs[0]?.precio || 0, nuevo: true, stockInicial: 0 }); redraw(); };
      $('#pSave', root).onclick = async () => {
        readRows();
        p.nombre = $('#pNombre', root).value.trim(); p.categoria = $('#pCat', root).value.trim();
        p.stockMin = int($('#pMin', root).value); p.activo = $('#pActivo', root).value === '1';
        if (!p.nombre) return toast('El nombre es obligatorio.');
        const vivos = vs.filter(v => !v.quitar);
        if (!vivos.length) return toast('El producto necesita al menos una opción.');
        const [sp] = await DB.save('productos', p);
        const fecha = new Date().toISOString();
        const movs = [];
        for (const v of vs) {
          if (v.quitar && v.nuevo) continue;
          const rec = { id: v.id, productoId: sp.id, nombre: v.nombre, sku: v.sku, costo: v.costo, precio: v.precio, creado: v.creado };
          if (v.quitar) rec.eliminado = true;
          const [sv] = await DB.save('variantes', rec);
          if (v.nuevo && v.stockInicial) movs.push({ varianteId: sv.id, cantidad: v.stockInicial, tipo: 'inicial', fecha, nota: 'Stock inicial' });
        }
        if (movs.length) await DB.save('movimientos', movs);
        computeStock(); closeModal(); render(); toast('Producto guardado.');
      };
    });
  }

  function ajustarStock(vid) {
    const v = variante(vid); const actual = stockOf(vid);
    modal('Ajustar stock', `<div class="stack"><div><b>${esc(nombreVariante(v))}</b><div class="muted">Stock actual: ${actual}</div></div>
      <div><label>Stock real contado</label><input id="aNuevo" inputmode="numeric" value="${actual}"></div>
      <div><label>Motivo</label><select id="aMotivo"><option>Conteo de inventario</option><option>Producto dañado o vencido</option><option>Uso interno / muestra</option><option>Regalo / promoción</option><option>Otro</option></select></div>
      <div class="row"><button class="btn primary" id="aOk">Guardar</button></div></div>`, root => {
      $('#aOk', root).onclick = async () => {
        const diff = int($('#aNuevo', root).value) - actual;
        if (diff) await DB.save('movimientos', { varianteId: vid, cantidad: diff, tipo: 'ajuste', fecha: new Date().toISOString(), nota: $('#aMotivo', root).value, usuario: config.usuario || '' });
        computeStock(); closeModal(); render(); toast('Stock actualizado.');
      };
    });
  }

  function variantPicker(onPick) {
    const all = productosActivos().flatMap(p => variantesDe(p.id));
    const draw = q => all.filter(v => match(nombreVariante(v) + ' ' + (v.sku || ''), q)).slice(0, 40)
      .map(v => `<button data-pv="${v.id}">${esc(nombreVariante(v))} <span class="muted">· costo ${clp(v.costo)} · stock ${stockOf(v.id)}</span></button>`).join('') || '<div class="empty">Sin resultados</div>';
    return { html: `<input id="pvq" type="search" placeholder="Buscar producto para agregar…"><div class="list-pick" id="pvl" style="margin-top:8px">${draw('')}</div>`,
      wire(root) {
        const w = () => $$('[data-pv]', root).forEach(b => b.onclick = () => onPick(b.dataset.pv));
        $('#pvq', root).oninput = e => { $('#pvl', root).innerHTML = draw(e.target.value); w(); };
        w();
      } };
  }

  function nuevaCompra() {
    const compra = { fecha: new Date().toISOString().slice(0, 10), proveedor: '', documento: '', items: [], actualizarCosto: true };
    const draw = () => {
      const total = compra.items.reduce((s, i) => s + i.cantidad * i.costo, 0);
      const picker = variantPicker(vid => {
        readItems();
        const v = variante(vid);
        const ex = compra.items.find(i => i.varianteId === vid);
        if (ex) ex.cantidad++; else compra.items.push({ varianteId: vid, cantidad: 1, costo: v.costo || 0 });
        draw();
      });
      modal('Registrar compra', `<div class="stack">
        <div class="grid2"><div><label>Proveedor</label><input id="cProv" value="${esc(compra.proveedor)}"></div>
          <div><label>Fecha</label><input id="cFecha" type="date" value="${compra.fecha}"></div>
          <div><label>N° factura / boleta</label><input id="cDoc" value="${esc(compra.documento)}"></div>
          <div><label class="row" style="margin-top:26px"><input type="checkbox" id="cUpd" ${compra.actualizarCosto ? 'checked' : ''}> Actualizar precio costo</label></div></div>
        <table><tr><th>Producto</th><th>Cant.</th><th>Costo unit.</th><th></th></tr>
          ${compra.items.map((it, i) => `<tr data-it="${i}"><td>${esc(nombreVariante(variante(it.varianteId)))}</td>
            <td><input data-k="cantidad" inputmode="numeric" value="${it.cantidad}" style="width:70px"></td>
            <td><input data-k="costo" inputmode="numeric" value="${it.costo}" style="width:100px"></td>
            <td><button class="icon" data-rmit="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Agrega productos abajo.</td></tr>'}
        </table>
        <div class="right"><b>Total: ${clp(total)}</b></div>
        ${picker.html}
        <div class="row"><button class="btn primary" id="cSave" ${compra.items.length ? '' : 'disabled'}>Guardar compra</button></div></div>`, root => {
        picker.wire(root);
        $$('[data-rmit]', root).forEach(b => b.onclick = () => { readItems(); compra.items.splice(b.dataset.rmit, 1); draw(); });
        $('#cSave', root).onclick = guardar;
      });
    };
    const readItems = () => {
      const root = $('#modalBody');
      compra.proveedor = $('#cProv', root)?.value.trim() ?? compra.proveedor;
      compra.fecha = $('#cFecha', root)?.value || compra.fecha;
      compra.documento = $('#cDoc', root)?.value.trim() ?? compra.documento;
      compra.actualizarCosto = $('#cUpd', root)?.checked ?? compra.actualizarCosto;
      $$('[data-it]', root).forEach(tr => $$('[data-k]', tr).forEach(i => compra.items[tr.dataset.it][i.dataset.k] = int(i.value)));
    };
    const guardar = async () => {
      readItems();
      const items = compra.items.filter(i => i.cantidad > 0);
      if (!items.length) return toast('Agrega al menos un producto.');
      const id = DB.uid();
      const fecha = new Date(compra.fecha + 'T12:00:00').toISOString();
      const rec = { id, folio: folio('C'), fecha, proveedor: compra.proveedor, documento: compra.documento, usuario: config.usuario || '',
        items: items.map(i => ({ ...i, nombre: nombreVariante(variante(i.varianteId)), total: i.cantidad * i.costo })),
        total: items.reduce((s, i) => s + i.cantidad * i.costo, 0) };
      await DB.save('compras', rec);
      await DB.save('movimientos', items.map(i => ({ varianteId: i.varianteId, cantidad: i.cantidad, tipo: 'compra', refId: id, fecha })));
      if (compra.actualizarCosto) {
        const cambios = items.filter(i => variante(i.varianteId).costo !== i.costo).map(i => ({ ...variante(i.varianteId), costo: i.costo }));
        if (cambios.length) await DB.save('variantes', cambios);
      }
      computeStock(); closeModal(); render(); toast('Compra registrada y stock actualizado.');
    };
    draw();
  }

  function verCompra(id) {
    const c = DB.get('compras', id);
    modal('Compra ' + c.folio, `<div class="stack"><div>${esc(c.proveedor)} · ${new Date(c.fecha).toLocaleDateString('es-CL')} ${c.documento ? '· Doc ' + esc(c.documento) : ''}</div>
      <table>${c.items.map(i => `<tr><td>${i.cantidad} × ${esc(i.nombre)}</td><td class="right num">${clp(i.costo)}</td><td class="right num">${clp(i.total)}</td></tr>`).join('')}
      <tr><td><b>Total</b></td><td></td><td class="right num"><b>${clp(c.total)}</b></td></tr></table></div>`);
  }

  function openVenta(id) {
    const v = DB.get('ventas', id);
    const c = cliente(v.clienteId);
    const env = v.envio || {};
    modal('Venta ' + v.folio, `<div class="stack">
      <div class="muted">${new Date(v.fecha).toLocaleString('es-CL')} ${v.usuario ? '· ' + esc(v.usuario) : ''} ${estadoPill(v)}</div>
      ${v.estado === 'pendiente' ? `<div class="card stack"><h3>Pago MercadoPago pendiente</h3>
        <p class="muted">Los productos quedan reservados. La venta se cierra sola cuando MercadoPago confirma el pago.</p>
        ${v.pago?.link ? `<input id="mpLink" readonly value="${esc(v.pago.link)}">
          <div class="row"><button class="btn primary" id="mpCopy">Copiar link</button><button class="btn" id="mpWa">Enviar por WhatsApp</button><button class="btn" id="mpCheck">Revisar pago</button></div>`
          : '<div class="row"><button class="btn primary" id="mpGen">Generar link de pago</button></div>'}
        <div class="row"><button class="btn small" id="mpManual">Marcar como pagada</button></div></div>` : ''}
      <table>${v.items.map(i => `<tr><td>${i.cantidad} × ${esc(i.nombre)}</td><td class="right num">${clp(i.total)}</td></tr>`).join('')}
        ${v.descuento ? `<tr><td>Descuento</td><td class="right num">-${clp(v.descuento)}</td></tr>` : ''}
        ${env.costo ? `<tr><td>Envío</td><td class="right num">${clp(env.costo)}</td></tr>` : ''}
        <tr><td><b>Total</b> · ${esc(v.medioPago)}</td><td class="right num"><b>${clp(v.total)}</b></td></tr></table>
      <div>Documento: <b>${esc(v.documento?.tipo || '')}</b> <span class="pill warn">${esc(v.documento?.estado || '')}</span></div>
      ${c ? `<div>Cliente: <b>${esc(c.nombre)}</b><div class="muted">${esc([c.direccion, c.comuna, c.telefono].filter(Boolean).join(' · '))}</div></div>` : ''}
      ${env.tipo === 'despacho' ? `<div class="card stack"><h3>Despacho ${esc(env.empresa)}</h3>
        <div class="grid2"><div><label>Estado</label><select id="eEstado">${ESTADOS_ENVIO.map(s => `<option ${env.estado === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div><label>N° de seguimiento</label><input id="eSeg" value="${esc(env.seguimiento || '')}"></div></div>
        <div class="row"><button class="btn" id="eSave">Guardar despacho</button><button class="btn" id="pLabel">Imprimir etiqueta</button></div></div>` : ''}
      <div class="row"><button class="btn" id="pRec">Imprimir comprobante</button>
        ${v.estado !== 'anulada' ? `<button class="btn danger" id="vAnular">${v.estado === 'pendiente' ? 'Cancelar venta' : 'Anular venta'}</button>` : ''}</div></div>`, root => {
      const on = (sel, fn) => { const el = $(sel, root); if (el) el.onclick = fn; };
      on('#mpGen', async () => { await generarLinkPago(v.id); openVenta(v.id); });
      on('#mpCopy', async () => { try { await navigator.clipboard.writeText(v.pago.link); } catch { $('#mpLink', root).select(); document.execCommand('copy'); } toast('Link copiado.'); });
      on('#mpWa', () => {
        const tel = (c?.telefono || '').replace(/\D/g, '');
        const texto = `Hola${c ? ' ' + c.nombre.split(' ')[0] : ''}, este es el link para pagar tu pedido ${v.folio} de Insumos Lifting por ${clp(v.total)}: ${v.pago.link}`;
        window.open(`https://wa.me/${tel.length === 9 ? '56' + tel : tel}?text=${encodeURIComponent(texto)}`, '_blank');
      });
      on('#mpCheck', async () => {
        if (await revisarPagos([v.id])) { closeModal(); openVenta(v.id); } else toast('Todavía no aparece el pago.');
      });
      on('#mpManual', async () => {
        if (!confirm('¿Confirmas que el cliente ya pagó?')) return;
        await marcarPagada(v.id, { manual: true }); closeModal(); render(); toast('Venta cerrada como pagada.');
      });
      $('#pRec', root).onclick = () => Print.receipt(v, c, config.empresa || {});
      const pl = $('#pLabel', root); if (pl) pl.onclick = () => Print.label(v, c, config.empresa || {});
      const es = $('#eSave', root); if (es) es.onclick = async () => {
        await DB.save('ventas', { ...v, envio: { ...env, estado: $('#eEstado', root).value, seguimiento: $('#eSeg', root).value.trim() } });
        toast('Despacho actualizado.'); closeModal(); render();
      };
      const an = $('#vAnular', root); if (an) an.onclick = async () => {
        if (!confirm(v.estado === 'pendiente' ? '¿Cancelar esta venta? Los productos reservados vuelven al stock.' : '¿Anular esta venta? Los productos vuelven al stock.')) return;
        const fecha = new Date().toISOString();
        await DB.save('ventas', { ...v, estado: 'anulada', anuladaPor: config.usuario || '', anuladaEn: fecha });
        await DB.save('movimientos', v.items.map(i => ({ varianteId: i.varianteId, cantidad: i.cantidad, tipo: 'anulacion', refId: v.id, fecha })));
        computeStock(); closeModal(); render(); toast('Venta anulada.');
      };
    });
  }

  // ---------- Importar / exportar ----------
  function parseTable(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;
    const sep = lines[0].includes('\t') ? '\t' : (lines[0].split(';').length > lines[0].split(',').length ? ';' : ',');
    const rows = lines.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')));
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const head = rows[0].map(norm);
    const find = (...keys) => head.findIndex(h => keys.some(k => h.includes(k)));
    const col = {
      costo: find('costo'),
      precio: head.findIndex(h => h.includes('precio') && !h.includes('costo')),
      nombre: find('producto', 'nombre', 'descripcion', 'item'),
      variante: find('variante', 'color', 'tamano', 'talla', 'medida', 'opcion', 'curvatura'),
      sku: find('sku', 'codigo', 'cod'),
      categoria: find('categoria', 'tipo', 'linea'),
      stock: find('stock', 'cantidad', 'existencia', 'unidades'),
    };
    return { col, rows: rows.slice(1) };
  }

  function importarProductos(text) {
    const t = parseTable(text);
    if (!t || t.col.nombre < 0) return toast('No encontré la columna del nombre del producto. Incluye la fila de títulos.');
    const money = s => int(String(s || '').replace(/[$\s]/g, ''));
    const grupos = new Map();
    for (const r of t.rows) {
      const nombre = r[t.col.nombre]; if (!nombre) continue;
      if (!grupos.has(nombre)) grupos.set(nombre, { nombre, categoria: t.col.categoria >= 0 ? r[t.col.categoria] : '', vars: [] });
      grupos.get(nombre).vars.push({ nombre: t.col.variante >= 0 ? r[t.col.variante] || '' : '', sku: t.col.sku >= 0 ? r[t.col.sku] || '' : '',
        costo: t.col.costo >= 0 ? money(r[t.col.costo]) : 0, precio: t.col.precio >= 0 ? money(r[t.col.precio]) : 0,
        stock: t.col.stock >= 0 ? int(r[t.col.stock]) : 0 });
    }
    const existentes = new Set(DB.all('productos').map(p => p.nombre.toLowerCase()));
    const nuevos = [...grupos.values()].filter(g => !existentes.has(g.nombre.toLowerCase()));
    const omitidos = grupos.size - nuevos.length;
    const nVars = nuevos.reduce((s, g) => s + g.vars.length, 0);
    const cols = Object.entries(t.col).filter(([, i]) => i >= 0).map(([k]) => k).join(', ');
    modal('Importar productos', `<div class="stack">
      <p>Encontré <b>${nuevos.length}</b> producto(s) nuevos con <b>${nVars}</b> opción(es).${omitidos ? ` ${omitidos} ya existían y se omiten.` : ''}</p>
      <p class="muted">Columnas reconocidas: ${esc(cols)}</p>
      <div class="table-wrap"><table><tr><th>Producto</th><th>Opción</th><th class="right">Costo</th><th class="right">Precio</th><th class="right">Stock</th></tr>
        ${nuevos.slice(0, 8).flatMap(g => g.vars.map(v => `<tr><td>${esc(g.nombre)}</td><td>${esc(v.nombre)}</td><td class="right">${clp(v.costo)}</td><td class="right">${clp(v.precio)}</td><td class="right">${v.stock}</td></tr>`)).join('')}
      </table></div>
      <div class="row"><button class="btn primary" id="impOk" ${nuevos.length ? '' : 'disabled'}>Importar</button></div></div>`, root => {
      $('#impOk', root).onclick = async () => {
        const fecha = new Date().toISOString();
        const prods = [], vars = [], movs = [];
        for (const g of nuevos) {
          const pid = DB.uid();
          prods.push({ id: pid, nombre: g.nombre, categoria: g.categoria, activo: true, stockMin: 2 });
          for (const v of g.vars) {
            const vid = DB.uid();
            vars.push({ id: vid, productoId: pid, nombre: v.nombre, sku: v.sku, costo: v.costo, precio: v.precio });
            if (v.stock) movs.push({ varianteId: vid, cantidad: v.stock, tipo: 'inicial', fecha, nota: 'Importación' });
          }
        }
        await DB.save('productos', prods); await DB.save('variantes', vars); if (movs.length) await DB.save('movimientos', movs);
        computeStock(); closeModal(); $('#importText').value = ''; toast(`${prods.length} productos importados.`);
      };
    });
  }

  function exportar() {
    const data = {}; DB.TABLES.forEach(t => data[t] = [...DB.state[t].values()]);
    const blob = new Blob([JSON.stringify({ exportado: new Date().toISOString(), data }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `respaldo-insumos-lifting-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  }

  // ---------- Inicio ----------
  async function saveConfig() { await DB.setMeta('config', config); }

  async function init() {
    await DB.load();
    config = await DB.getMeta('config', {});
    App.config = config;
    computeStock();
    $$('#tabs button').forEach(b => b.onclick = () => { view = b.dataset.view; render(); window.scrollTo(0, 0); });
    $('#modalClose').onclick = closeModal;
    $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    $('#syncBadge').onclick = () => { view = 'ajustes'; render(); };
    Sync.onChange(s => {
      const b = $('#syncBadge');
      b.className = 'sync ' + s.state;
      b.title = s.state === 'ok' ? 'Sincronizado con la planilla' : (s.error || 'Sin sincronizar') + (s.pending ? ` (${s.pending} en cola)` : '');
      if (view === 'ajustes' && !$('#modal').hidden === false && !document.activeElement.matches('input,textarea')) render();
    });
    render();
    Sync.run();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  return { init, revisarPagos, refresh() { computeStock(); if (!document.activeElement.matches('input,textarea')) render(); }, config };
})();

App.init();
