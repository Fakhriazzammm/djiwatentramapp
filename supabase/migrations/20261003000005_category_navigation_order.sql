-- Keep category navigation order authoritative in pos.categories.
-- Product menu numbers remain unchanged; this only updates category ordering.
BEGIN;

UPDATE pos.categories
SET display_order = CASE source_id
  WHEN 'k576ckmc361xk05hex2cqvp0v183yt72' THEN 10 -- Makanan
  WHEN 'k576h1f9q4sr1hc5dnywcf2jrx83y1y0' THEN 11 -- Minuman
  WHEN 'k5777acdgtv15nm2tfp4j1fpv984zcqq' THEN 12 -- Event
  WHEN 'k5791p5tbg4h4dj5s23b2wmsd98564ga' THEN 13 -- Promo
  WHEN 'kpuq415ydimrj6aow5c1qdmv8tkrz07e' THEN 14 -- Merchandise
  WHEN 'cat_b2b' THEN 15 -- B2B
  WHEN 'k575xay7t470a98qk9kwcm72p9821wn7' THEN 1 -- Bubur
  WHEN 'k579tm0d43yzyaze0ztcpgy0fn821k6f' THEN 2 -- Nasi
  WHEN 'k574x7t7nteh9bf7t77w7yf3t18213ae' THEN 3 -- Mie
  WHEN 'k57b0dgnv4q4yq3skynagzbdjs821vq0' THEN 4 -- Cemilan
  WHEN 'k57bq4a2a4s64e80b2a6eryg8s821kwq' THEN 5 -- Rame-Rame
  WHEN 'k57dxkz808shafk061yc5ht33n820ta8' THEN 6 -- Pastry
  WHEN 'k5715cnafth2q8tw5txjjy6yb5821m2s' THEN 1 -- Milk Based
  WHEN 'k574n0dqzcxfpgxt1emkxmbtt18204s1' THEN 2 -- Refreshment
  WHEN 'k579yby1fa9s9fpqdbhreectx5821b2b' THEN 3 -- Kopi
  WHEN 'cat_b2b_produksi' THEN 1 -- Produksi
  ELSE display_order
END
WHERE source_id IN (
  'k576ckmc361xk05hex2cqvp0v183yt72', 'k576h1f9q4sr1hc5dnywcf2jrx83y1y0',
  'k5777acdgtv15nm2tfp4j1fpv984zcqq', 'k5791p5tbg4h4dj5s23b2wmsd98564ga',
  'kpuq415ydimrj6aow5c1qdmv8tkrz07e', 'cat_b2b', 'k575xay7t470a98qk9kwcm72p9821wn7',
  'k579tm0d43yzyaze0ztcpgy0fn821k6f', 'k574x7t7nteh9bf7t77w7yf3t18213ae',
  'k57b0dgnv4q4yq3skynagzbdjs821vq0', 'k57bq4a2a4s64e80b2a6eryg8s821kwq',
  'k57dxkz808shafk061yc5ht33n820ta8', 'k5715cnafth2q8tw5txjjy6yb5821m2s',
  'k574n0dqzcxfpgxt1emkxmbtt18204s1', 'k579yby1fa9s9fpqdbhreectx5821b2b',
  'cat_b2b_produksi'
);

COMMIT;
