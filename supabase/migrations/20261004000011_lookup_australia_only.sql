-- Tyrebiter: the free vehicle lookup uses Australian sources only (our own listings).
-- Removes the option to load overseas open data into vin_patterns.
-- Run after 20261004000010_free_lookup.sql.
delete from public.vin_patterns where source not in ('listing', 'staff');
alter table public.vin_patterns drop constraint if exists vin_patterns_source_check;
alter table public.vin_patterns add constraint vin_patterns_source_check check (source in ('listing', 'staff'));
comment on table public.vin_patterns is 'What a VIN pattern (characters 1-8 and 10) usually means, learned from vehicles we have listed in Australia. Server only.';
