create table public.plant_species_backup_20261006 as
select * from public.plant_species;

alter table public.plant_species_backup_20261006 add primary key (id);
alter table public.plant_species_backup_20261006 enable row level security;

create table public._common_name_work as
with g as (
  select id,
         scientific_name,
         common_name as old_common_name,
         split_part(scientific_name, ' ', 1) as genus
  from public.plant_species
), gc as (
  select genus,
         sum(count(*)) over (order by genus) as cum
  from g
  group by genus
)
select (row_number() over (order by g.scientific_name))::int as n,
       g.id,
       g.scientific_name,
       g.old_common_name,
       (floor((gc.cum - 1) / 350))::int as bucket,
       null::text as new_common_name,
       null::text as status
from g
join gc using (genus);

alter table public._common_name_work add primary key (n);
alter table public._common_name_work enable row level security;
