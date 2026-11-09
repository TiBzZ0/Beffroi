-- Beffroi : quatre nouveaux seigneurs voisins (difficultés variées).
insert into public.profiles (id, username, is_bot, display_name) values
  ('00000000-0000-4000-8000-00000000b0b0', 'Bourbelin', true, 'Hameau de Bourbelin'),
  ('00000000-0000-4000-8000-00000000e7b5', 'Ventebrise', true, 'Dame de Ventebrise'),
  ('00000000-0000-4000-8000-00000000d0a1', 'Noirval', true, 'Margrave de Noirval'),
  ('00000000-0000-4000-8000-00000000ffaa', 'Hautefaille', true, 'Duc de Hautefaille')
on conflict (id) do nothing;
