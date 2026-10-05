# App Insumos Lifting: guía rápida

## Qué hace hoy
- **Vender** (pantalla principal): buscar producto, elegir opción (color, tamaño o medida), descuento por producto o a la venta, retiro o despacho (Starken / Blue Express con envío pagado o por pagar, o Pyme), cliente, medio de pago (Efectivo, Transferencia, MercadoPago) y documento (con Factura pide razón social, RUT y giro). El stock se descuenta solo.
- **Ventas**: historial, boleta/factura como registro interno (se emite a mano en el SII y se anota el N°; filtros por estado (por emitir / emitidas) y por tipo: boleta, factura, sin documento), comprobante interno, etiqueta de despacho 10 x 15 cm, estado del envío y N° de seguimiento, anular venta (devuelve el stock).
- **Inventario**: productos con opciones, alertas de stock bajo, **conteo de inventario** para revisar todo el stock de una vez, ajustes con motivo, valor del inventario.
- **Compras**: lista de proveedores (agregar, editar, eliminar), registra compras que suman stock y actualizan el costo, y permite eliminar una compra (descuenta el stock).
- **Clientes**: nombre, RUT, teléfono con código de país (+56 por defecto), email, RRSS, origen (RRSS / Web / WhatsApp), dirección con sugerencias que completan comuna y región, datos de facturación, y opción de eliminar cliente (sus ventas pasadas se mantienen).
- **Resumen**: filtro por periodo o fechas personalizadas; ventas, costo, ganancia y margen, por medio de pago, por origen, más vendidos y stock bajo.
- **Sin internet**: todo se guarda en el equipo y se envía a la planilla al volver la conexión.

## Conectar la planilla (una sola vez)
1. Abre la planilla **Insumos Lifting - Base de datos** en tu Drive.
2. Menú **Extensiones > Apps Script**. Borra lo que aparezca y pega el contenido completo de `apps-script/Code.gs`. Guarda.
3. Arriba elige la función **configurar** y presiona **Ejecutar**. Acepta los permisos de Google (es tu propia cuenta).
   Abajo, en el registro, aparece la **CLAVE**. Cópiala.
4. **Implementar > Nueva implementación**, tipo **Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier persona**. Copia la URL que termina en `/exec`.
5. En la app, **Ajustes**: pega la URL y la clave, y toca **Guardar**. Debe decir "Conectado con la planilla".
6. Repite el paso 5 en cada celular o computador que use la app.

## Actualizar el Apps Script (cuando haya una versión nueva)
1. Abre la planilla > **Extensiones > Apps Script**, borra todo y pega el contenido nuevo de `apps-script/Code.gs`. Guarda.
2. **Implementar > Gestionar implementaciones** > ícono del lápiz > en "Versión" elige **Nueva versión** > **Implementar**.
3. La URL y la clave no cambian; no hay que tocar nada en la app.
4. La versión 5 agrega sugerencias de dirección con Google Maps. La primera vez, elige la función **probarDirecciones** arriba y presiona **Ejecutar** (acepta los permisos si los pide), y después haz la Nueva versión.
5. La versión 4 agrega la hoja **Facturas** (razón social, RUT, giro, total y N°) y guarda los proveedores en la hoja **Proveedores**.

## MercadoPago (link de pago)
1. En [mercadopago.cl/developers](https://www.mercadopago.cl/developers) entra a **Tus integraciones**, crea una aplicación y copia el **Access Token de producción**.
2. En el Apps Script: ícono ⚙ **Configuración del proyecto > Propiedades de la secuencia de comandos > Agregar propiedad**. Nombre `MP_TOKEN`, valor: el token.
3. En la app, al elegir **MercadoPago** el botón dice **Generar link de pago**. La venta queda **pendiente de pago** y los productos reservados. La app revisa sola cada pocos minutos y cierra la venta cuando MercadoPago confirma el pago. También puedes tocar **Revisar pago**, **Marcar como pagada** o **Cancelar venta**.

## Cargar los productos
1. En la hoja **Carga de productos** ya están tus precios. El stock puede quedar vacío.
2. Productos con opciones: una fila por opción, repitiendo el nombre del producto.
3. En la app, **Ajustes > Importar desde la hoja "Carga de productos"**.
4. Para el stock: **Inventario > Conteo de inventario**, anota lo contado de cada producto y guarda.

## Borrar datos de prueba
Al vender, marca **Venta de prueba** (debajo de Registrar venta). Esa venta no cuenta en el Resumen ni en las hojas de detalle, y se borra con la opción **Solo ventas de prueba**.
En **Ajustes > Borrar datos de prueba** eliges qué borrar (ventas, compras, ajustes de stock, clientes, proveedores), escribes BORRAR y confirmas. Se borra en la app, en los otros equipos y en la planilla (las filas quedan marcadas "sí" en la columna eliminado). Los productos no se tocan.

## Instalar en el celular
Abre la dirección de la app en el navegador del celular y elige **Agregar a pantalla de inicio** (Chrome: menú ⋮; iPhone/Safari: botón Compartir).

## Pendiente
- Generar la etiqueta oficial de Starken y Blue Express desde la app (necesita las credenciales de integración de cada cuenta empresa).
- Usuarios con permisos distintos.
