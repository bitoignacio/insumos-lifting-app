// Impresión de comprobantes internos y etiquetas de despacho (10 x 15 cm).
const Print = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clp = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n || 0));

  function openDoc(title, css, body) {
    const w = window.open('', '_blank');
    if (!w) { alert('Permite las ventanas emergentes para imprimir.'); return; }
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>body{font-family:system-ui,Arial,sans-serif;margin:0;color:#000}${css}</style></head>
      <body>${body}<script>window.onload=()=>{window.print();}<\/script></body></html>`);
    w.document.close();
  }

  function receipt(venta, cliente, empresa) {
    const lines = venta.items.map(it => `<tr><td>${it.cantidad} × ${esc(it.nombre)}</td><td class="r">${clp(it.total)}</td></tr>`).join('');
    const css = `@page{size:80mm auto;margin:4mm}body{width:72mm;font-size:12px}h1{font-size:15px;margin:0}
      table{width:100%;border-collapse:collapse}td{padding:2px 0}.r{text-align:right}hr{border:0;border-top:1px dashed #000}`;
    openDoc('Comprobante ' + venta.folio, css, `
      <h1>${esc(empresa.nombre || 'Insumos Lifting')}</h1>
      <div>${esc(empresa.rut || '')}</div>
      <hr><div>Venta ${esc(venta.folio)}<br>${new Date(venta.fecha).toLocaleString('es-CL')}</div>
      ${cliente ? `<div>Cliente: ${esc(cliente.nombre)}</div>` : ''}
      <hr><table>${lines}
      ${venta.descuento ? `<tr><td>Descuento</td><td class="r">-${clp(venta.descuento)}</td></tr>` : ''}
      ${venta.envio && venta.envio.costo ? `<tr><td>Envío ${esc(venta.envio.empresa)}</td><td class="r">${clp(venta.envio.costo)}</td></tr>` : ''}
      <tr><td><b>Total</b></td><td class="r"><b>${clp(venta.total)}</b></td></tr></table>
      <hr><div>Pago: ${esc(venta.medioPago)}</div>
      ${venta.documento?.numero ? `<div>${esc(venta.documento.tipo)} N° ${esc(venta.documento.numero)}</div>` : ''}
      <p style="font-size:10px">Comprobante interno, no válido como boleta.</p>`);
  }

  function label(venta, cliente, empresa) {
    const env = venta.envio || {};
    const css = `@page{size:100mm 150mm;margin:0}.l{width:100mm;height:150mm;padding:6mm;box-sizing:border-box;display:flex;flex-direction:column;gap:4mm}
      .box{border:2px solid #000;border-radius:3mm;padding:3mm}.k{font-size:9px;text-transform:uppercase;letter-spacing:.05em}
      .big{font-size:17px;font-weight:800}.carrier{font-size:22px;font-weight:900;text-align:center}`;
    openDoc('Etiqueta ' + venta.folio, css, `<div class="l">
      <div class="carrier">${esc(env.empresa || '')}</div>
      ${env.pago ? `<div class="box" style="text-align:center;font-size:20px;font-weight:900">${env.pago === 'Por pagar' ? 'POR PAGAR' : 'PAGADO'}</div>` : ''}
      <div class="box"><div class="k">Destinatario</div>
        <div class="big">${esc(cliente?.nombre || '')}</div>
        <div>${esc(cliente?.rut || '')}</div>
        <div>${esc(cliente?.direccion || '')}${cliente?.depto ? ', ' + esc(cliente.depto) : ''}</div>
        <div><b>${esc(cliente?.comuna || '')}</b>${cliente?.region ? ', ' + esc(cliente.region) : ''}</div>
        <div>Tel: ${esc(cliente?.telefono ? (cliente.telefonoCodigo || '+56') + ' ' + cliente.telefono : '')}</div></div>
      <div class="box"><div class="k">Remitente</div>
        <div><b>${esc(empresa.nombre || 'Insumos Lifting')}</b> ${esc(empresa.rut || '')}</div>
        <div>${esc(empresa.direccion || '')}, ${esc(empresa.comuna || '')}</div>
        <div>Tel: ${esc(empresa.telefono || '')}</div></div>
      <div class="box"><div class="k">Pedido</div>
        <div class="big">${esc(venta.folio)}</div>
        <div>${venta.items.reduce((s, i) => s + i.cantidad, 0)} producto(s) · ${new Date(venta.fecha).toLocaleDateString('es-CL')}</div>
        ${env.seguimiento ? `<div>N° seguimiento: <b>${esc(env.seguimiento)}</b></div>` : ''}</div>
    </div>`);
  }

  return { receipt, label, esc, clp };
})();
