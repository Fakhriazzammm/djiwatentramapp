-- "Lainnya" rules and sure "Lainnya" cache rows kept the Rapikan button from ever asking the model.
delete from finance.merchant_rules where category_id = 'lainnya';
update finance.ai_category_cache set confidence = least(confidence, 0.5) where category_id = 'lainnya';
