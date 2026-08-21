-- Booking type and event options are database-managed configuration.
-- ROLLBACK: UPDATE pos.booking_settings SET raw = raw - 'bookingTypes' - 'eventTypes' WHERE slug = 'booking';
-- The custom field id/labels can be restored from the pre-migration backup if needed.

UPDATE pos.booking_settings
SET
  raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
    'bookingTypes', jsonb_build_array(
      jsonb_build_object(
        'key', 'group_meal',
        'label', 'Makan bersama',
        'description', 'Keluarga, teman, atau rekan kerja',
        'icon', 'users',
        'sortOrder', 1,
        'isActive', true
      ),
      jsonb_build_object(
        'key', 'event',
        'label', 'Acara / event',
        'description', 'Pernikahan, arisan, kampus, kolaborasi, dan lainnya',
        'icon', 'calendar-heart',
        'sortOrder', 2,
        'isActive', true
      )
    ),
    'eventTypes', jsonb_build_array(
      jsonb_build_object('key', 'wedding', 'label', 'Pernikahan', 'description', 'Acara pernikahan dan resepsi', 'icon', 'heart-handshake', 'sortOrder', 1, 'isActive', true, 'requiresCustomText', false),
      jsonb_build_object('key', 'gathering', 'label', 'Arisan', 'description', 'Acara kumpul bersama komunitas atau keluarga', 'icon', 'users-round', 'sortOrder', 2, 'isActive', true, 'requiresCustomText', false),
      jsonb_build_object('key', 'student', 'label', 'Acara mahasiswa', 'description', 'Acara organisasi atau komunitas mahasiswa', 'icon', 'graduation-cap', 'sortOrder', 3, 'isActive', true, 'requiresCustomText', false),
      jsonb_build_object('key', 'collaboration', 'label', 'Acara kolaborasi', 'description', 'Acara bersama partner atau komunitas', 'icon', 'handshake', 'sortOrder', 4, 'isActive', true, 'requiresCustomText', false),
      jsonb_build_object('key', 'other', 'label', 'Lainnya', 'description', 'Jenis acara lain', 'icon', 'sparkles', 'sortOrder', 5, 'isActive', true, 'requiresCustomText', true)
    )
  ),
  custom_fields = coalesce(
    (
      SELECT jsonb_agg(
        CASE
          WHEN field->>'label' = 'Reservasi Event' OR field->>'id' = 'gz5e8bbec' THEN
            field || jsonb_build_object(
              'id', 'booking_event_type',
              'label', 'Jenis acara tambahan',
              'isBookingEventOption', true,
              'options', jsonb_build_array('Pernikahan', 'Arisan', 'Acara mahasiswa', 'Acara kolaborasi', 'Lainnya')
            )
          ELSE field
        END
      )
      FROM jsonb_array_elements(coalesce(custom_fields, '[]'::jsonb)) AS field
    ),
    '[]'::jsonb
  )
WHERE slug = 'booking';

NOTIFY pgrst, 'reload schema';
