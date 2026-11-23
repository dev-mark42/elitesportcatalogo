-- ======================================================================
-- Elite Sport · Esquema COMPLETO para Supabase (se puede ejecutar varias veces)
-- Supabase → SQL Editor → New query → pega TODO → Run
-- Si ya tenías la versión anterior, esto SOLO agrega lo nuevo (no borra datos).
-- ======================================================================

-- 1) PERFILES y ROLES: cliente · empleado · admin · sistema (la app que lee notificaciones) -------------
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text, email text, telefono text,
  rol text not null default 'cliente',
  creado timestamptz not null default now()
);
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('cliente','empleado','admin','sistema'));

create or replace function public.nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, email, telefono)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)), new.email, new.raw_user_meta_data->>'telefono')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users for each row execute function public.nuevo_usuario();

create or replace function public.rol_actual() returns text language sql security definer set search_path = public stable as
$$ select rol from public.perfiles where id = auth.uid() $$;
create or replace function public.es_admin()    returns boolean language sql security definer set search_path = public stable as $$ select coalesce(public.rol_actual() = 'admin', false) $$;
create or replace function public.es_empleado() returns boolean language sql security definer set search_path = public stable as $$ select coalesce(public.rol_actual() = 'empleado', false) $$;
create or replace function public.es_personal() returns boolean language sql security definer set search_path = public stable as $$ select coalesce(public.rol_actual() in ('empleado','admin'), false) $$;
create or replace function public.es_sistema()  returns boolean language sql security definer set search_path = public stable as $$ select coalesce(public.rol_actual() = 'sistema', false) $$;

-- 2) CATÁLOGO (lo administra el EMPLEADO) --------------------------------------------------------------
create table if not exists public.ligas (clave text primary key, nombre text not null, logo text default '', orden int default 0);
create table if not exists public.productos (
  id bigint primary key, titulo text not null, precio numeric not null default 0, stock int not null default 0,
  liga text not null, temporada text default '2025/26', tallas text[] default '{S,M}',
  imagen text default '', descripcion text default '', fecha_creacion text, creado timestamptz not null default now()
);
alter table public.productos add column if not exists imagenes jsonb not null default '[]'::jsonb;   -- NUEVO: varias fotos [{url, desc}]
create table if not exists public.carrusel (
  id bigint generated always as identity primary key, orden int not null default 0,
  img text default '', badge text default '', titulo text not null, texto text default ''
);
create table if not exists public.favoritos (
  usuario_id uuid not null references auth.users(id) on delete cascade, producto_id bigint not null,
  primary key (usuario_id, producto_id)
);

-- 3) AJUSTES de marca / tienda / pagos (los edita el ADMIN) ---------------------------------------------
create table if not exists public.ajustes (clave text primary key, valor jsonb not null default '{}'::jsonb, actualizado timestamptz default now());

-- 4) PEDIDOS y PAGOS ------------------------------------------------------------------------------------
create table if not exists public.pedidos (
  id bigint generated always as identity primary key,
  usuario_id uuid references auth.users(id) on delete set null,
  cliente_nombre text, cliente_email text, telefono text, notas text,
  items jsonb not null default '[]'::jsonb,
  total numeric(10,2) not null default 0,
  monto_unico numeric(10,2),
  estado text not null default 'pendiente_pago' check (estado in ('pendiente_pago','pagado','enviado','entregado','cancelado')),
  metodo text default 'qr',
  comprobante text, referencia text, pago_id bigint, confirmado_por text,
  creado timestamptz not null default now(), pagado_en timestamptz
);
-- Un monto único por pedido pendiente: así cada notificación del banco corresponde a UN solo pedido
create unique index if not exists pedidos_monto_pendiente on public.pedidos (monto_unico) where estado = 'pendiente_pago';

create table if not exists public.pagos_recibidos (   -- aquí inserta tu app "Listening" cada notificación de pago
  id bigint generated always as identity primary key,
  monto numeric(10,2) not null, remitente text, banco text, mensaje text,
  pedido_id bigint, creado timestamptz not null default now()
);

-- Al llegar un pago: busca el pedido pendiente con ese monto EXACTO y lo marca como pagado
create or replace function public.conciliar_pago() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid bigint;
begin
  select id into pid from public.pedidos
   where estado = 'pendiente_pago' and monto_unico = new.monto and creado > now() - interval '3 hours'
   order by creado desc limit 1;
  if pid is not null then
    update public.pedidos set estado = 'pagado', pagado_en = now(), pago_id = new.id,
           confirmado_por = 'automático (notificación del banco)' where id = pid;
    new.pedido_id := pid;
  end if;
  return new;
end $$;
drop trigger if exists al_recibir_pago on public.pagos_recibidos;
create trigger al_recibir_pago before insert on public.pagos_recibidos for each row execute function public.conciliar_pago();

-- Al pasar a "pagado" (automático o manual) se descuenta el stock
create or replace function public.descontar_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if new.estado = 'pagado' and old.estado is distinct from 'pagado' then
    for it in select * from jsonb_array_elements(new.items) loop
      update public.productos set stock = greatest(0, stock - coalesce((it->>'cant')::int, 1)) where id = (it->>'id')::bigint;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists al_pagar_pedido on public.pedidos;
create trigger al_pagar_pedido after update on public.pedidos for each row execute function public.descontar_stock();

-- 5) BITÁCORA (solo la ve el ADMIN) ----------------------------------------------------------------------
create table if not exists public.bitacora (
  id bigint generated always as identity primary key,
  usuario_id uuid, usuario_email text, rol text, accion text not null, detalle text,
  creado timestamptz not null default now()
);

-- 6) SEGURIDAD (RLS) -----------------------------------------------------------------------------------
alter table public.perfiles enable row level security;   alter table public.ligas enable row level security;
alter table public.productos enable row level security;  alter table public.carrusel enable row level security;
alter table public.favoritos enable row level security;  alter table public.ajustes enable row level security;
alter table public.pedidos enable row level security;    alter table public.pagos_recibidos enable row level security;
alter table public.bitacora enable row level security;

do $$ declare t text; begin
  -- Catálogo: lo ve cualquiera; solo el EMPLEADO lo modifica
  foreach t in array array['ligas','productos','carrusel'] loop
    execute format('drop policy if exists "leer_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "admin_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "empleado_%1$s" on public.%1$s', t);
    execute format('create policy "leer_%1$s" on public.%1$s for select using (true)', t);
    execute format('create policy "empleado_%1$s" on public.%1$s for all using (public.es_empleado()) with check (public.es_empleado())', t);
  end loop;
end $$;

drop policy if exists "ajustes_leer" on public.ajustes;  drop policy if exists "ajustes_admin" on public.ajustes;
create policy "ajustes_leer" on public.ajustes for select using (true);
create policy "ajustes_admin" on public.ajustes for all using (public.es_admin()) with check (public.es_admin());

drop policy if exists "perfil_propio_ver" on public.perfiles; drop policy if exists "perfil_propio_editar" on public.perfiles; drop policy if exists "perfil_admin" on public.perfiles;
create policy "perfil_propio_ver" on public.perfiles for select using (auth.uid() = id);
create policy "perfil_propio_editar" on public.perfiles for update using (auth.uid() = id)
  with check (auth.uid() = id and rol = (select p.rol from public.perfiles p where p.id = auth.uid()));
create policy "perfil_admin" on public.perfiles for all using (public.es_admin()) with check (public.es_admin());

drop policy if exists "favoritos_propios" on public.favoritos;
create policy "favoritos_propios" on public.favoritos for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

drop policy if exists "pedido_crear" on public.pedidos; drop policy if exists "pedido_ver" on public.pedidos;
drop policy if exists "pedido_personal" on public.pedidos; drop policy if exists "pedido_cancelar_propio" on public.pedidos;
create policy "pedido_crear" on public.pedidos for insert to authenticated with check (usuario_id = auth.uid() and estado = 'pendiente_pago');
create policy "pedido_ver" on public.pedidos for select to authenticated using (usuario_id = auth.uid() or public.es_personal());
create policy "pedido_personal" on public.pedidos for update to authenticated using (public.es_personal()) with check (public.es_personal());
create policy "pedido_cancelar_propio" on public.pedidos for update to authenticated
  using (usuario_id = auth.uid() and estado = 'pendiente_pago') with check (usuario_id = auth.uid() and estado in ('pendiente_pago','cancelado'));

drop policy if exists "pagos_insertar" on public.pagos_recibidos; drop policy if exists "pagos_ver" on public.pagos_recibidos;
create policy "pagos_insertar" on public.pagos_recibidos for insert to authenticated with check (public.es_sistema());
create policy "pagos_ver" on public.pagos_recibidos for select to authenticated using (public.es_personal());

drop policy if exists "bitacora_insertar" on public.bitacora; drop policy if exists "bitacora_ver" on public.bitacora;
create policy "bitacora_insertar" on public.bitacora for insert to anon, authenticated with check (usuario_id is null or usuario_id = auth.uid());
create policy "bitacora_ver" on public.bitacora for select to authenticated using (public.es_admin());

-- 7) IMÁGENES (Storage) — se ven igual en celular y laptop -------------------------------------------------
insert into storage.buckets (id, name, public) values ('imagenes', 'imagenes', true) on conflict (id) do update set public = true;
drop policy if exists "img_leer" on storage.objects; drop policy if exists "img_subir" on storage.objects; drop policy if exists "img_borrar" on storage.objects;
create policy "img_leer" on storage.objects for select using (bucket_id = 'imagenes');
create policy "img_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'imagenes' and (public.es_personal() or name like 'comprobantes/%'));
create policy "img_borrar" on storage.objects for delete to authenticated using (bucket_id = 'imagenes' and public.es_personal());

-- 8) TIEMPO REAL: lo que cambie en un equipo se refleja en los demás -------------------------------------
do $$ declare t text; begin
  foreach t in array array['productos','ligas','carrusel','ajustes','pedidos'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 9) DATOS INICIALES -------------------------------------------------------------------------------------
insert into public.ligas (clave, nombre, logo, orden) values
 ('laliga','La Liga','assets/img/ligas/laliga.png',0), ('premier','Premier League','assets/img/ligas/premier.png',1),
 ('seriea','Serie A','assets/img/ligas/seriea.png',2), ('bundesliga','Bundesliga','assets/img/ligas/bundesliga.png',3),
 ('argentina','Liga Argentina','assets/img/ligas/argentina.png',4) on conflict (clave) do nothing;
insert into public.productos (id,titulo,precio,stock,liga,temporada,tallas,imagen,descripcion) values
 (1,'Camiseta Real Madrid Local',380,12,'laliga','2025/26','{S,M,L,XL}','','Camiseta blanca titular con tecnología de secado rápido.'),
 (2,'Camiseta FC Barcelona Local',380,8,'laliga','2025/26','{M,L,XL}','','Los clásicos colores blaugrana, corte de jugador.'),
 (3,'Camiseta Manchester City',360,5,'premier','2025/26','{S,M,L}','','Celeste campeón, tela ligera y transpirable.'),
 (4,'Camiseta Liverpool Local',370,3,'premier','2024/25','{M,L}','','Rojo intenso con detalles dorados.'),
 (5,'Camiseta Juventus Local',350,10,'seriea','2025/26','{S,M,L,XL}','','Rayas clásicas blanquinegras.'),
 (6,'Camiseta Argentina Retro 86',420,0,'argentina','Retro','{M,L}','','Edición retro de colección, corte clásico.') on conflict (id) do nothing;
insert into public.carrusel (orden,img,badge,titulo,texto)
 select * from (values
 (0,'https://images.unsplash.com/photo-1522778119026-d647f0596c20?q=80&w=1600&auto=format&fit=crop','NUEVA COLECCIÓN','Temporada 2026/27','Siente la pasión del fútbol con la mejor calidad.'),
 (1,'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?q=80&w=1600&auto=format&fit=crop','OFERTA','Hasta 30% Off','Solo por tiempo limitado en camisetas seleccionadas.'),
 (2,'','ENVÍOS','Llegamos a todo Bolivia','Compra por WhatsApp y recibe en tu puerta.')) v(o,i,b,t,x)
 where not exists (select 1 from public.carrusel);
insert into public.ajustes (clave, valor) values
 ('marca',  '{"nombre":"ELITE SPORT","logo":"","balon":"","acento":""}'),
 ('tienda', '{"whatsapp":"","ciudad":"La Paz, Bolivia","horario":"Lun a Sáb · 9:00 a 20:00"}'),
 ('pago',   '{"qr":"","titular":"","banco":"","instrucciones":"Escanea el QR con la app de tu banco y paga el monto EXACTO que ves arriba.","minutos":30,"centavos":true}')
 on conflict (clave) do nothing;

-- ======================================================================
-- 10) CUENTAS (haz esto UNA vez)
--  a) Authentication → Users → Add user → admin@elitesport.com + contraseña (Auto confirm user)
--     update public.perfiles set rol = 'admin' where email = 'admin@elitesport.com';
--  b) EMPLEADO: que la persona se registre en la app (rol cliente) y luego, como admin, en
--     Panel → Usuarios cambia su rol a "Empleado". (o por SQL: update public.perfiles set rol='empleado' where email='...';)
--  c) APP QUE LEE NOTIFICACIONES (Listening): crea un usuario  sistema@elitesport.com  (Auto confirm) y ejecuta
--     update public.perfiles set rol = 'sistema' where email = 'sistema@elitesport.com';
-- ======================================================================

-- 11) Limpieza automática de pedidos sin pagar (la app la llama antes de crear cada pedido) ---------------
create or replace function public.expirar_pedidos() returns void language sql security definer set search_path = public as
$$ update public.pedidos set estado = 'cancelado' where estado = 'pendiente_pago' and creado < now() - interval '3 hours' $$;
grant execute on function public.expirar_pedidos() to authenticated;
