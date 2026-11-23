# Verificación de entrega

Comprobaciones realizadas sobre el código entregado:

- Sintaxis JavaScript: todos los archivos `.js` pasan `node --check`.
- Imports relativos: no se encontraron módulos locales faltantes.
- HTML: no se encontraron IDs duplicados ni rutas locales `src`/`href` faltantes.
- Service Worker: todos los recursos declarados en la precaché existen.
- Flujo revisado en código: invitado con sesión anónima Supabase, pedido QR, pago mixto, efectivo local, tarjeta coordinada, envío interdepartamental, recibo y confirmación administrativa.

Limitaciones de verificación:

- No se pudo ejecutar una prueba de navegador desde este entorno porque Chromium bloqueó la navegación local (`ERR_BLOCKED_BY_ADMINISTRATOR`).
- No se puede certificar una transacción real contra el proyecto Supabase ni un pago bancario desde este entorno.
- Para el modo invitado, activa **Authentication → Providers → Anonymous Sign-Ins** en Supabase.
- Ejecuta `supabase/schema.sql` en Supabase después de hacer backup. Añade `confirmado.html` a Authentication → URL Configuration → Redirect URLs.
- QR y transferencia quedan sujetos a confirmación del administrador, salvo que el banco/proveedor ofrezca un webhook oficial. Tarjeta queda como coordinación manual hasta integrar una pasarela real.
