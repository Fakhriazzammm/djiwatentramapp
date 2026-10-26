-- 2026-09-06: Migrate 33 product image URLs from legacy Supabase Cloud (xaemykhjpkgypqqpfdcb)
-- to self-hosted Supabase Storage (supabase.djiwatentram.web.id / app-assets), binaries recovered from Convex originals.
-- Idempotent: only touches rows whose image still points at the legacy cloud origin.
begin;

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh70bx1jakb3nabafjhe4twszh821x6n-image.jpg'
where source_id = 'jh70bx1jakb3nabafjhe4twszh821x6n'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh70jkcz297h0tfwsp6pgxnq2d8207vn-image.jpg'
where source_id = 'jh70jkcz297h0tfwsp6pgxnq2d8207vn'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh70t5x5b1x3nxpp3fgqrzsnfx8217g8-image.jpg'
where source_id = 'jh70t5x5b1x3nxpp3fgqrzsnfx8217g8'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh711p9tx3kmqanyq3esjb9x81821ktp-image.jpg'
where source_id = 'jh711p9tx3kmqanyq3esjb9x81821ktp'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh718sbzfp53nn7a6hz7gjdp4s82166x-image.jpg'
where source_id = 'jh718sbzfp53nn7a6hz7gjdp4s82166x'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7200gmm2m94dhqa1b647q9vx821fet-image.jpg'
where source_id = 'jh7200gmm2m94dhqa1b647q9vx821fet'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh72azys9d3rw0pkndjs7ggann821r1q-image.jpg'
where source_id = 'jh72azys9d3rw0pkndjs7ggann821r1q'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh72jnakyt67ypj4tmvex1ssy5820v76-image.jpg'
where source_id = 'jh72jnakyt67ypj4tmvex1ssy5820v76'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh73b88wxvmar2cd1zapy00xa98207mn-image.jpg'
where source_id = 'jh73b88wxvmar2cd1zapy00xa98207mn'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh744hqha7qcwkf3jh55pfazk5820xgt-image.jpg'
where source_id = 'jh744hqha7qcwkf3jh55pfazk5820xgt'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh74abteh9g026rcgk0wxejbqn821yzj-image.jpg'
where source_id = 'jh74abteh9g026rcgk0wxejbqn821yzj'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh75w2ke5wcn9dypmyfgy9f7mn820nyp-image.jpg'
where source_id = 'jh75w2ke5wcn9dypmyfgy9f7mn820nyp'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh75w5jga3g8em51h3b88adejx8203m2-image.jpg'
where source_id = 'jh75w5jga3g8em51h3b88adejx8203m2'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh760nzjscqhwz34v6mz3zt5vs82124a-image.jpg'
where source_id = 'jh760nzjscqhwz34v6mz3zt5vs82124a'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh76mkavjwsd5x46pd990m3af1820g4g-image.jpg'
where source_id = 'jh76mkavjwsd5x46pd990m3af1820g4g'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh77d5br9masynfvjycan8r7gx820c4w-image.jpg'
where source_id = 'jh77d5br9masynfvjycan8r7gx820c4w'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh77ebfbjy10e56bhxn131tqgn820kcg-image.jpg'
where source_id = 'jh77ebfbjy10e56bhxn131tqgn820kcg'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh77pmge4nmk8g58axpjw35nr5820js3-image.jpg'
where source_id = 'jh77pmge4nmk8g58axpjw35nr5820js3'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh77yb7v5yr7vtr0ka3jgk49gs821rv7-image.jpg'
where source_id = 'jh77yb7v5yr7vtr0ka3jgk49gs821rv7'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh781b4cp8fbpe6x6k6tkxbqb58206b3-image.jpg'
where source_id = 'jh781b4cp8fbpe6x6k6tkxbqb58206b3'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7866cbhj580vfwddbrb5z6tn8204da-image.jpg'
where source_id = 'jh7866cbhj580vfwddbrb5z6tn8204da'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh79aq4sppnwrqg9d2fx09g4vh83crjf-image.jpg'
where source_id = 'jh79aq4sppnwrqg9d2fx09g4vh83crjf'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh79g1g7rzf2fdr7zydrtvg0n9821g6e-image.jpg'
where source_id = 'jh79g1g7rzf2fdr7zydrtvg0n9821g6e'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7a0cvee95gv7h5z89k1bzrf9820zpv-image.jpg'
where source_id = 'jh7a0cvee95gv7h5z89k1bzrf9820zpv'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7aa0jp8dch2vb2rdgxz5txg1820gjt-image.jpg'
where source_id = 'jh7aa0jp8dch2vb2rdgxz5txg1820gjt'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7btjxm3xfsqh9rwg0ayqj051820za5-image.jpg'
where source_id = 'jh7btjxm3xfsqh9rwg0ayqj051820za5'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7cmnc38ewpr0rks9m9w358hx821180-image.jpg'
where source_id = 'jh7cmnc38ewpr0rks9m9w358hx821180'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7cpech5e9b83b50qdq43fqm5821gfe-image.jpg'
where source_id = 'jh7cpech5e9b83b50qdq43fqm5821gfe'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7d2k3e4yepnjg2gfcttpfgsd821x5c-image.jpg'
where source_id = 'jh7d2k3e4yepnjg2gfcttpfgsd821x5c'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7d2qgyv0n04c4m0vhxyxsxjs820yae-image.png'
where source_id = 'jh7d2qgyv0n04c4m0vhxyxsxjs820yae'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7dw5jxkpcabew93bbnm3g48n820ryq-image.jpg'
where source_id = 'jh7dw5jxkpcabew93bbnm3g48n820ryq'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7etpntrjzjkt0rdj1kbyjz0h821068-image.jpg'
where source_id = 'jh7etpntrjzjkt0rdj1kbyjz0h821068'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7fghge26tc733qy68r57cwcd821j9y-image.jpg'
where source_id = 'jh7fghge26tc733qy68r57cwcd821j9y'
  and image like '%xaemykhjpkgypqqpfdcb.supabase.co%';

select count(*) as updated_rows
from pos.products
where image like 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/%';

commit;
