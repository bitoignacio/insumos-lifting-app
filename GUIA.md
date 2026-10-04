# App Insumos Lifting: guía rápida

## Qué hace hoy
- **Vender** (pantalla principal): buscar producto, elegir opción (color, tamaño o medida), descuento por producto o a la venta, retiro o despacho (Starken / Blue Express, envío lo paga el cliente), cliente, medio de pago (Efectivo, Transferencia, MercadoPago) y documento. El stock se descuenta solo.
- **Ventas**: historial, comprobante interno, etiqueta de despacho 10 x 15 cm, estado del envío y N° de seguimiento, anular venta (devuelve el stock).
- **Inventario**: productos con opciones, alertas de stock bajo, ajustes de stock con motivo, valor del inventario.
- **Compras**: registra compras a proveedores, suma stock y actualiza el costo.
- **Clientes**: nombre, RUT, teléfono, email, RRSS, origen (RRSS / Web / WhatsApp), dirección y comuna.
- **Resumen**: ventas, costo, ganancia y margen, por medio de pago, por origen, más vendidos y stock bajo.
- **Sin internet**: todo se guarda en el equipo y se envía a la planilla al volver la conexión.

## Conectar la planilla (una sola vez)
1. Abre la planilla **Insumos Lifting - Base de datos** en tu Drive.
2. Menú **Extensiones > Apps Script**. Borra lo que aparezca y pega el contenido completo de `apps-script/Code.gs`. Guarda.
3. Arriba elige la función **configurar** y presiona **Ejecutar**. Acepta los permisos de Google (es tu propia cuenta).
   Abajo, en el registro, aparece la **CLAVE**. Cópiala.
4. **Implementar > Nueva implementación**, tipo **Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier persona**. Copia la URL que termina en `/exec`.
5. En la app, **Ajustes**: pega la URL y la clave, y toca **Guardar**. Debe decir "Conectado con la planilla".
6. Repite el paso 5 en cada celular o computador que use la app.

## Cargar los productos
1. En la hoja **Carga de productos** completa Precio costo, Precio venta y Stock actual.
2. Productos con opciones: una fila por opción, repitiendo el nombre del producto.
3. En la app, **Ajustes > Importar desde la hoja "Carga de productos"**.

## Instalar en el celular
Abre la dirección de la app en el navegador del celular y elige **Agregar a pantalla de inicio** (Chrome: menú ⋮; iPhone/Safari: botón Compartir).

## Pendiente
- Generar la etiqueta oficial de Starken y Blue Express desde la app (necesita las credenciales de integración de cada cuenta empresa).
- Emitir boleta / factura electrónica (según el sistema de facturación que usen).
- Link de pago MercadoPago (si se quiere generar desde la app).
- Usuarios con permisos distintos.
