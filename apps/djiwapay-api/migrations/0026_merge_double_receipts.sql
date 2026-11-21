-- A shop's receipt that waited for a decision although the bank's notice for the same payment was already recorded.
update finance.inbound_messages m set status = 'duplicate', reason = 'already-recorded', entry_id = e.id
from finance.entries e
where m.status = 'review' and coalesce(m.parsed->>'generic','false') = 'true' and m.entry_id is null
  and e.user_id = m.user_id and e.amount = (m.parsed->>'amount')::numeric and e.kind <> 'tf'
  and ((m.occurred_at at time zone 'Asia/Jakarta')::time = '00:00'
        and (e.at at time zone 'Asia/Jakarta')::date = (m.occurred_at at time zone 'Asia/Jakarta')::date
       or e.at between m.occurred_at - interval '10 minutes' and m.occurred_at + interval '10 minutes');
