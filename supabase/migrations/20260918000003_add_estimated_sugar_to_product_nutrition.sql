-- Add estimated sugar grams to the existing additive nutrition JSON contract.
-- Values are draft estimates from menu name/photo plus public nutrition references;
-- they are not laboratory or recipe-grammage results.

update pos.products as p
set nutrition = jsonb_set(
  jsonb_set(p.nutrition, '{sugarG}', to_jsonb(values.sugar_g), true),
  '{source}', '"name_image_web_estimate"'::jsonb,
  true
)
from (
  values
    ('jh79aq4sppnwrqg9d2fx09g4vh83crjf', 0::numeric),
    ('jh7dw5jxkpcabew93bbnm3g48n820ryq', 0::numeric),
    ('jh7etpntrjzjkt0rdj1kbyjz0h821068', 20::numeric),
    ('jh711p9tx3kmqanyq3esjb9x81821ktp', 6::numeric),
    ('jh760nzjscqhwz34v6mz3zt5vs82124a', 3::numeric),
    ('jh7cmnc38ewpr0rks9m9w358hx821180', 5::numeric),
    ('jh7d2k3e4yepnjg2gfcttpfgsd821x5c', 8::numeric),
    ('jh77d5br9masynfvjycan8r7gx820c4w', 18::numeric),
    ('jh744hqha7qcwkf3jh55pfazk5820xgt', 22::numeric),
    ('jh70jkcz297h0tfwsp6pgxnq2d8207vn', 22::numeric),
    ('jh7866cbhj580vfwddbrb5z6tn8204da', 7::numeric),
    ('jh74abteh9g026rcgk0wxejbqn821yzj', 6::numeric),
    ('jh79g1g7rzf2fdr7zydrtvg0n9821g6e', 20::numeric),
    ('jh7d2qgyv0n04c4m0vhxyxsxjs820yae', 20::numeric),
    ('jh70t5x5b1x3nxpp3fgqrzsnfx8217g8', 8::numeric),
    ('jh77pmge4nmk8g58axpjw35nr5820js3', 10::numeric),
    ('jh718sbzfp53nn7a6hz7gjdp4s82166x', 8::numeric),
    ('jh7a0cvee95gv7h5z89k1bzrf9820zpv', 3::numeric),
    ('jh72azys9d3rw0pkndjs7ggann821r1q', 6::numeric),
    ('jh75w2ke5wcn9dypmyfgy9f7mn820nyp', 5::numeric),
    ('jh70bx1jakb3nabafjhe4twszh821x6n', 8::numeric),
    ('jh73b88wxvmar2cd1zapy00xa98207mn', 4::numeric),
    ('jh7fghge26tc733qy68r57cwcd821j9y', 20::numeric),
    ('jh75w5jga3g8em51h3b88adejx8203m2', 14::numeric),
    ('jh781b4cp8fbpe6x6k6tkxbqb58206b3', 18::numeric),
    ('jh76qvhkcvjwvzx9a4bp0z9n8h83yyzv', 75::numeric),
    ('jh72jnakyt67ypj4tmvex1ssy5820v76', 24::numeric),
    ('jh76mkavjwsd5x46pd990m3af1820g4g', 12::numeric),
    ('jh7cpech5e9b83b50qdq43fqm5821gfe', 8::numeric),
    ('price-rollout-yamin-hamburg-jepang-20260909', 8::numeric),
    ('jh77yb7v5yr7vtr0ka3jgk49gs821rv7', 6::numeric),
    ('jh7btjxm3xfsqh9rwg0ayqj051820za5', 7::numeric)
) as values(source_id, sugar_g)
where p.source_id = values.source_id
  and p.nutrition is not null
  and (p.nutrition->>'sugarG') is null;

notify pgrst, 'reload schema';
