# Elite Sport · Catálogo PWA (reparación y endurecimiento)

Esta versión parte del ZIP que compartiste. Mantiene el catálogo, Supabase, el panel de personal, las carpetas de semanas 1–3 y el diseño existente; corrige el flujo de autenticación duplicado, incorpora modalidades de pedido y refuerza las reglas de pedidos/stock en la base de datos.

## 1. Antes de publicar

1. Haz una copia de seguridad de Supabase (Database → Backups).
2. En Supabase → SQL Editor, ejecuta `supabase/schema.sql`.
3. Después ejecuta `supabase/usuarios_principales.sql` **solo después** de crear las tres cuentas en Authentication → Users. Sustituye los correos de ejemplo de ese archivo por los correos reales que hayas elegido.
4. En Authentication, establece contraseñas fuertes y activa MFA para la cuenta administradora si tu plan lo permite.
5. En `js/core/config.js`, conserva únicamente la URL del proyecto y la clave `publishable/anon`. Esa clave es pública por diseño y las políticas RLS deben proteger los datos. Nunca pongas `service_role`, contraseñas, tokens de banco o secretos de webhook en JavaScript, HTML, README ni GitHub.
6. Despliega el sitio por HTTPS (GitHub Pages o hosting estático). El Service Worker no funciona correctamente desde `file://`.

## 2. Roles y usuarios principales

El SQL de `supabase/usuarios_principales.sql` hace un `INSERT ... SELECT` desde `auth.users` hacia `public.perfiles` y asigna estos tres roles:

- `admin`: configuración, pagos, usuarios, bitácora y ventas.
- `empleado`: productos, ligas, carrusel, pedidos e inventario.
- `sistema`: rol técnico reservado por compatibilidad. El webhook web usa `service_role` únicamente en el servidor; no necesita iniciar sesión con una cuenta técnica desde el navegador.

**No hay contraseñas predeterminadas en el repositorio.** Las cuentas se crean en Supabase Auth y sus contraseñas se entregan por un canal privado al titular. No es seguro escribir credenciales reales en un README que puede terminar publicado. En el formulario de personal se solicita el correo autorizado sin sugerir ni revelar nombres de cuenta.

## 3. Flujo de compra

Después de seleccionar producto, talla y cantidad, el cliente puede:

- **Pago QR completo:** el pedido queda pendiente y muestra el QR guardado en Ajustes → Pagos. El QR es un campo independiente del carrusel y de las fotos del producto.
- **Efectivo:** solo para entrega/recojo local. El pedido queda pendiente de cobro; el personal confirma cuando recibe el efectivo.
- **Pago mixto:** una parte QR y el saldo en efectivo, solo para entrega local. La parte QR se confirma primero; el pedido pasa a `pago_parcial`. El personal confirma el saldo en efectivo y entonces pasa a `pagado`.
- **Coordinar por WhatsApp:** registra un pedido en estado `coordinacion` y abre un mensaje con el detalle. No realiza cobro.
- **Envío a otro departamento:** el selector bloquea efectivo y pago mixto; quedan QR completo o coordinación por WhatsApp.

Los campos se validan en el navegador y nuevamente en PostgreSQL. Un trigger de servidor recalcula el total usando los precios vigentes, comprueba tallas y cantidades, y reserva el stock en una transacción. Si el pedido QR vence o se cancela, la reserva se libera. El vencimiento se guarda en `vence_en`; la pantalla muestra una cuenta regresiva. Si `pg_cron` está habilitado, el SQL programa la limpieza cada minuto. Activa la extensión `pg_cron` en Supabase si no está habilitada; si no hay cron, la pantalla puede cancelar al vencer mientras siga abierta, pero no se debe prometer una cancelación de servidor con el navegador cerrado.

## 4. Qué significa “validar el QR”

La imagen QR es el medio para iniciar una transferencia, **no una prueba de que el dinero llegó**. Una página web no puede autenticar por sí sola una captura de pantalla ni leer una foto y garantizar que el banco abonó el importe.

Hay dos métodos válidos:

1. **Revisión web manual (funciona con cualquier banco):** el cliente sube una imagen JPG/PNG/WEBP de hasta 5 MB y, opcionalmente, su referencia. El pedido queda pendiente de revisión. El administrador/empleado debe comprobar el movimiento real en la cuenta bancaria y pulsar “Confirmar pago”. No se debe confirmar basándose solo en la imagen.
2. **Webhook de banco/proveedor (automático):** si el banco o una pasarela ofrece notificaciones servidor-a-servidor, despliega `supabase/functions/registrar-pago`. Configura los secretos `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `PAYMENT_WEBHOOK_SECRET` con Supabase CLI/Secrets. El proveedor debe enviar el identificador único de transacción y el importe a la función con el encabezado `x-payment-secret`. La función registra la transacción en el servidor; PostgreSQL concilia el importe exacto y evita procesar dos veces el mismo identificador.

Comandos de despliegue (desde la carpeta del proyecto Supabase):
```bash
supabase secrets set PAYMENT_WEBHOOK_SECRET="un-secreto-largo-aleatorio"
supabase secrets set SUPABASE_URL="https://TU-PROYECTO.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
supabase functions deploy registrar-pago
```
`supabase/config.toml` desactiva la validación JWT estándar solo para esta función; la función valida su secreto propio. En producción, configura el proveedor para enviar el secreto por HTTPS y, si el banco firma sus webhooks, adapta la validación a la firma oficial del banco.
No pongas ese secreto en el frontend. Si tu banco no ofrece API/webhook, usa la revisión manual; no existe un método universal que valide automáticamente una transferencia bancaria a partir de una foto QR.

## 5. Offline First

- El Service Worker conserva la interfaz y los recursos estáticos para abrir el catálogo sin conexión después de la primera visita online.
- Los productos previamente sincronizados se muestran desde la caché local.
- Sin internet no se permite iniciar sesión contra Supabase, registrar pedidos, subir comprobantes, sincronizar inventario ni confirmar pagos. La interfaz informa de esta limitación.
- La base de datos nunca se simula como si hubiera confirmado una operación. Las acciones que necesitan servidor esperan a que vuelva la conexión.
- Los cambios de administrador/inventario requieren conexión. No se presenta un cambio local como si ya estuviera guardado en Supabase.

## 6. Carrusel, medios y rendimiento

El carrusel admite slides con imagen, vídeo o ambos. Desde el panel de personal puedes subir MP4 o WEBM de hasta 30 MB; el vídeo se almacena por separado del QR de pago y puede reproducirse con controles en el carrusel. Las imágenes conservan carga diferida (`loading=lazy`, `decoding=async`) y las galerías de producto se limitan a ocho fotos.

Los vídeos se transmiten bajo demanda y no se precargan en la caché offline para evitar llenar el almacenamiento del teléfono. El catálogo y la estructura del carrusel sí se conservan; el vídeo necesita conexión si no se había descargado previamente por el navegador.

## 7. Avances ocultos

Para mostrar las páginas de semanas 1–3:
1. En la pantalla de acceso, pulsa el logo seis veces.
2. En la tienda/inicio, pulsa el logo seis veces.
3. Se abre el panel con enlaces relativos a las carpetas `semana1/`, `semana2/` y `semana3/`.

El panel de accesibilidad incluye el control **Animaciones ON/OFF**. En móvil se mantiene el modo ligero por defecto; el usuario puede cambiarlo manualmente.

Es una ocultación de interfaz, no un mecanismo de seguridad: las páginas públicas estáticas siguen siendo accesibles si alguien conoce sus rutas. No guardes secretos ni credenciales en esas carpetas.

## 8. Diagnóstico de “demasiados intentos”

Ese mensaje lo genera el limitador de autenticación de Supabase después de varios intentos fallidos. La versión reparada elimina una segunda consulta de autenticación que se ejecutaba inmediatamente después del login, pero no puede borrar un bloqueo que ya impuso Supabase. Espera el intervalo indicado, revisa el correo/contraseña desde Authentication y evita probar repetidamente. Si persiste, revisa Authentication → Logs y los límites de Auth del proyecto.

## 9. Importante antes de producción

Esta entrega incluye validación estática del código y mejoras del esquema, pero no puede certificar una conexión real a tu proyecto Supabase, las credenciales de tus cuentas, los permisos configurados en el Dashboard ni la recepción de transferencias de tu banco desde este entorno. Haz una prueba controlada con un producto de bajo precio y una transferencia real pequeña antes de habilitar ventas. Comprueba también una compra QR, una compra en efectivo local, un pedido mixto, un envío interdepartamental, una coordinación WhatsApp, cancelación/expiración y el acceso de cada rol.


## 10. Comprobaciones realizadas en esta entrega

- Sintaxis de los 39 archivos JavaScript y del Service Worker: correcta.
- Imports relativos: sin destinos faltantes.
- Enlaces `href`/`src` locales de las páginas HTML: sin rutas faltantes.
- IDs duplicados en `index.html`: ninguno.
- Archivos declarados en la precaché del Service Worker: todos existen.

Estas comprobaciones son estáticas. No equivalen a ejecutar `schema.sql` en tu proyecto Supabase ni a probar un pago bancario real; esos pasos requieren acceso al proyecto y una transferencia de prueba.
