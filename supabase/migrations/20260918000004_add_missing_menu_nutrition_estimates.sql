-- Add draft nutrition estimates for remaining food and beverage products.
-- Values are based on product names/descriptions/photos plus public nutrition analogues.
-- They are not laboratory results and must be replaced when recipe gram weights are available.

update pos.products as p
set nutrition = jsonb_build_object(
  'caloriesKcal', values.calories_kcal,
  'proteinG', values.protein_g,
  'carbohydratesG', values.carbohydrates_g,
  'fatG', values.fat_g,
  'sugarG', values.sugar_g,
  'servingSize', values.serving_size,
  'status', 'draft',
  'confidence', 'low',
  'source', 'name_image_web_estimate',
  'notes', values.notes
)
from (
  values
    ('jh7200gmm2m94dhqa1b647q9vx821fet', 80::numeric, 1::numeric, 20::numeric, 0::numeric, 18::numeric, '1 gelas', 'Perkiraan Peach Americano dengan sirup peach; takaran sirup aktual belum ditimbang.'),
    ('jh77ebfbjy10e56bhxn131tqgn820kcg', 5::numeric, 0::numeric, 1::numeric, 0::numeric, 0::numeric, '1 gelas', 'Perkiraan cold brew tanpa susu dan gula tambahan; konsentrat serta ukuran gelas aktual belum ditimbang.'),
    ('jh7aa0jp8dch2vb2rdgxz5txg1820gjt', 196::numeric, 3::numeric, 29::numeric, 8::numeric, 14::numeric, '1 potong', 'Perkiraan banana bread per potong sekitar 60 g; resep dan ukuran potong aktual belum ditimbang.'),
    ('jh7bbyx9y9r3v2w7cwnebxp2rs82rq6z', 650::numeric, 25::numeric, 78::numeric, 24::numeric, 5::numeric, '1 paket', 'Perkiraan nasi ayam kemangi dengan lauk ayam dan sambal; gramasi nasi, lauk, minyak, dan saus belum ditimbang.'),
    ('jh7067m9wb2fvw1z5e2910kt9982rqwp', 720::numeric, 25::numeric, 78::numeric, 30::numeric, 4::numeric, '1 paket', 'Perkiraan nasi ayam mentega; gramasi nasi, ayam, mentega, dan saus aktual belum ditimbang.'),
    ('jh78was5ztnpraj0sg5ackvch182rymw', 690::numeric, 24::numeric, 80::numeric, 27::numeric, 10::numeric, '1 paket', 'Perkiraan nasi ayam charsiu; gramasi nasi, charsiu, minyak, dan saus aktual belum ditimbang.'),
    ('jh700tvgtf2tbznded3xqpkmx982svjd', 760::numeric, 28::numeric, 82::numeric, 30::numeric, 8::numeric, '1 paket', 'Perkiraan nasi hamburg Jepang dengan patty dan saus; gramasi bahan aktual belum ditimbang.')
) as values(source_id, calories_kcal, protein_g, carbohydrates_g, fat_g, sugar_g, serving_size, notes)
where p.source_id = values.source_id
  and p.nutrition is null;

notify pgrst, 'reload schema';
