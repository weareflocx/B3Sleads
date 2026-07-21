-- Imagen propia para founders, startups y fondos. Se pega a mano: traerla
-- de LinkedIn de forma programática sería scraping (spec §9). El monograma
-- generado localmente sigue siendo la base: la imagen solo se muestra si
-- carga de verdad, así que una URL rota nunca deja un hueco.

alter table contacts add column if not exists avatar_url text;
alter table companies add column if not exists logo_url text;
alter table investors add column if not exists logo_url text;
