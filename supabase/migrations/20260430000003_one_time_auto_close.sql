-- Migration: Replace recurring pg_cron with one-time per-shift auto-close
-- When a shift is started, a trigger schedules exactly ONE auto-close at deadline (closeTime + 1h)

-- 1. Remove the old recurring schedule
SELECT cron.unschedule('auto-close-overdue-shifts');

-- 2. Function to auto-close a single shift (extracted from auto_close_overdue_shifts)
CREATE OR REPLACE FUNCTION public.auto_close_single_shift(p_source_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift RECORD;
    v_r RECORD;
    v_now BIGINT;
    v_end_time BIGINT;
    v_summary JSONB;
    v_starting_cash NUMERIC;
    v_cash_revenue NUMERIC := 0;
    v_qris_revenue NUMERIC := 0;
    v_total_revenue NUMERIC := 0;
    v_total_expenses NUMERIC := 0;
    v_ending_cash_expected NUMERIC;
    v_non_cash_expected NUMERIC;
BEGIN
    -- Look up the shift
    SELECT source_id, shift_name, start_time, starting_cash, summary, raw
    INTO v_shift
    FROM pos.shifts
    WHERE source_id = p_source_id AND end_time IS NULL;

    IF NOT FOUND THEN
        RETURN; -- Shift not found or already closed
    END IF;

    v_now := extract(epoch from now())::bigint * 1000;
    v_end_time := v_now;

    v_starting_cash := COALESCE(v_shift.starting_cash, 0);

    -- Calculate revenue from financial transactions
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
                'auto_close_reason', 'Shift ditutup otomatis: melewati jadwal + 1 jam grace period.'
             )
    WHERE source_id = p_source_id;

    -- Clean up this one-time cron job (best effort)
    BEGIN
        PERFORM cron.unschedule('auto-close-' || p_source_id);
    EXCEPTION WHEN OTHERS THEN
        -- Silently ignore
    END;
END;
$$;

-- 3. Trigger function to schedule auto-close when shift starts
CREATE OR REPLACE FUNCTION public.schedule_shift_auto_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_schedules JSONB;
    v_schedule JSONB;
    v_close_hour INT;
    v_close_min INT;
    v_deadline_utc TIMESTAMPTZ;
    v_shift_wib TIMESTAMPTZ;
    v_wib_offset_ms BIGINT := 25200000; -- 7 hours
    v_grace_period_ms BIGINT := 3600000; -- 1 hour
    v_job_name TEXT;
    v_cron_expr TEXT;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- Get shift schedules from site settings
    SELECT raw->'shiftSettings'->'shiftSchedules' INTO v_schedules
    FROM public.pos_site_settings
    WHERE raw ? 'shiftSettings'
    LIMIT 1;

    IF v_schedules IS NULL OR jsonb_array_length(v_schedules) = 0 THEN
        RETURN NEW;
    END IF;

    -- Find matching schedule
    FOR i IN 0..jsonb_array_length(v_schedules)-1 LOOP
        v_schedule := v_schedules->i;
        IF v_schedule->>'name' = NEW.shift_name AND v_schedule->>'closeTime' IS NOT NULL THEN
            -- Parse closeTime (HH:mm) in WIB
            v_close_hour := (split_part(v_schedule->>'closeTime', ':', 1))::int;
            v_close_min := (split_part(v_schedule->>'closeTime', ':', 2))::int;

            -- Compute deadline in UTC
            -- start_time is in epoch ms. Convert to WIB date, add closeTime + grace, convert to UTC
            v_shift_wib := to_timestamp((NEW.start_time + v_wib_offset_ms) / 1000.0);

            v_deadline_utc := (
                make_date(
                    extract(year from v_shift_wib)::int,
                    extract(month from v_shift_wib)::int,
                    extract(day from v_shift_wib)::int
                ) + make_time(v_close_hour, v_close_min, 0) +
                make_interval(secs => v_grace_period_ms / 1000.0)
            ) AT TIME ZONE 'Asia/Jakarta' AT TIME ZONE 'UTC';

            -- Build cron expression (minute hour day month *)
            v_cron_expr := format(
                '%s %s %s %s *',
                extract(minute from v_deadline_utc)::int,
                extract(hour from v_deadline_utc)::int,
                extract(day from v_deadline_utc)::int,
                extract(month from v_deadline_utc)::int
            );

            v_job_name := 'auto-close-' || NEW.source_id;

            -- Schedule one-time cron job
            PERFORM cron.schedule(
                v_job_name,
                v_cron_expr,
                format('SELECT public.auto_close_single_shift(%L);', NEW.source_id)
            );

            EXIT; -- Only schedule once per shift
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

-- 4. Create trigger on pos.shifts
DROP TRIGGER IF EXISTS trg_schedule_shift_auto_close ON pos.shifts;
CREATE TRIGGER trg_schedule_shift_auto_close
AFTER INSERT ON pos.shifts
FOR EACH ROW
EXECUTE FUNCTION public.schedule_shift_auto_close();
