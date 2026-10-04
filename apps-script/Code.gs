/**
 * Insumos Lifting · conexión entre la app y esta planilla de Google Sheets.
 *
 * Instalación (una sola vez):
 * 1. En la planilla: Extensiones > Apps Script. Borra lo que haya y pega este archivo completo.
 * 2. Elige la función "configurar" arriba y presiona Ejecutar. Acepta los permisos.
 *    En el registro aparece la CLAVE que debes pegar en la app (Ajustes).
 * 2b. (MercadoPago) Configuración del proyecto (ícono ⚙) > Propiedades de la secuencia de comandos >
 *     agrega la propiedad MP_TOKEN con tu Access Token de producción de MercadoPago
 *     (mercadopago.cl/developers > Tus integraciones > Credenciales de producción).
 * 3. Implementar > Nueva implementación > tipo "Aplicación web".
 *    Ejecutar como: Yo. Quién tiene acceso: Cualquier persona.
 *    Copia la URL que termina en /exec y pégala en la app (Ajustes).
 */

// Cada tabla de la app se guarda en una hoja. La columna "datos" guarda el registro completo.
const HOJAS = {
  productos: { nombre: 'Productos', columnas: ['id', 'nombre', 'categoria', 'stockMin', 'activo'] },
  variantes: { nombre: 'Variantes', columnas: ['id', 'productoId', 'nombre', 'sku', 'costo', 'precio'] },
  clientes: { nombre: 'Clientes', columnas: ['id', 'nombre', 'rut', 'telefono', 'email', 'rrss', 'origen', 'direccion', 'comuna', 'region', 'notas'] },
  ventas: { nombre: 'Ventas', columnas: ['id', 'folio', 'fecha', 'usuario', 'clienteId', 'subtotal', 'descuento', 'total', 'medioPago', 'estado', 'documentoTipo', 'documentoNumero', 'documentoEstado'] },
  compras: { nombre: 'Compras', columnas: ['id', 'folio', 'fecha', 'proveedor', 'documento', 'total', 'usuario'] },
  movimientos: { nombre: 'Movimientos', columnas: ['id', 'varianteId', 'cantidad', 'tipo', 'refId', 'fecha', 'nota'] },
  proveedores: { nombre: 'Proveedores', columnas: ['id', 'nombre', 'rut', 'telefono', 'email', 'notas'] },
};
const VERSION = 4;
const COLUMNAS_DESPACHOS = ['ventaId', 'folio', 'fecha', 'empresa', 'costo', 'estado', 'seguimiento', 'cliente', 'direccion', 'comuna', 'telefono', 'pago'];
const COLUMNAS_FACTURAS = ['ventaId', 'folio', 'fecha', 'razonSocial', 'rut', 'giro', 'total', 'numero', 'estado'];
const FIJAS = ['actualizado', 'eliminado', 'datos'];
const HOJA_CARGA = 'Carga de productos';

function configurar() {
  const props = PropertiesService.getScriptProperties();
  let clave = props.getProperty('CLAVE');
  if (!clave) {
    clave = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty('CLAVE', clave);
  }
  Object.keys(HOJAS).forEach(hoja);
  hojaSimple('Detalle ventas', ['ventaId', 'folio', 'fecha', 'producto', 'sku', 'cantidad', 'precio', 'descuento', 'total', 'costo', 'ganancia']);
  hojaSimple('Despachos', COLUMNAS_DESPACHOS);
  hojaSimple('Stock', ['varianteId', 'producto', 'opcion', 'sku', 'costo', 'precio', 'stock']);
  Logger.log('CLAVE para la app: ' + clave);
}

function doGet() {
  return json({ ok: true, mensaje: 'Insumos Lifting: conexión activa.' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'Solicitud inválida' }); }
  const clave = PropertiesService.getScriptProperties().getProperty('CLAVE');
  if (!clave || body.clave !== clave) return json({ ok: false, error: 'Clave incorrecta' });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (body.action === 'ping') return json({ ok: true, version: VERSION });
    if (body.action === 'push') return json(push(body.ops || []));
    if (body.action === 'pull') return json(pull(body.since || ''));
    if (body.action === 'carga') return json(carga());
    if (body.action === 'mpLink') return json(mpLink(body));
    if (body.action === 'mpEstado') return json(mpEstado(body.ventaId));
    return json({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hoja(tabla) {
  const def = HOJAS[tabla];
  return hojaSimple(def.nombre, def.columnas.concat(FIJAS));
}

function hojaSimple(nombre, columnas) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function valor(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

// Guarda (o reemplaza) cada registro según su id.
function push(ops) {
  const porTabla = {};
  ops.forEach(op => {
    if (!HOJAS[op.table] || !op.record || !op.record.id) return;
    (porTabla[op.table] = porTabla[op.table] || {})[op.record.id] = op.record; // el último cambio gana
  });
  const ahora = new Date().toISOString();
  Object.keys(porTabla).forEach(tabla => {
    const sh = hoja(tabla);
    const cols = HOJAS[tabla].columnas.concat(FIJAS);
    const ultima = sh.getLastRow();
    const ids = ultima > 1 ? sh.getRange(2, 1, ultima - 1, 1).getValues().map(r => String(r[0])) : [];
    const fila = {};
    ids.forEach((id, i) => { fila[id] = i + 2; });
    const nuevas = [];
    Object.values(porTabla[tabla]).forEach(rec => {
      rec.sincronizado = ahora;
      if (tabla === 'ventas' && rec.documento) { rec.documentoTipo = rec.documento.tipo; rec.documentoNumero = rec.documento.numero || ''; rec.documentoEstado = rec.documento.estado; }
      const row = cols.map(c => tabla === 'clientes' && c === 'telefono' && rec.telefono ? (rec.telefonoCodigo || '+56') + ' ' + rec.telefono
        : tabla === 'clientes' && c === 'direccion' && rec.depto ? valor(rec.direccion) + ', ' + rec.depto
        : c === 'datos' ? JSON.stringify(rec) : c === 'eliminado' ? (rec.eliminado ? 'sí' : '') : valor(rec[c]));
      if (fila[rec.id]) sh.getRange(fila[rec.id], 1, 1, cols.length).setValues([row]);
      else nuevas.push(row);
    });
    if (nuevas.length) sh.getRange(sh.getLastRow() + 1, 1, nuevas.length, cols.length).setValues(nuevas);
  });
  if (porTabla.ventas) actualizarDetalleVentas(Object.values(porTabla.ventas));
  if (porTabla.movimientos || porTabla.variantes || porTabla.productos) actualizarStock();
  return { ok: true, guardados: ops.length, version: VERSION };
}

// Devuelve los registros sincronizados después de "since" (para los otros dispositivos).
function pull(since) {
  const records = {};
  Object.keys(HOJAS).forEach(tabla => {
    const sh = hoja(tabla);
    const ultima = sh.getLastRow();
    if (ultima < 2) { records[tabla] = []; return; }
    const ncol = HOJAS[tabla].columnas.length + FIJAS.length;
    const datos = sh.getRange(2, ncol, ultima - 1, 1).getValues();
    records[tabla] = datos.map(r => { try { return JSON.parse(r[0]); } catch (e) { return null; } })
      .filter(r => r && (!since || (r.sincronizado || '') > since));
  });
  return { ok: true, records, now: new Date().toISOString() };
}

// Lee la hoja "Carga de productos" para importar el listado inicial desde la app.
function carga() {
  const sh = SpreadsheetApp.getActive().getSheetByName(HOJA_CARGA);
  if (!sh) return { ok: false, error: 'No existe la hoja "' + HOJA_CARGA + '"' };
  return { ok: true, filas: sh.getDataRange().getDisplayValues() };
}

function leerTabla(tabla) {
  const sh = hoja(tabla);
  const ultima = sh.getLastRow();
  if (ultima < 2) return [];
  const ncol = HOJAS[tabla].columnas.length + FIJAS.length;
  return sh.getRange(2, ncol, ultima - 1, 1).getValues()
    .map(r => { try { return JSON.parse(r[0]); } catch (e) { return null; } })
    .filter(r => r && !r.eliminado);
}

function actualizarDetalleVentas(ventas) {
  const det = hojaSimple('Detalle ventas', ['ventaId', 'folio', 'fecha', 'producto', 'sku', 'cantidad', 'precio', 'descuento', 'total', 'costo', 'ganancia']);
  const desp = hojaSimple('Despachos', COLUMNAS_DESPACHOS);
  desp.getRange(1, 1, 1, COLUMNAS_DESPACHOS.length).setValues([COLUMNAS_DESPACHOS]).setFontWeight('bold');
  const fact = hojaSimple('Facturas', COLUMNAS_FACTURAS);
  const ids = {};
  ventas.forEach(v => { ids[v.id] = true; });
  borrarFilas(det, ids);
  borrarFilas(desp, ids);
  borrarFilas(fact, ids);
  const clientes = {};
  leerTabla('clientes').forEach(c => { clientes[c.id] = c; });
  const filas = [], filasDesp = [], filasFact = [];
  ventas.filter(v => v.estado === 'completada' && !v.eliminado).forEach(v => {
    (v.items || []).forEach(it => {
      const neto = it.precio * it.cantidad - it.descuento;
      filas.push([v.id, v.folio, v.fecha, it.nombre, it.sku, it.cantidad, it.precio, it.descuento, neto, it.costo * it.cantidad, neto - it.costo * it.cantidad]);
    });
    const d = v.documento || {};
    if (d.tipo === 'Factura') filasFact.push([v.id, v.folio, v.fecha, d.razonSocial || '', d.rut || '', d.giro || '', v.total, d.numero || '', d.estado || '']);
    if (v.envio && v.envio.tipo === 'despacho') {
      const c = clientes[v.clienteId] || {};
      filasDesp.push([v.id, v.folio, v.fecha, v.envio.empresa, v.envio.costo, v.envio.estado, v.envio.seguimiento || '', c.nombre || '',
        [c.direccion, c.depto].filter(Boolean).join(', '), c.comuna || '', c.telefono ? (c.telefonoCodigo || '+56') + ' ' + c.telefono : '', v.envio.pago || '']);
    }
  });
  if (filas.length) det.getRange(det.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
  if (filasFact.length) fact.getRange(fact.getLastRow() + 1, 1, filasFact.length, filasFact[0].length).setValues(filasFact);
  if (filasDesp.length) desp.getRange(desp.getLastRow() + 1, 1, filasDesp.length, filasDesp[0].length).setValues(filasDesp);
}

function borrarFilas(sh, ids) {
  const ultima = sh.getLastRow();
  if (ultima < 2) return;
  const col = sh.getRange(2, 1, ultima - 1, 1).getValues();
  for (let i = col.length - 1; i >= 0; i--) if (ids[col[i][0]]) sh.deleteRow(i + 2);
}

// Hoja "Stock": stock actual por producto y opción, calculado desde los movimientos.
function actualizarStock() {
  const sh = hojaSimple('Stock', ['varianteId', 'producto', 'opcion', 'sku', 'costo', 'precio', 'stock']);
  const productos = {};
  leerTabla('productos').forEach(p => { productos[p.id] = p; });
  const stock = {};
  leerTabla('movimientos').forEach(m => { stock[m.varianteId] = (stock[m.varianteId] || 0) + Number(m.cantidad || 0); });
  const filas = leerTabla('variantes').map(v => [v.id, (productos[v.productoId] || {}).nombre || '', v.nombre || '', v.sku || '', v.costo || 0, v.precio || 0, stock[v.id] || 0])
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 7).clearContent();
  if (filas.length) sh.getRange(2, 1, filas.length, 7).setValues(filas);
}

// ---------- MercadoPago ----------
function mpToken() {
  const t = PropertiesService.getScriptProperties().getProperty('MP_TOKEN');
  if (!t) throw new Error('Falta configurar el token de MercadoPago (MP_TOKEN) en el Apps Script');
  return t;
}

function mpFetch(url, opciones) {
  const res = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + mpToken() } }, opciones || {}));
  const data = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() >= 300) throw new Error('MercadoPago: ' + (data.message || res.getResponseCode()));
  return data;
}

// Crea un link de pago (Checkout Pro) por el total de la venta.
function mpLink(body) {
  const pref = {
    items: [{ title: String(body.titulo || 'Pedido Insumos Lifting'), quantity: 1, unit_price: Math.round(Number(body.monto)), currency_id: 'CLP' }],
    external_reference: String(body.ventaId),
  };
  if (body.email) pref.payer = { email: String(body.email) };
  const data = mpFetch('https://api.mercadopago.com/checkout/preferences', { method: 'post', payload: JSON.stringify(pref) });
  return { ok: true, link: data.init_point, preferenciaId: data.id };
}

// Revisa si la venta ya tiene un pago aprobado en MercadoPago.
function mpEstado(ventaId) {
  const data = mpFetch('https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&external_reference=' + encodeURIComponent(ventaId));
  const aprobado = (data.results || []).filter(p => p.status === 'approved')[0];
  return { ok: true, pagado: !!aprobado, pagoId: aprobado ? aprobado.id : null, medio: aprobado ? aprobado.payment_type_id : null };
}
