-- Preserve database-managed booking/event options when Admin updates other settings.
-- ROLLBACK: restore the previous pos.admin_upsert_booking_settings definition.

CREATE OR REPLACE FUNCTION pos.admin_upsert_booking_settings(p_payload jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pos,public,pg_catalog
AS $$
DECLARE
  v_id text;
  v_slug text := nullif(trim(p_payload->>'slug'),'');
  v_raw jsonb;
BEGIN
  IF v_slug IS NULL THEN
    RAISE EXCEPTION USING errcode='22023', message='slug is required';
  END IF;

  SELECT source_id INTO v_id FROM pos.booking_settings WHERE slug=v_slug FOR UPDATE;
  IF v_id IS NULL THEN
    v_id := 'booking_settings_' || replace(gen_random_uuid()::text,'-','');
  END IF;

  SELECT coalesce(raw, '{}'::jsonb) || coalesce(p_payload, '{}'::jsonb)
    INTO v_raw
  FROM pos.booking_settings
  WHERE slug = v_slug;
  v_raw := coalesce(v_raw, p_payload, '{}'::jsonb);

  INSERT INTO pos.booking_settings(
    source_id,slug,title,description,logo_url,banner_url,theme_color,social_links,
    featured_product_ids,payment_methods,bank_details,qris_image,is_active,
    booking_window_days,default_max_people,default_max_tables,default_people_per_table,
    custom_fields,creation_time,raw
  ) VALUES (
    v_id,v_slug,coalesce(p_payload->>'title',''),p_payload->>'description',
    p_payload->>'logoUrl',p_payload->>'bannerUrl',p_payload->>'themeColor',
    p_payload->'socialLinks',p_payload->'featuredProductIds',p_payload->'paymentMethods',
    p_payload->>'bankDetails',p_payload->>'qrisImage',
    coalesce((p_payload->>'isActive')::boolean,false),
    greatest(1,coalesce((p_payload->>'bookingWindowDays')::integer,90)),
    greatest(0,coalesce((p_payload->>'defaultMaxPeople')::integer,100)),
    greatest(0,coalesce((p_payload->>'defaultMaxTables')::integer,25)),
    greatest(1,coalesce((p_payload->>'defaultPeoplePerTable')::integer,4)),
    p_payload->'customFields',extract(epoch from now())*1000,v_raw
  )
  ON CONFLICT(source_id) DO UPDATE SET
    title=excluded.title, description=excluded.description, logo_url=excluded.logo_url,
    banner_url=excluded.banner_url, theme_color=excluded.theme_color,
    social_links=excluded.social_links, featured_product_ids=excluded.featured_product_ids,
    payment_methods=excluded.payment_methods, bank_details=excluded.bank_details,
    qris_image=excluded.qris_image, is_active=excluded.is_active,
    booking_window_days=excluded.booking_window_days, default_max_people=excluded.default_max_people,
    default_max_tables=excluded.default_max_tables,
    default_people_per_table=excluded.default_people_per_table,
    custom_fields=excluded.custom_fields, raw=excluded.raw;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION pos.admin_upsert_booking_settings(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.admin_upsert_booking_settings(jsonb) TO service_role;
