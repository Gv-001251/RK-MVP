/** Items expiring within this many days are flagged "expiring soon". */
export const EXPIRY_SOON_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Shape a lab_inventory row into the object the UI consumes, with derived
 * low-stock / expiry alert flags. Column mapping:
 *   stock_qty            -> currentStock
 *   low_stock_threshold  -> minimumStock
 *   location             -> storageLocation
 *   batch_number         -> lotNumber
 */
export function shapeInventoryItem(r, now = Date.now()) {
  const current = Number(r.stock_qty) || 0;
  const minimum = Number(r.low_stock_threshold) || 0;
  const cost = Number(r.cost_per_unit) || 0;

  let daysToExpiry = null;
  let expired = false;
  let expiringSoon = false;
  if (r.expiry_date) {
    const exp = new Date(r.expiry_date).getTime();
    if (!Number.isNaN(exp)) {
      daysToExpiry = Math.floor((exp - now) / DAY_MS);
      expired = daysToExpiry < 0;
      expiringSoon = !expired && daysToExpiry <= EXPIRY_SOON_DAYS;
    }
  }

  return {
    id: r.id,
    name: r.name,
    category: r.category,
    unit: r.unit,
    currentStock: current,
    minimumStock: minimum,
    lotNumber: r.batch_number || null,
    vendor: r.vendor || null,
    storageLocation: r.location || null,
    analyzerId: r.analyzer_id || null,
    expiryDate: r.expiry_date || null,
    costPerUnit: cost,
    consumePerTest: Number(r.consume_per_test) || 0,
    stockValue: Number((current * cost).toFixed(2)),
    notes: r.notes || null,
    lastMovementAt: r.last_movement_at || null,
    updatedAt: r.updated_at || null,
    // derived alert flags
    low: minimum > 0 ? current <= minimum : false,
    outOfStock: current <= 0,
    daysToExpiry,
    expired,
    expiringSoon,
  };
}
