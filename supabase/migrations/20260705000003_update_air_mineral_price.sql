-- Update harga Air Mineral dari Rp 5.000 ke Rp 8.000
UPDATE pos.products
SET price = 8000
WHERE source_id = 'jh79aq4sppnwrqg9d2fx09g4vh83crjf'
  AND name = 'Air Mineral';
