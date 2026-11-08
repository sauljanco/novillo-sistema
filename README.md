# Novillo

Sistema de gestión para el restaurante Novillo (Sacaba, Cochabamba).

- [Web publicada](https://novillo-sistema.vercel.app/)
- [Proyecto en Vercel](https://vercel.com/fast-furious-delivery/novillo-sistema)

- [Alcance y reglas del negocio](ALCANCE-NOVILLO.md)
- [Arquitectura React + Neon + Vercel](STACK.md)
- [Menú inicial transcrito](menu-inicial.csv)
- [Prototipo local Python/SQLite](PROTOTIPO.md)

La base web usa React + TypeScript + Vite y se despliega en Vercel. La interfaz publicada es una página de preparación; aún no permite registrar operaciones reales. El proyecto Neon de trabajo está en la organización gratuita Novillo Desarrollo. El prototipo local Python/SQLite sirve para validar atención, segunda pantalla, caja y personal durante la migración.

## Desarrollo web

```bash
npm install
npm run dev
npm run build
```

El despliegue de Vercel debe usar el directorio raíz, preset **Vite**, comando `npm run build` y salida `dist`. Las credenciales de Neon se añadirán solo a funciones del servidor cuando se implemente la API; no deben llevar prefijo `VITE_`.


