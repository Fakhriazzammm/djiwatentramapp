-- Add draft estimates for inactive food products still shown as SOLD in the catalog.
-- This does not change availability or checkout behavior.

update pos.products as p
set nutrition = values.nutrition
from (
  values
    ('jh711p9tx3kmqanyq3esjb9x81821ktp', '{"caloriesKcal":330,"proteinG":18,"carbohydratesG":44,"fatG":9,"servingSize":"1 porsi","source":"name_and_image_estimate","confidence":"low","status":"draft","notes":"Perkiraan bubur ayam Chinese dengan charsiu; gramasi bubur, ayam, charsiu, minyak, dan topping belum ditimbang."}'::jsonb),
    ('jh760nzjscqhwz34v6mz3zt5vs82124a', '{"caloriesKcal":260,"proteinG":12,"carbohydratesG":42,"fatG":5,"servingSize":"1 porsi","source":"name_and_image_estimate","confidence":"low","status":"draft","notes":"Perkiraan bubur ayam polos; ukuran porsi dan topping aktual belum ditimbang."}'::jsonb),
    ('jh7cmnc38ewpr0rks9m9w358hx821180', '{"caloriesKcal":320,"proteinG":17,"carbohydratesG":48,"fatG":8,"servingSize":"1 porsi","source":"name_and_image_estimate","confidence":"low","status":"draft","notes":"Perkiraan bubur ayam khas Tasik; gramasi bubur, ayam, minyak, dan topping belum ditimbang."}'::jsonb),
    ('jh7d2k3e4yepnjg2gfcttpfgsd821x5c', '{"caloriesKcal":360,"proteinG":18,"carbohydratesG":50,"fatG":10,"servingSize":"1 porsi","source":"name_and_image_estimate","confidence":"low","status":"draft","notes":"Perkiraan bubur ayam Western; komposisi dan ukuran porsi aktual belum ditimbang."}'::jsonb)
) as values(source_id, nutrition)
where p.source_id = values.source_id
  and p.nutrition is null;

notify pgrst, 'reload schema';
