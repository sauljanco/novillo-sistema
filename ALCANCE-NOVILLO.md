# Novillo — Base funcional del sistema

Estado: prototipo local en desarrollo. Entrevista y dos fotografías del menú recibidas el 7 de noviembre de 2026. Moneda: bolivianos (Bs).

## Flujo confirmado
El operador arma y registra el pedido; se emite una ficha numerada sin cobrar y pasa a preparación. La segunda pantalla muestra productos, cantidades y monto. Al terminar de comer, el cliente solicita la cuenta: caja cobra el pedido y emite un recibo con el mismo número de ficha. Los medios de pago iniciales son efectivo y QR.

## Módulos previstos
1. Atención: catálogo editable, pedido, cobro, ficha, preparación y entrega.
2. Segunda pantalla: resumen sincronizado del pedido en curso, número de ficha, total y estado de pago; sin controles administrativos.
3. Caja: apertura, ingresos/egresos, arqueo y cierre por turno; QR se concilia aparte del efectivo.
4. Personal (~8 personas): días previstos, jornadas realmente trabajadas, turnos rotativos, tarifas independientes para jornada completa y medio turno, adelantos, pagos y saldo.
5. Compras e inversión: proveedores, compras, pagos pendientes, aportes y adquisición de equipos separados de ventas.
6. Inventario: unidades, existencias, mínimos, entradas, consumo, mermas, ajustes y recetas validadas por el restaurante.
7. Reportes: ventas, anulaciones, caja, compras, existencias y planilla.

## Regla de arqueo
Efectivo esperado = fondo inicial + cobros en efectivo + otros ingresos en efectivo - egresos en efectivo - devoluciones en efectivo. Diferencia = efectivo contado - efectivo esperado. Los cobros QR no incrementan el efectivo esperado.

## Datos por confirmar
Atención en mesa o para llevar, dispositivos e impresora, trabajo sin internet, horarios, tarifas, recetas, existencias iniciales y necesidad de facturación fiscal. Una ficha interna no equivale a una factura.

## Menú
Las 45 presentaciones y precios de las imágenes están transcritos en menu-inicial.csv y deben revisarse antes de operar. En particular, confirmar los nombres «Punta de S» y «Aranjuez Terruño», y las presentaciones de cervezas y vinos. El menú indica que los cortes incluyen un entremés y buffet de guarniciones y ensaladas; todavía falta definir el registro de su consumo.

## Criterios para validar la primera versión
- Dos churrascos de Bs 75 más una limonada en jarra de Bs 25 suman Bs 175.
- La segunda pantalla muestra el pedido en curso y el monto a cancelar.
- La ficha aparece al registrar el pedido; el recibo aparece solo después del pago y conserva el número.
- Un cobro QR se suma a ventas y no al efectivo esperado.
- Días programados y realmente trabajados son campos distintos.
- La tarifa del medio turno es independiente de la jornada completa.
