-- Beffroi : treize seigneurs de plus (vingt en tout).
insert into public.profiles (id, username, is_bot, display_name) values
  ('00000000-0000-4000-8000-000000000101', 'Moulinet', true, 'Meunier de Moulinet'),
  ('00000000-0000-4000-8000-000000000102', 'Bruyere', true, 'Abbaye de la Bruyère'),
  ('00000000-0000-4000-8000-000000000103', 'Pontcroix', true, 'Péage de Pontcroix'),
  ('00000000-0000-4000-8000-000000000104', 'Sauleraie', true, 'Chevalier de Sauleraie'),
  ('00000000-0000-4000-8000-000000000105', 'Roncebois', true, 'Brigands de Roncebois'),
  ('00000000-0000-4000-8000-000000000106', 'Clairmarais', true, 'Baronne de Clairmarais'),
  ('00000000-0000-4000-8000-000000000107', 'Pierrefendue', true, 'Sire de Pierrefendue'),
  ('00000000-0000-4000-8000-000000000108', 'Brumeport', true, 'Corsaires de Brumeport'),
  ('00000000-0000-4000-8000-000000000109', 'LysNoir', true, 'Ordre du Lys Noir'),
  ('00000000-0000-4000-8000-00000000010a', 'Hautgivre', true, 'Seigneur de Hautgivre'),
  ('00000000-0000-4000-8000-00000000010b', 'Rougemarc', true, 'Comtesse de Rougemarc'),
  ('00000000-0000-4000-8000-00000000010c', 'Marches', true, 'Roi des Marches'),
  ('00000000-0000-4000-8000-00000000010d', 'Orgemont', true, 'Haut-Roi d''Orgemont')
on conflict (id) do nothing;
