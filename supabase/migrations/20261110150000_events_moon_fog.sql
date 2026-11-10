-- V13, V14 : lune rouge et brouillard.
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('caravane', 'colosse', 'foire', 'fete', 'etoiles', 'treve', 'marchand', 'lune', 'brouillard'));
