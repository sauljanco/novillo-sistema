# Arquitectura de Novillo

Decisión: React + TypeScript + Vite para la interfaz; Neon Postgres y Better Auth para datos e identidad; Vercel para publicar la aplicación. El prototipo Python/SQLite queda como referencia del flujo, no como backend de producción.

## Estado de provisión

- Proyecto Neon activo para Novillo: `novillo-sistema`, ID `fancy-butterfly-13411998`, organización `Novillo Desarrollo` (plan Free), región AWS São Paulo, con Postgres y Better Auth.
- El primer intento creó un proyecto vacío en Launch. Neon no permite transferir proyectos de Launch a Free; ese duplicado fue eliminado. El proyecto Free indicado arriba es el único destino de la aplicación.
- [Consola del proyecto](https://console.neon.tech/app/projects/fancy-butterfly-13411998).
- Proyecto Vercel: `novillo-sistema` en el equipo `Fast Furious Delivery` (plan Hobby), conectado a `sauljanco/novillo-sistema` en la rama `main`. Preset Vite, raíz `./`, compilación `npm run build`, salida `dist`; funciones en `gru1` (São Paulo). `DATABASE_URL` está guardada como Secret de Producción.
- URL de producción: [novillo-sistema.vercel.app](https://novillo-sistema.vercel.app/). El primer despliegue está listo; muestra la base web y aún no procesa operaciones.

## Piezas de la stack

| Capa | Tecnología | Uso |
| --- | --- | --- |
| Interfaz | React, TypeScript, Vite | Ventas, caja, cocina y administración |
| Navegación | React Router | Rutas según función |
| Consultas | TanStack Query | Caché, refresco e invalidación |
| Formularios | React Hook Form + Zod | Validación de importes, jornadas y compras |
| Diseño | CSS/Tailwind CSS | Interfaz adaptable para ventas y administración |
| Identidad | Neon Better Auth | Usuarios del restaurante y sesiones |
| Base de datos | Neon Postgres | Pedidos, pagos, caja, personal e inventario |
| Acceso a datos | Funciones de Vercel | API con permisos y operaciones de negocio; credenciales solo en servidor |
| ORM y migraciones | Drizzle ORM + Drizzle Kit | Esquema versionado y consultas tipadas |
| Pruebas | Vitest, React Testing Library, Playwright | Cálculos, interfaz y flujo de cobro |
| Repositorio y CI | GitHub + Actions | Revisión de cambios y validación automática |

No conectar Postgres directamente desde el navegador ni publicar `DATABASE_URL` como variable `VITE_*`. El frontend llama a una API pequeña en Vercel; esta valida sesión y rol. La ficha se asigna en la transacción que registra el pedido; el cobro se registra después con el mismo número y la base impide cobrar dos veces.

## Modelo de datos inicial

- `users`/tablas administradas por Better Auth y `staff_profiles`: identidad y rol.
- `products`, `product_prices`: menú e historial de precios.
- `registers`, `cash_shifts`, `cash_movements`: caja y arqueo.
- `orders`, `order_items`, `payments`, `tickets`: pedido, cobro y ficha.
- `staff`, `shift_templates`, `staff_schedules`, `attendance`, `pay_rates`, `payroll_payments`: personal.
- `suppliers`, `purchases`, `purchase_items`: compras.
- `inventory_items`, `stock_movements`, `recipes`, `recipe_items`: existencias y consumo.
- `audit_events`: usuario, fecha y motivo de modificaciones sensibles.

Guardar importes como enteros en centavos o `numeric(12,2)`, nunca `float`. Marcas de tiempo en `timestamptz` y fechas laborales interpretadas en `America/La_Paz`. Restricción única para el número de ficha por caja y turno. La API debe exigir clave de idempotencia al cobrar.

## Entornos y seguridad

- Desarrollo local con base Neon de desarrollo o rama de prueba.
- Preview de Vercel por pull request con una rama de base de datos aislada.
- Producción con variables y permisos separados.

Roles: superadministrador, administrador, caja y cocina. Los permisos se comprueban en la API. Respaldos y restauración probados antes de operar con dinero real. Registrar auditoría de cambios de precio, devoluciones, cierre de caja, asistencia y ajustes de inventario.

Variables previstas: `DATABASE_URL` y la configuración de Better Auth solo en servidor; la URL pública de la aplicación en Vercel. `.env.local` queda fuera de Git. CI ejecutará lint, tipos, pruebas y build.

## Fases

1. Crear frontend React/Vite y migración inicial sobre el proyecto Neon Free.
2. Autenticación, roles, menú, pedido, cobro transaccional, ficha, cocina y arqueo.
3. Programación, asistencia y planilla.
4. Proveedores, compras, inventario, recetas y reportes.
5. Integración de pagos y facturación fiscal si el cliente las requiere.

## Fuentes

- [Neon y Vercel](https://vercel.com/marketplace/neon)
- [Planes de Neon](https://neon.com/docs/introduction/plans)
- [Firebase descartado como primera opción](https://firebase.google.com/docs/firestore/manage-data/transactions)


