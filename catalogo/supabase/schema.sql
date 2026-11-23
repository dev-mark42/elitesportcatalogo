-- ======================================================================
-- Elite Sport · Esquema COMPLETO para Supabase (se puede ejecutar varias veces)
-- Supabase → SQL Editor → New query → pega TODO → Run
-- Si ya tenías la versión anterior, esto SOLO agrega lo nuevo (no borra datos).
-- ======================================================================

-- 1) PERFILES y ROLES: cliente · empleado · admin · sistema (rol técnico reservado) -------------
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
  img text default '', video text default '', badge text default '', titulo text not null, texto text default ''
);
alter table public.carrusel add column if not exists video text not null default '';
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
  estado text not null default 'pendiente_pago',
  metodo text not null default 'qr',
  monto_qr numeric(10,2) not null default 0,
  monto_efectivo numeric(10,2) not null default 0,
  entrega_tipo text not null default 'local',
  departamento text,
  vence_en timestamptz,
  stock_reservado boolean not null default false,
  comprobante text, referencia text, pago_id bigint, confirmado_por text,
  creado timestamptz not null default now(), pagado_en timestamptz,
  constraint pedidos_estado_check check (estado in ('pendiente_pago','pago_parcial','coordinacion','pagado','enviado','entregado','cancelado')),
  constraint pedidos_metodo_check check (metodo in ('qr','efectivo','mixto','whatsapp')),
  constraint pedidos_montos_check check (total >= 0 and monto_qr >= 0 and monto_efectivo >= 0),
  constraint pedidos_entrega_check check (entrega_tipo in ('local','departamento')),
  constraint pedidos_envio_pago_check check (not (entrega_tipo = 'departamento' and metodo in ('efectivo','mixto')))
);
alter table public.pedidos add column if not exists monto_qr numeric(10,2) not null default 0;
alter table public.pedidos add column if not exists monto_efectivo numeric(10,2) not null default 0;
alter table public.pedidos add column if not exists entrega_tipo text not null default 'local';
alter table public.pedidos add column if not exists departamento text;
alter table public.pedidos add column if not exists vence_en timestamptz;
alter table public.pedidos add column if not exists stock_reservado boolean not null default false;
alter table public.pedidos drop constraint if exists pedidos_estado_check;
alter table public.pedidos add constraint pedidos_estado_check check (estado in ('pendiente_pago','pago_parcial','coordinacion','pagado','enviado','entregado','cancelado'));
alter table public.pedidos drop constraint if exists pedidos_metodo_check;
alter table public.pedidos add constraint pedidos_metodo_check check (metodo in ('qr','efectivo','mixto','whatsapp'));
alter table public.pedidos drop constraint if exists pedidos_montos_check;
alter table public.pedidos add constraint pedidos_montos_check check (total >= 0 and monto_qr >= 0 and monto_efectivo >= 0);
alter table public.pedidos drop constraint if exists pedidos_entrega_check;
alter table public.pedidos add constraint pedidos_entrega_check check (entrega_tipo in ('local','departamento'));
alter table public.pedidos drop constraint if exists pedidos_envio_pago_check;
alter table public.pedidos add constraint pedidos_envio_pago_check check (not (entrega_tipo = 'departamento' and metodo in ('efectivo','mixto')));
-- Un monto único por pedido pendiente: así cada notificación del banco corresponde a UN solo pedido
drop index if exists public.pedidos_monto_pendiente;
create unique index pedidos_monto_pendiente on public.pedidos (monto_unico) where estado = 'pendiente_pago' and metodo in ('qr','mixto') and monto_unico is not null;

create table if not exists public.pagos_recibidos (   -- solo una integración confiable de servidor inserta notificaciones de pago
  id bigint generated always as identity primary key,
  monto numeric(10,2) not null check (monto > 0),
  remitente text, banco text, mensaje text,
  transaction_id text,
  pedido_id bigint, creado timestamptz not null default now()
);
alter table public.pagos_recibidos add column if not exists transaction_id text;
alter table public.pagos_recibidos drop constraint if exists pagos_recibidos_monto_check;
alter table public.pagos_recibidos add constraint pagos_recibidos_monto_check check (monto > 0);
create unique index if not exists pagos_recibidos_transaction_id_uq
  on public.pagos_recibidos(transaction_id) where transaction_id is not null;

-- Al llegar un pago confiable: concilia el importe exacto y marca pagado o pago_parcial
create or replace function public.conciliar_pago() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid bigint; efectivo numeric(10,2);
begin
  select id, monto_efectivo into pid, efectivo from public.pedidos
   where estado = 'pendiente_pago' and metodo in ('qr','mixto')
     and monto_unico = new.monto and (vence_en is null or vence_en > now())
   order by creado desc limit 1 for update;
  if pid is not null then
    update public.pedidos
       set estado = case when efectivo > 0 then 'pago_parcial' else 'pagado' end,
           pagado_en = case when efectivo = 0 then now() else null end,
           pago_id = new.id,
           confirmado_por = 'confirmación recibida por integración de pagos'
     where id = pid;
    new.pedido_id := pid;
  end if;
  return new;
end $$;
drop trigger if exists al_recibir_pago on public.pagos_recibidos;
create trigger al_recibir_pago before insert on public.pagos_recibidos for each row execute function public.conciliar_pago();

-- Retirar el trigger anterior para que el stock no se descuente dos veces al confirmar.
drop trigger if exists al_pagar_pedido on public.pedidos;
drop function if exists public.descontar_stock();

-- Validación transaccional: precio, talla, cantidad, total y stock se verifican en servidor.
-- El stock se reserva al crear un pedido de pago y se libera si vence o se cancela.
create or replace function public.validar_pedido_y_reservar_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare it jsonb; prod public.productos%rowtype; qty int; total_calc numeric(10,2) := 0;
        items_ok jsonb := '[]'::jsonb; afectadas int;
begin
  if auth.uid() is null or new.usuario_id is distinct from auth.uid() then
    raise exception 'Sesión no válida para crear el pedido';
  end if;
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0 then
    raise exception 'El pedido no contiene productos';
  end if;
  for it in select value from jsonb_array_elements(new.items) loop
    if coalesce(it->>'id','') !~ '^[0-9]+$' or coalesce(it->>'cant','') !~ '^[0-9]+$' then
      raise exception 'Producto o cantidad no válida';
    end if;
    qty := (it->>'cant')::int;
    if qty < 1 or qty > 20 then raise exception 'Cantidad fuera de rango'; end if;
    select * into prod from public.productos where id = (it->>'id')::bigint for update;
    if not found then raise exception 'Un producto ya no está disponible'; end if;
    if not ((it->>'talla') = any(prod.tallas)) then raise exception 'La talla seleccionada no está disponible'; end if;
    total_calc := total_calc + (prod.precio * qty);
    items_ok := items_ok || jsonb_build_array(jsonb_build_object(
      'id', prod.id, 'titulo', prod.titulo, 'talla', it->>'talla',
      'cant', qty, 'precio', prod.precio, 'imagen', prod.imagen
    ));
  end loop;
  new.items := items_ok;
  new.total := total_calc;
  if new.metodo = 'whatsapp' and new.estado <> 'coordinacion' then
    raise exception 'La coordinación debe registrarse como coordinación';
  elsif new.metodo <> 'whatsapp' and new.estado <> 'pendiente_pago' then
    raise exception 'El pedido debe iniciar pendiente de pago';
  end if;
  if new.metodo = 'qr' then
    if new.monto_efectivo <> 0 or new.monto_qr < total_calc or new.monto_qr > total_calc + 0.99 then
      raise exception 'Monto QR no coincide con el total del pedido';
    end if;
  elsif new.metodo = 'mixto' then
    if new.monto_qr <= 0 or new.monto_efectivo <= 0 or round(new.monto_qr + new.monto_efectivo,2) <> total_calc then
      raise exception 'El pago mixto debe sumar el total exacto';
    end if;
  elsif new.metodo = 'efectivo' then
    if new.entrega_tipo <> 'local' or new.monto_qr <> 0 or new.monto_efectivo <> total_calc then
      raise exception 'El pago en efectivo solo se permite para entrega local';
    end if;
  elsif new.metodo = 'whatsapp' then
    if new.monto_qr <> 0 or new.monto_efectivo <> 0 then raise exception 'La coordinación no registra cobro'; end if;
  else
    raise exception 'Método de pago no permitido';
  end if;
  if new.entrega_tipo = 'departamento' and new.metodo in ('efectivo','mixto') then
    raise exception 'Para envíos a otro departamento se requiere QR o coordinación';
  end if;
  if new.metodo in ('qr','mixto') and new.monto_unico is distinct from new.monto_qr then
    raise exception 'El importe del QR no coincide con el importe reservado';
  end if;
  if new.metodo in ('qr','mixto') then
    select now() + make_interval(mins => greatest(5, least(120, coalesce((valor->>'minutos')::int, 30))))
      into new.vence_en from public.ajustes where clave = 'pago';
    new.vence_en := coalesce(new.vence_en, now() + interval '30 minutes');
  else
    new.vence_en := null;
  end if;
  return new;
end $$;
drop trigger if exists pedidos_validar_antes_insertar on public.pedidos;
create trigger pedidos_validar_antes_insertar before insert on public.pedidos
for each row execute function public.validar_pedido_y_reservar_stock();

create or replace function public.reservar_stock_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare it record; afectadas int;
begin
  if new.estado = 'pendiente_pago' then
    for it in
      select (value->>'id')::bigint as id, sum((value->>'cant')::int)::int as cant
      from jsonb_array_elements(new.items) group by (value->>'id')::bigint
    loop
      update public.productos set stock = stock - it.cant
       where id = it.id and stock >= it.cant;
      get diagnostics afectadas = row_count;
      if afectadas = 0 then raise exception 'Stock insuficiente para completar el pedido'; end if;
    end loop;
    update public.pedidos set stock_reservado = true where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists pedidos_reservar_stock on public.pedidos;
create trigger pedidos_reservar_stock after insert on public.pedidos
for each row execute function public.reservar_stock_pedido();

create or replace function public.liberar_stock_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare it record;
begin
  if old.stock_reservado and old.estado in ('pendiente_pago','pago_parcial') and new.estado = 'cancelado' then
    for it in
      select (value->>'id')::bigint as id, sum((value->>'cant')::int)::int as cant
      from jsonb_array_elements(old.items) group by (value->>'id')::bigint
    loop
      update public.productos set stock = stock + it.cant where id = it.id;
    end loop;
    update public.pedidos set stock_reservado = false where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists pedidos_liberar_stock on public.pedidos;
create trigger pedidos_liberar_stock after update of estado on public.pedidos
for each row execute function public.liberar_stock_pedido();

-- Cancelación del cliente por RPC: evita que pueda modificar precios, importes o estados libremente.
create or replace function public.cancelar_pedido_propio(p_pedido_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  update public.pedidos set estado = 'cancelado'
   where id = p_pedido_id and usuario_id = auth.uid()
     and estado in ('pendiente_pago','coordinacion');
  if not found then raise exception 'El pedido ya no se puede cancelar'; end if;
end $$;
revoke all on function public.cancelar_pedido_propio(bigint) from public;
grant execute on function public.cancelar_pedido_propio(bigint) to authenticated;

-- El cliente solo puede adjuntar el comprobante a su propio pedido pendiente.
create or replace function public.registrar_comprobante_pedido(
  p_pedido_id bigint, p_url text, p_referencia text default ''
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_url !~ ('^https://[^/]+/storage/v1/object/public/imagenes/comprobantes/' || auth.uid()::text || '/[^[:space:]]+$') then
    raise exception 'Comprobante o sesión no válidos';
  end if;
  update public.pedidos
     set comprobante = p_url, referencia = left(coalesce(p_referencia,''),40)
   where id = p_pedido_id and usuario_id = auth.uid()
     and estado = 'pendiente_pago';
  if not found then raise exception 'Pedido no encontrado o ya no está pendiente'; end if;
end $$;
revoke all on function public.registrar_comprobante_pedido(bigint,text,text) from public;
grant execute on function public.registrar_comprobante_pedido(bigint,text,text) to authenticated;

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
create policy "perfil_admin" on public.perfiles for all using (public.es_admin()) with check (public.es_admin());

drop policy if exists "favoritos_propios" on public.favoritos;
create policy "favoritos_propios" on public.favoritos for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

drop policy if exists "pedido_crear" on public.pedidos; drop policy if exists "pedido_ver" on public.pedidos;
drop policy if exists "pedido_personal" on public.pedidos; drop policy if exists "pedido_cancelar_propio" on public.pedidos;
create policy "pedido_crear" on public.pedidos for insert to authenticated with check (usuario_id = auth.uid() and estado in ('pendiente_pago','coordinacion'));
create policy "pedido_ver" on public.pedidos for select to authenticated using (usuario_id = auth.uid() or public.es_personal());
create policy "pedido_personal" on public.pedidos for update to authenticated using (public.es_personal()) with check (public.es_personal());
drop policy if exists "pagos_insertar" on public.pagos_recibidos; drop policy if exists "pagos_ver" on public.pagos_recibidos;
create policy "pagos_ver" on public.pagos_recibidos for select to authenticated using (public.es_personal());

drop policy if exists "bitacora_insertar" on public.bitacora; drop policy if exists "bitacora_ver" on public.bitacora;
create policy "bitacora_insertar" on public.bitacora for insert to authenticated with check (usuario_id = auth.uid());
create policy "bitacora_ver" on public.bitacora for select to authenticated using (public.es_admin());

-- 7) IMÁGENES (Storage) — se ven igual en celular y laptop -------------------------------------------------
insert into storage.buckets (id, name, public) values ('imagenes', 'imagenes', true) on conflict (id) do update set public = true;
drop policy if exists "img_leer" on storage.objects; drop policy if exists "img_subir" on storage.objects; drop policy if exists "img_borrar" on storage.objects;
create policy "img_leer" on storage.objects for select using (bucket_id = 'imagenes');
create policy "img_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'imagenes' and (public.es_personal() or name like ('comprobantes/' || auth.uid()::text || '/%')));
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

-- Las cuentas se crean en Supabase Auth y sus roles se asignan con supabase/usuarios_principales.sql.

-- 11) Limpieza automática de pedidos sin pagar (la app la llama antes de crear cada pedido) ---------------
create or replace function public.expirar_pedidos() returns void language sql security definer set search_path = public as
$$
  update public.pedidos
     set estado = 'cancelado'
   where estado = 'pendiente_pago' and metodo in ('qr','mixto')
     and ((vence_en is not null and vence_en <= now())
       or (vence_en is null and creado < now() - interval '30 minutes'));
$$;
revoke all on function public.expirar_pedidos() from public;
grant execute on function public.expirar_pedidos() to authenticated;

-- Expiración también en servidor si pg_cron está habilitado en este proyecto.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('elite-expirar-pedidos', '* * * * *', 'select public.expirar_pedidos()');
  end if;
exception when others then
  raise notice 'Activa pg_cron y programa public.expirar_pedidos() cada minuto desde Supabase Cron.';
end $$;
