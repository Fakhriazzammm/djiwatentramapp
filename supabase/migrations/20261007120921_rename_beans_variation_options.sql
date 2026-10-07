-- Rename the two Beans options without changing prices or any other variation group.
-- Safe to re-run: accepts either the old or already-renamed option names.
DO $migration$
DECLARE
	target record;
	product_row record;
	beans_group jsonb;
	option_count integer;
	regular_count integer;
	seasonal_count integer;
	updated_variations jsonb;
BEGIN
	FOR target IN
		SELECT * FROM (VALUES
			('jh7dw5jxkpcabew93bbnm3g48n820ryq', 'Americano Long Black'),
			('jh76mkavjwsd5x46pd990m3af1820g4g', 'White / Latte / Magic')
		) AS targets(source_id, expected_name)
	LOOP
		SELECT source_id, name, variations
		INTO product_row
		FROM pos.products
		WHERE source_id = target.source_id
		FOR UPDATE;

		IF NOT FOUND THEN
			RAISE EXCEPTION 'Expected product % (%) was not found', target.expected_name, target.source_id;
		END IF;
		IF product_row.name IS DISTINCT FROM target.expected_name THEN
			RAISE EXCEPTION 'Product ID % now belongs to %, expected %', target.source_id, product_row.name, target.expected_name;
		END IF;
		IF jsonb_typeof(product_row.variations) IS DISTINCT FROM 'array' THEN
			RAISE EXCEPTION 'Product % has a non-array variations value', product_row.name;
		END IF;

		IF (
			SELECT count(*)
			FROM jsonb_array_elements(product_row.variations) AS item
			WHERE lower(btrim(item->>'name')) = 'beans'
		) <> 1 THEN
			RAISE EXCEPTION 'Product % must have exactly one Beans variation group', product_row.name;
		END IF;

		SELECT item INTO beans_group
		FROM jsonb_array_elements(product_row.variations) AS item
		WHERE lower(btrim(item->>'name')) = 'beans';
		IF jsonb_typeof(beans_group->'options') IS DISTINCT FROM 'array' THEN
			RAISE EXCEPTION 'Product % Beans options are not an array', product_row.name;
		END IF;

		SELECT count(*) INTO option_count
		FROM jsonb_array_elements(beans_group->'options') AS option_item;
		SELECT count(*) INTO regular_count
		FROM jsonb_array_elements(beans_group->'options') AS option_item
		WHERE option_item->>'name' IN ('Regular Beans', 'Regular')
		  AND (option_item->>'price')::numeric = 0;
		SELECT count(*) INTO seasonal_count
		FROM jsonb_array_elements(beans_group->'options') AS option_item
		WHERE option_item->>'name' IN ('Seasonal Beans', 'Seasonal')
		  AND (option_item->>'price')::numeric = 5000;

		IF option_count <> 2 OR regular_count <> 1 OR seasonal_count <> 1 THEN
			RAISE EXCEPTION 'Product % Beans options differ from expected labels/prices; refusing update', product_row.name;
		END IF;

		SELECT jsonb_agg(
			CASE
				WHEN lower(btrim(group_item.value->>'name')) = 'beans' THEN
					jsonb_set(
						group_item.value,
						'{options}',
						(
							SELECT jsonb_agg(
								CASE option_item.value->>'name'
									WHEN 'Regular Beans' THEN jsonb_set(option_item.value, '{name}', to_jsonb('Regular'::text), false)
									WHEN 'Seasonal Beans' THEN jsonb_set(option_item.value, '{name}', to_jsonb('Seasonal'::text), false)
									ELSE option_item.value
								END
								ORDER BY option_item.ordinality
							)
							FROM jsonb_array_elements(group_item.value->'options') WITH ORDINALITY AS option_item(value, ordinality)
						),
						true
					)
				ELSE group_item.value
			END
			ORDER BY group_item.ordinality
		)
		INTO updated_variations
		FROM jsonb_array_elements(product_row.variations) WITH ORDINALITY AS group_item(value, ordinality);

		UPDATE pos.products
		SET variations = updated_variations
		WHERE source_id = target.source_id;
	END LOOP;
END
$migration$;
