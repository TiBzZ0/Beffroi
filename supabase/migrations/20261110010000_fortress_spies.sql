-- Beffroi : un rapport d'espion sans cible porte sur la forteresse.
alter table public.spy_reports alter column target_id drop not null;
