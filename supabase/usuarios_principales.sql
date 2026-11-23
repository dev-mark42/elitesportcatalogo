-- Elite Sport: asignación segura de los 3 roles principales.
-- PASO 1: crea tres usuarios desde Supabase Dashboard > Authentication > Users > Add user.
-- PASO 2: reemplaza estos tres correos por los que tú hayas elegido.
-- PASO 3: ejecuta este archivo. No contiene contraseñas ni claves privadas.
with cuentas(email, nombre, rol) as (
  values
    ('admin@elitesport.com', 'Administrador principal', 'admin'),
    ('empleado@elitesport.com', 'Personal de catálogo', 'empleado'),
    ('sistema@elitesport.com', 'Integración de pagos', 'sistema')
)
insert into public.perfiles (id, nombre, email, rol)
select u.id, c.nombre, u.email, c.rol
from auth.users u
join cuentas c on lower(c.email) = lower(u.email)
on conflict (id) do update
set nombre = excluded.nombre,
    email = excluded.email,
    rol = excluded.rol;
