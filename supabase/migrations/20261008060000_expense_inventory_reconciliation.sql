-- Read-only reconciliation projection for expense-driven inventory.
-- It never mutates finance or inventory data.

CREATE OR REPLACE VIEW public.pos_expense_inventory_reconciliation AS
SELECT
  l.source_id AS "_id",
  l.financial_transaction_source_id AS "transactionId",
  l.expense_item_key AS "expenseItemKey",
  l.raw_name AS "rawName",
  l.inventory_source_id AS "inventoryId",
  l.quantity,
  l.unit,
  l.base_quantity AS "baseQuantity",
  l.base_unit AS "baseUnit",
  l.status,
  l.match_method AS "matchMethod",
  l.confidence,
  l.applied_movement_source_id AS "appliedMovementId",
  l.creation_time AS "creationTime",
  l.updated_at AS "updatedAt",
  i.ingredient_name AS "inventoryName",
  i.quantity AS "currentInventoryQuantity",
  m.quantity_base AS "movementQuantity",
  m.before_quantity AS "movementBeforeQuantity",
  m.after_quantity AS "movementAfterQuantity",
  m.creation_time AS "movementCreationTime",
  (l.status = 'applied' AND m.source_id IS NOT NULL) AS "isReconciled",
  CASE
    WHEN l.status = 'applied' AND m.source_id IS NULL THEN 'missing_movement'
    WHEN l.status <> 'applied' AND m.source_id IS NOT NULL THEN 'unexpected_movement'
    WHEN l.status = 'applied' AND m.source_id IS NOT NULL THEN 'reconciled'
    ELSE l.status
  END AS "reconciliationStatus"
FROM pos.expense_inventory_links l
LEFT JOIN pos.inventory i ON i.source_id = l.inventory_source_id
LEFT JOIN pos.inventory_movements m ON m.source_id = l.applied_movement_source_id;

GRANT SELECT ON public.pos_expense_inventory_reconciliation TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
