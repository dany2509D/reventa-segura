# Reventa Segura

Marketplace de reventa de entradas para Panamá con entradas verificadas y pago protegido: el dinero no se libera al vendedor hasta que el comprador entra al evento.

Estado: v1 en desarrollo, desplegada en https://reventa-segura.vercel.app. Ya funcionan el ingreso con verificación del celular, la venta y compra de entradas, el pago manual con Yappy o ACH y comprobante, y el panel de administración. Lo que falta antes de cobrar dinero real está en `docs/launch-checklist.md`.

Stack: Next.js y React con TypeScript, Drizzle ORM sobre Postgres (Supabase en producción, PGlite en local), Firebase para la verificación del celular y Vercel Blob para los archivos.

- Diseño: `docs/superpowers/specs/2026-11-15-reventa-segura-design.md`
- Requisitos (RF, RNF, delimitantes, seguridad): `docs/superpowers/specs/2026-11-15-reventa-segura-requisitos.md`
- Plan de implementación: `docs/superpowers/plans/2026-11-15-reventa-segura-v1.md`
- Bitácora del proyecto (qué se hizo, decisiones, pendientes, cómo ejecutar): `docs/bitacora.md`
- Guía de Supabase y modo de prueba: `docs/supabase-setup.md`
- Lista antes de cobrar dinero real: `docs/launch-checklist.md`

## Cómo ejecutar

```
cp .env.example .env.local
npm install
npm run dev        # sin DATABASE_URL usa una base local (PGlite)
npm run seed:dev   # eventos de demostración
npm test
```

El resto de comandos (migraciones, administradores, contraseña de la base) está en `docs/bitacora.md`.
