begin;

-- The product image bucket is now served from the self-hosted Supabase domain.
-- Keep existing public paths, but remove hosts that are no longer reachable.
update pos.products
set image = replace(image, 'https://supabase.yumme.id', 'https://supabase.djiwatentram.web.id')
where image like 'https://supabase.yumme.id/%';

update pos.products
set image = replace(image, 'https://xaemykhjpkgypqqpfdcb.supabase.co', 'https://supabase.djiwatentram.web.id')
where image like 'https://xaemykhjpkgypqqpfdcb.supabase.co/%';

-- A few migrated rows retained only their Convex storage key. Restore their
-- deterministic migrated object path using the product source id.
update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7bbyx9y9r3v2w7cwnebxp2rs82rq6z-image.jpg'
where source_id = 'jh7bbyx9y9r3v2w7cwnebxp2rs82rq6z'
  and image = 'kg21g2c6an79p9yq7z4x8ge1vn82sek9';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh7067m9wb2fvw1z5e2910kt9982rqwp-image.jpg'
where source_id = 'jh7067m9wb2fvw1z5e2910kt9982rqwp'
  and image = 'kg20d967an2s914hrn6sw3q0z582rsxr';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh78was5ztnpraj0sg5ackvch182rymw-image.jpg'
where source_id = 'jh78was5ztnpraj0sg5ackvch182rymw'
  and image = 'kg2fb0wcapesj6er50am4brxyn82rq0w';

update pos.products
set image = 'https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/jh700tvgtf2tbznded3xqpkmx982svjd-image.jpg'
where source_id = 'jh700tvgtf2tbznded3xqpkmx982svjd'
  and image = 'kg27q5bn2a6322kmtf5aqxgpg182sgnc';

commit;
