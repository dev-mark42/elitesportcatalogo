# Elite Sport · Sistema de catálogo, pedidos y pagos (PWA)

Un solo `index.html` (acceso, tienda y panel) · celular, tablet y laptop · instalable · todo en **Supabase**.

## Roles
| Rol | Qué hace |
|---|---|
| **Cliente** | Ve el catálogo (varias fotos con descripción y zoom), favoritos, carrito, **paga con QR** y sigue sus pedidos. |
| **Empleado** | Sube y edita productos (fotos múltiples), ligas, carrusel; revisa pedidos, confirma pagos manuales y marca enviados/entregados. |
| **Admin** | Dueño del negocio: **ventas**, pedidos, **bitácora** de todo lo que pasa, usuarios y roles, marca (logo, balón, color, WhatsApp), pagos (QR), avances y sistema. **No toca el catálogo.** |
| **Sistema** | Cuenta técnica de tu app *Listening* (solo inserta pagos recibidos). |

## Puesta en marcha (una vez)
1. Supabase → **SQL Editor** → pega y ejecuta `supabase/schema.sql` (es seguro correrlo otra vez: no borra datos).
2. **Authentication → Users → Add user**: `admin@elitesport.com` + contraseña (Auto confirm). Luego:
   `update public.perfiles set rol = 'admin' where email = 'admin@elitesport.com';`
3. **Empleado**: que se registre en la app y, como admin, en *Usuarios y roles* cámbiale el rol a «Empleado».
4. Credenciales en `js/core/config.js` (`SUPABASE_URL` y `SUPABASE_KEY`). Authentication → Providers → Email: desactiva «Confirm email» si quieres entrar sin confirmar correo.
5. Subir a GitHub Pages. Ingreso del personal: pestaña **Personal** (`admin` equivale a `admin@elitesport.com`).

## Imágenes
- Pega enlaces de **Dropbox** (se convierten solos) o **sube archivos**: se guardan en Supabase Storage (bucket `imagenes`) y en la BD queda solo la URL, así celular y laptop ven lo mismo.
- Subir directo a Dropbox desde el navegador exigiría un token privado en el código público, por eso no se hace.

## Pagos con QR validados al instante
1. Admin → *Pagos (QR)*: sube la foto de tu QR, titular, banco, minutos para pagar.
2. Cada pedido genera un **monto único** (ej. Bs 350,37). El cliente ve el QR, el monto exacto y una cuenta regresiva.
3. Tu app **Listening** inserta cada notificación de pago con el usuario `sistema@elitesport.com`:
   - Crear usuario `sistema@elitesport.com` y `update public.perfiles set rol='sistema' where email='sistema@elitesport.com';`
   - Login: `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` (header `apikey: {KEY}`, body `{"email":"sistema@elitesport.com","password":"…"}`) → `access_token`.
   - Pago: `POST {SUPABASE_URL}/rest/v1/pagos_recibidos` con headers `apikey: {KEY}`, `Authorization: Bearer {access_token}`, `Content-Type: application/json` y body `{"monto":350.37,"remitente":"Juan P.","banco":"BCP","mensaje":"texto de la notificación"}`.
4. La base de datos (trigger `conciliar_pago`) busca el pedido pendiente con ese monto y lo marca **pagado**; el cliente lo ve en su pantalla en segundos (tiempo real) y el stock se descuenta solo.
5. Respaldo: el cliente sube su comprobante y el empleado pulsa «Confirmar pago».

## Avances (semanas 1–3)
`semana1/`, `semana2/`, `semana3/`: cada carpeta tiene su módulo y un `index.html` que funciona solo; el sistema los usa. Acceso rápido: **Panel admin → Avances** (lista con enlaces). URL de ejemplo: `https://TU-USUARIO.github.io/catalogo/semana3/05-smoke-test-dom/`.
Botón flotante de accesibilidad (abajo a la izquierda): alto contraste, semántica HTML5, Smoke Test, métricas web y **modo ligero**.

## Celular
En celular/tablet se activa el **modo ligero** (sin partículas, desenfoques ni animaciones de scroll). Se puede cambiar en el botón de accesibilidad.

## Estructura
`index.html · manifest.json · sw.js · css/ · js/{main.js,core/,views/} · pwa/ · assets/ · supabase/schema.sql · semana1-3/`
