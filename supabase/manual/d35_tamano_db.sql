-- D35: solo lectura. Tamaño real de la base y de las tablas más grandes.
select pg_size_pretty(pg_database_size(current_database())) as base_total;

select relname as tabla,
       pg_size_pretty(pg_total_relation_size(relid)) as total,
       n_live_tup as filas_aprox
  from pg_stat_user_tables
 order by pg_total_relation_size(relid) desc
 limit 20;
