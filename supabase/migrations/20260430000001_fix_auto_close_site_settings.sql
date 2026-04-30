-- Migration: Fix auto_close_overdue_shifts RPC - filter correct site settings row
-- The previous query used LIMIT 1 without filter, picking up attendance events

CREATE OR REPLACE FUNCTION public.auto_close_overdue_shifts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_schedules JSONB;
    v_schedule JSONB;
    v_shift RECORD;
    v_r RECORD;
    v_now BIGINT;
    v_scheduled_close BIGINT;
    v_deadline BIGINT;
    v_end_time BIGINT;
    v_summary JSONB;
    v_starting_cash NUMERIC;
    v_cash_revenue NUMERIC;
    v_qris_revenue NUMERIC;
    v_total_revenue NUMERIC;
    v_total_expenses NUMERIC;
    v_ending_cash_expected NUMERIC;
    v_non_cash_expected NUMERIC;
    v_closed_count INT := 0;
    v_closed_ids TEXT[] := '{}';
    v_wib_offset_ms BIGINT := 25200000; -- 7 * 60 * 60 * 1000
    v_grace_period_ms BIGINT := 3600000; -- 1 * 60 * 60 * 1000
    v_close_hour INT;
    v_close_min INT;
    v_shift_wib TIMESTAMPTZ;
BEGIN
    v_now := extract(epoch from now())::bigint * 1000;

    -- Get shift schedules from site settings (filter for the actual settings row)
    SELECT raw->'shiftSettings'->'shiftSchedules' INTO v_schedules
    FROM public.pos_site_settings
    WHERE raw ? 'shiftSettings'
    LIMIT 1;

    IF v_schedules IS NULL OR jsonb_array_length(v_schedules) = 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'No schedules', 'closed', 0);
    END IF;

    -- Iterate over each active shift
    FOR v_shift IN
        SELECT source_id, shift_name, start_time, starting_cash, summary, raw
        FROM pos.shifts
        WHERE end_time IS NULL
    LOOP
        -- Find matching schedule
        FOR i IN 0..jsonb_array_length(v_schedules)-1 LOOP
            v_schedule := v_schedules->i;
            IF v_schedule->>'name' = v_shift.shift_name AND v_schedule->>'closeTime' IS NOT NULL THEN
                -- Parse closeTime (HH:mm)
                v_close_hour := (split_part(v_schedule->>'closeTime', ':', 1))::int;
                v_close_min := (split_part(v_schedule->>'closeTime', ':', 2))::int;

                -- Compute scheduled close epoch for the WIB day the shift started
                v_shift_wib := to_timestamp((v_shift.start_time + v_wib_offset_ms) / 1000.0) AT TIME ZONE 'UTC';
                v_scheduled_close := extract(epoch from
                    make_date(
                        extract(year from v_shift_wib)::int,
                        extract(month from v_shift_wib)::int,
                        extract(day from v_shift_wib)::int
                    ) + make_time(v_close_hour - 7, v_close_min, 0)
                )::bigint * 1000;

                v_deadline := v_scheduled_close + v_grace_period_ms;

                IF v_now >= v_deadline THEN
                    v_end_time := v_deadline;

                    -- Calculate revenue from financial transactions
                    v_starting_cash := COALESCE(v_shift.starting_cash, 0);
                    v_cash_revenue := 0;
                    v_qris_revenue := 0;
                    v_total_revenue := 0;
                    v_total_expenses := 0;

                    FOR v_r IN
                        SELECT tx_type, amount, category, payment_method
                        FROM pos.financial_transactions
                        WHERE tx_date >= v_shift.start_time
                          AND tx_date <= v_end_time
                          AND status = 'completed'
                    LOOP
                        IF v_r.tx_type = 'income' THEN
                            IF v_r.category NOT IN ('Modal Awal', 'Setoran Akhir') THEN
                                v_total_revenue := v_total_revenue + COALESCE(v_r.amount, 0);
                                IF lower(v_r.payment_method) IN ('cash', 'tunai') THEN
                                    v_cash_revenue := v_cash_revenue + COALESCE(v_r.amount, 0);
                                ELSE
                                    v_qris_revenue := v_qris_revenue + COALESCE(v_r.amount, 0);
                                END IF;
                            END IF;
                        ELSE
                            v_total_expenses := v_total_expenses + COALESCE(v_r.amount, 0);
                        END IF;
                    END LOOP;

                    v_ending_cash_expected := v_starting_cash + v_cash_revenue - v_total_expenses;
                    v_non_cash_expected := v_qris_revenue;

                    v_summary := jsonb_build_object(
                        'totalRevenue', v_total_revenue,
                        'totalExpenses', v_total_expenses,
                        'totalItemsSold', COALESCE((v_shift.summary->>'totalItemsSold')::int, 0),
                        'cashRevenue', v_cash_revenue,
                        'qrisRevenue', v_qris_revenue,
                        'totalDiscount', COALESCE((v_shift.summary->>'totalDiscount')::int, 0)
                    );

                    -- Update the shift
                    UPDATE pos.shifts SET
                        end_time = v_end_time,
                        ending_cash_expected = v_ending_cash_expected,
                        ending_cash_physical = 0,
                        non_cash_expected = v_non_cash_expected,
                        non_cash_confirmed = 0,
                        summary = v_summary,
                        raw = COALESCE(v_shift.raw, '{}'::jsonb) ||
                             jsonb_build_object(
                                'auto_closed', true,
                                'auto_closed_at', v_now,
                                'auto_close_reason', format('Shift "%s" ditutup otomatis: melewati jadwal %s WIB + 1 jam grace period.', v_shift.shift_name, v_schedule->>'closeTime')
                             )
                    WHERE source_id = v_shift.source_id;

                    v_closed_count := v_closed_count + 1;
                    v_closed_ids := array_append(v_closed_ids, v_shift.source_id);
                END IF;
            END IF;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'closed', v_closed_count,
        'closedShiftIds', v_closed_ids,
        'checkedAt', now()::text
    );
END;
$$;
