# Novillo

Sistema de gestión para el restaurante Novillo (Sacaba, Cochabamba).

- [Web publicada](https://novillo-sistema.vercel.app/)
- [Proyecto en Vercel](https://vercel.com/fast-furious-delivery/novillo-sistema)

- [Alcance y reglas del negocio](ALCANCE-NOVILLO.md)
- [Arquitectura React + Neon + Vercel](STACK.md)
- [Menú inicial transcrito](menu-inicial.csv)
- [Prototipo local Python/SQLite](PROTOTIPO.md)

La base web usa React + TypeScript + Vite y se despliega en Vercel. La interfaz muestra el menú leído de Neon; aún no permite registrar operaciones reales. El proyecto Neon de trabajo está en la organización gratuita Novillo Desarrollo. El prototipo local Python/SQLite sirve para validar atención, segunda pantalla, caja y personal durante la migración.

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

Para probar la API localmente, configura `DATABASE_URL` en tu entorno local sin subirlo a Git. La aplicación Vite del navegador nunca recibe esta variable.


