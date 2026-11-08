# Arquitectura propuesta para Novillo

Decisión: React + TypeScript + Vite para la aplicación; Supabase para Postgres, Auth y Realtime; Vercel para publicar el frontend. El prototipo actual en Python/SQLite queda como referencia del flujo, no como backend de producción.

## Piezas de la stack

| Capa | Tecnología | Uso |
| --- | --- | --- |
| Interfaz | React, TypeScript, Vite | Pantallas de caja, cocina, administración y cliente |
| Navegación | React Router | Rutas y acceso según rol |
| Datos remotos | TanStack Query + supabase-js | Consultas, caché e invalidación |
| Formularios | React Hook Form + Zod | Validación de productos, importes, jornadas y compras |
| Diseño | CSS/Tailwind CSS | Interfaz táctil para caja y vista grande para cliente |
| Identidad | Supabase Auth | Usuarios del restaurante: administrador, caja, cocina y dispositivo de pantalla |
| Base de datos | Supabase Postgres | Datos transaccionales y reportes |
| Tiempo real | Supabase Realtime | Actualizar segunda pantalla y cola de cocina |
| Archivos | Supabase Storage | Comprobantes y fotografías, si hacen falta |
| Despliegue | Vercel | Frontend, previews por pull request y producción |
| Pruebas | Vitest, React Testing Library, Playwright | Reglas de cálculo, UI y flujo de cobro |
| Repositorio | GitHub + Actions | Código, revisiones y CI |

No agregaría un servidor Express separado al principio. El navegador puede leer datos autorizados con `supabase-js` y RLS. Las operaciones que deben ser indivisibles, como cobrar y asignar el siguiente número de ficha, irán en funciones transaccionales de Postgres. Las integraciones con secretos (por ejemplo, facturación fiscal o verificación de QR) irán en Supabase Edge Functions o funciones de Vercel cuando se definan. La clave secreta de Supabase nunca se pondrá en `VITE_*`.

## Modelo de datos inicial

- `profiles`: usuario, nombre, rol y estado.
- `products`, `product_prices`: menú y precios vigentes con historial.
- `registers`, `cash_shifts`, `cash_movements`: caja, apertura, movimientos y cierre.
- `orders`, `order_items`, `payments`, `tickets`: pedido, líneas, cobro y ficha.
- `customer_displays`: identificador de pantalla/caja, pedido visible y estado.
- `staff`, `shift_templates`, `staff_schedules`, `attendance`, `pay_rates`, `payroll_payments`: personal y planilla.
- `suppliers`, `purchases`, `purchase_items`: proveedores y compras.
- `inventory_items`, `stock_movements`, `recipes`, `recipe_items`: inventario, consumo y merma.
- `audit_events`: modificaciones sensibles, usuario, fecha y motivo.

Usar importes enteros en centavos (`bigint`) o `numeric(12,2)` en Postgres; nunca `float` para dinero. Guardar fechas de trabajo según `America/La_Paz` y marcas de tiempo en `timestamptz`. El número de ficha se asigna por turno y caja dentro de una transacción, con restricción única. Una petición repetida de cobro debe llevar una clave de idempotencia para evitar pagos o fichas duplicados.

## Seguridad y roles

RLS en todas las tablas expuestas. La autorización se basará en perfiles controlados por el administrador o metadatos de aplicación, no en datos editables por cada usuario. `anon` no leerá ventas, personal ni pedidos. La pantalla del cliente tendrá una sesión de dispositivo con acceso únicamente al resumen del pedido asignado; no se mostrará toda la base de pedidos. Los cambios de precios, devoluciones, cierres y ajustes se auditarán. Hacer copias de seguridad y ensayar la restauración antes de operar.

## Segunda pantalla

Ruta `/cliente/:pantalla`: nombre o referencia opcional, productos, cantidades, total en Bs y estado. Durante armado muestra «Monto a cancelar». Cuando el cobro queda registrado muestra «Pagado» y número de ficha. Sin botones administrativos. Realtime actualiza la vista y una consulta inicial recupera el estado si se reconecta. La pantalla debe configurarse con identidad de dispositivo y acceso limitado.

## Flujo de cobro

1. Caja crea pedido en borrador.
2. Segunda pantalla muestra el resumen y el total.
3. Caja confirma efectivo o QR. La confirmación de QR se hace manualmente hasta integrar un proveedor de pagos.
4. La transacción valida precios y turno abierto, registra el pago, asigna ficha y marca el pedido pagado.
5. Cocina recibe el pedido y caja puede imprimir la ficha.
6. Cierre de turno concilia efectivo y QR por separado.

La ficha es un comprobante interno. Facturación fiscal boliviana requiere definición e integración específicas.

## Entornos y entrega

- `local`: Vite en el equipo de desarrollo; Supabase local o proyecto de desarrollo.
- `preview`: despliegue automático de Vercel por pull request, con base de datos de prueba separada.
- `production`: rama principal, proyecto Supabase de producción y dominio final.

Variables de frontend: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Mantener `.env.local` fuera de Git. Guardar migraciones SQL, semillas del menú y tipos generados en el repositorio. CI debe instalar dependencias con lockfile, ejecutar lint, tipos, pruebas y build. No se publicará el prototipo Python en Vercel como aplicación final.

## Fases de implementación

1. Crear proyecto React/Vite, autenticación, roles, migración inicial y menú validado.
2. Pedido, segunda pantalla, cobro transaccional, ficha, cocina y arqueo.
3. Personal, programación, asistencia y planilla.
4. Proveedores, compras, inventario, recetas y reportes.
5. Facturación e integración de pago si el cliente las necesita.

## Decisiones del cliente aún necesarias

Confirmar equipos de caja y segunda pantalla, impresora, conexión a internet y funcionamiento sin red; reglas de turnos y pagos, recetas e inventario inicial; comprobación de pagos QR; y facturación fiscal. Estas decisiones no impiden crear el repositorio ni empezar la primera fase.

## Fuentes consultadas

- Supabase Auth con React: https://supabase.com/docs/guides/auth/quickstarts/react
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Realtime: https://supabase.com/docs/guides/realtime/getting_started
- Vite en Vercel: https://vercel.com/docs/frameworks/frontend/vite
