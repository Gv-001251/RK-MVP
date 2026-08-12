import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql/db';
import { broadcastRealtimeEvent } from '@/lib/realtime-registry';
import { shapeInventoryItem } from '@/lib/inventory-util';

/**
 * Automatic reagent consumption.
 *
 * When an analyzer produces results, draw down every inventory item linked to
 * that analyzer that has consume_per_test > 0, by consume_per_test * testCount.
 * Records a 'consume' ledger entry and broadcasts the update (+ a low-stock
 * signal when a draw-down crosses the minimum).
 *
 * Best-effort: layered on top of result ingestion, it must NEVER throw.
 */
export async function consumeForAnalyzer({ analyzerId, testCount = 1, actor = 'Analyzer', reference } = {}) {
  try {
    if (!analyzerId || !testCount || testCount <= 0) return [];

    const items = await query(
      'SELECT * FROM lab_inventory WHERE analyzer_id = ? AND consume_per_test > 0',
      [analyzerId]
    );
    const updated = [];

    for (const it of items) {
      const perTest = Number(it.consume_per_test) || 0;
      const amount = perTest * testCount;
      if (amount <= 0) continue;

      const current = Number(it.stock_qty) || 0;
      const next = Math.max(0, Number((current - amount).toFixed(3)));
      const change = Number((next - current).toFixed(3)); // <= 0
      if (change === 0) continue;

      await query('UPDATE lab_inventory SET stock_qty = ?, last_movement_at = NOW(), updated_at = NOW() WHERE id = ?', [next, it.id]);
      await query(
        `INSERT INTO lab_inventory_txns (id, item_id, type, change_qty, balance_after, reason, lot_number, reference, performed_by)
         VALUES (?, ?, 'consume', ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), it.id, change, next, `Auto-consumed for ${testCount} test(s)`, it.batch_number || null, reference || analyzerId, actor]
      );

      const shaped = shapeInventoryItem({ ...it, stock_qty: next });
      updated.push(shaped);
      broadcastRealtimeEvent('INVENTORY_UPDATED', shaped);
      if (shaped.low || shaped.outOfStock) {
        broadcastRealtimeEvent('INVENTORY_LOW', {
          id: it.id, name: it.name, currentStock: next, minimumStock: shaped.minimumStock,
        });
      }
    }
    return updated;
  } catch (err) {
    console.error('consumeForAnalyzer failed (best-effort):', err.message);
    return [];
  }
}
