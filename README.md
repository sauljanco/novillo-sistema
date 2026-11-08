# Novillo

Sistema de gestión para el restaurante Novillo (Sacaba, Cochabamba).

- [Web publicada](https://novillo-sistema.vercel.app/)
- [Proyecto en Vercel](https://vercel.com/fast-furious-delivery/novillo-sistema)

- [Alcance y reglas del negocio](ALCANCE-NOVILLO.md)
- [Arquitectura React + Neon + Vercel](STACK.md)
- [Menú inicial transcrito](menu-inicial.csv)
- [Prototipo local Python/SQLite](PROTOTIPO.md)

La base web usa React + TypeScript + Vite y se despliega en Vercel. El menú se lee de Neon. El primer flujo operativo incluye acceso del personal, apertura de caja, pedido cobrado, ficha y segunda pantalla. El proyecto Neon de trabajo está en la organización gratuita Novillo Desarrollo. El prototipo local Python/SQLite sigue disponible como referencia de reglas del negocio.

## Desarrollo web

```bash
npm install
npm run dev
npm run build
```

El despliegue de Vercel usa el directorio raíz, preset **Vite**, comando `npm run build` y salida `dist`. Las funciones se ejecutan en São Paulo (`gru1`), cerca del proyecto Neon. La credencial de Neon solo se usa en funciones del servidor y nunca lleva prefijo `VITE_`.

## API del servidor

`GET /api/health` ejecuta una consulta mínima a Neon y responde `{ "status": "ok" }` cuando la conexión funciona. Si falta `DATABASE_URL` o Neon no responde, devuelve HTTP 503 sin publicar detalles de la conexión. Vercel guarda `DATABASE_URL` como variable de tipo **Secret** solo para Producción. Las nuevas funciones y cambios de variables toman efecto en el siguiente despliegue.

`GET /api/menu` entrega las presentaciones activas del catálogo. El esquema y los 45 registros iniciales están versionados en `db/migrations/0001_menu.sql` y se aplicaron a la rama de producción de Neon.

`db/migrations/0002_operations.sql` contiene roles, sesiones de caja, pedidos, líneas y la función transaccional que genera la ficha. `/api/me`, `/api/cash` y `/api/orders` requieren un JWT de Neon Auth y un registro activo en `staff_access`; registrarse por sí solo no otorga acceso. El precio y el total se recalculan en Postgres con el catálogo vigente. El QR se registra manualmente y no se concilia con un banco; no se debe tratar como pago bancario confirmado.

La página `/?vista=operacion` es para el personal. La segunda pantalla `/?vista=cliente` se abre en otra ventana del mismo navegador y perfil, en el mismo equipo. Se sincroniza localmente mediante `BroadcastChannel` y `localStorage`; no transmite el resumen a otro dispositivo.

En Producción, Vercel necesita `VITE_NEON_AUTH_URL` (URL pública) y `NEON_AUTH_BASE_URL` (misma URL para verificar JWT), además de `DATABASE_URL` (Secret). El dominio de producción debe estar en la lista de dominios confiables de Neon Auth. La función utiliza `${NEON_AUTH_BASE_URL}/.well-known/jwks.json` y consulta el rol en cada solicitud.

Para dar acceso al primer administrador, este crea su propia cuenta y verifica el correo con el código enviado por Neon. Después se obtiene su `user_id` desde Neon Auth y se inserta explícitamente en `staff_access` con rol `administrador`. La API también comprueba `emailVerified = true`. Nunca se debe asignar el rol por correo enviado por el navegador ni convertir automáticamente al primer registro en administrador.

La caja todavía no incluye cierre, otros ingresos/egresos o devoluciones. Las fichas internas no son facturas fiscales. Antes de operar con dinero real, hay que validar con el restaurante el menú y los medios de pago, completar el arqueo y probar el flujo con una cuenta autorizada.

Para probar la API localmente, configura `DATABASE_URL` en tu entorno local sin subirlo a Git. La aplicación Vite del navegador nunca recibe esta variable.


