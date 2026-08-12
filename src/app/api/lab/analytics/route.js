import { query } from '@/lib/mysql/db';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';

/** Run a query, returning a fallback on any error (e.g. table not yet migrated). */
async function many(sql, params = []) { try { return await query(sql, params); } catch { return []; } }
async function scalar(sql, params = [], key = 'v', fallback = 0) {
  try { const rows = await query(sql, params); return rows.length ? (Number(rows[0][key]) || 0) : fallback; }
  catch { return fallback; }
}
function ymd(d) { const x = new Date(d); return Number.isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10); }

/**
 * GET /api/lab/analytics — laboratory analytics for the dashboard.
 * Returns KPIs, a 14-day trend, top tests, analyzer utilization, monthly
 * growth, and rejection breakdown. Each section is best-effort so a missing
 * table degrades gracefully to zeros instead of failing the whole payload.
 */
export async function GET() {
  try {
    const { response } = await requireAuth(...ROLES.ANALYTICS_READ);
    if (response) return response;

    // ── KPIs (today, except TAT/utilization which use a stable window) ──
    const [dailyPatients, dailySamples, dailyRevenue, rejectedSamples, criticalResults, avgTat, pendingVerification] = await Promise.all([
      scalar("SELECT COUNT(DISTINCT patient_id) AS v FROM lab_orders WHERE DATE(created_at) = CURDATE()"),
      scalar("SELECT COUNT(*) AS v FROM lab_orders WHERE DATE(created_at) = CURDATE()"),
      scalar("SELECT COALESCE(SUM(total_charges),0) AS v FROM lab_orders WHERE DATE(created_at) = CURDATE()"),
      scalar("SELECT COUNT(*) AS v FROM lab_samples WHERE rejected = 1 AND DATE(COALESCE(rejected_at, updated_at)) = CURDATE()"),
      scalar("SELECT COUNT(*) AS v FROM lab_critical_alerts WHERE DATE(detected_at) = CURDATE()"),
      scalar("SELECT AVG(TIMESTAMPDIFF(MINUTE, COALESCE(order_time, created_at), report_generated_at)) AS v FROM lab_orders WHERE report_generated_at IS NOT NULL AND report_generated_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)"),
      scalar("SELECT COUNT(*) AS v FROM lab_orders WHERE status IN ('Pending Verification','Technician Review','Senior Review')"),
    ]);

    // Analyzer utilization: active / total + per-analyzer tests today.
    const analyzerRows = await many(
      `SELECT c.id, c.name, c.status,
              (SELECT COUNT(*) FROM lab_task_tests tt WHERE tt.machine_name = c.id AND DATE(tt.completed_at) = CURDATE()) AS tests
         FROM analyzer_connections c ORDER BY tests DESC, c.name ASC`
    );
    const totalAnalyzers = analyzerRows.length;
    const activeAnalyzers = analyzerRows.filter(a => a.status === 'active' || a.status === 'online').length;
    const analyzerUtilizationPct = totalAnalyzers ? Math.round((activeAnalyzers / totalAnalyzers) * 100) : 0;
    const analyzerUtilization = analyzerRows.map(a => ({ analyzer: a.name || a.id, tests: Number(a.tests) || 0, status: a.status }));

    // ── 14-day trend ──
    const seriesRows = await many(
      `SELECT DATE(created_at) AS d, COUNT(DISTINCT patient_id) AS patients, COUNT(*) AS samples, COALESCE(SUM(total_charges),0) AS revenue
         FROM lab_orders WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
        GROUP BY DATE(created_at)`
    );
    const seriesMap = {};
    for (const r of seriesRows) { const k = ymd(r.d); if (k) seriesMap[k] = r; }
    const dailySeries = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      const row = seriesMap[key];
      dailySeries.push({
        date: key.slice(5),
        patients: Number(row?.patients) || 0,
        samples: Number(row?.samples) || 0,
        revenue: Number(row?.revenue) || 0,
      });
    }

    // ── Top ordered tests (last 30 days) ──
    const topRows = await many(
      `SELECT t.test_name AS name, COUNT(*) AS count
         FROM lab_order_tests t JOIN lab_orders o ON o.id = t.lab_order_id
        WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY t.test_name ORDER BY count DESC LIMIT 10`
    );
    const topTests = topRows.map(r => ({ name: r.name, count: Number(r.count) || 0 }));

    // ── Monthly growth (last 12 months) ──
    const monthRows = await many(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS orders, COALESCE(SUM(total_charges),0) AS revenue
         FROM lab_orders WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
        GROUP BY month ORDER BY month ASC`
    );
    const monthlyGrowth = monthRows.map(r => ({ month: r.month, orders: Number(r.orders) || 0, revenue: Number(r.revenue) || 0 }));

    // Month-on-month, compared like for like. Taking this month's total against
    // the whole of last month makes the figure collapse in the first days of
    // every month, so both sides use the same number of elapsed days.
    const [monthToDate, previousSameWindow] = await Promise.all([
      scalar("SELECT COUNT(*) AS v FROM lab_orders WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')"),
      scalar(
        `SELECT COUNT(*) AS v FROM lab_orders
          WHERE created_at >= DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01')
            AND created_at <  DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01') + INTERVAL DAY(CURDATE()) DAY`
      ),
    ]);
    const growthPct = previousSameWindow > 0
      ? Math.round(((monthToDate - previousSameWindow) / previousSameWindow) * 100)
      : (monthToDate > 0 ? 100 : 0);

    // ── Rejection breakdown (last 90 days) ──
    const rejRows = await many(
      `SELECT COALESCE(rejection_reason, 'Unspecified') AS reason, COUNT(*) AS count
         FROM lab_samples WHERE rejected = 1 AND COALESCE(rejected_at, updated_at) >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        GROUP BY rejection_reason ORDER BY count DESC`
    );
    const rejectionBreakdown = rejRows.map(r => ({ reason: r.reason, count: Number(r.count) || 0 }));

    return Response.json({
      generatedAt: new Date().toISOString(),
      kpis: {
        dailyPatients, dailySamples, dailyRevenue, rejectedSamples, criticalResults,
        avgTatMinutes: Math.round(avgTat) || 0,
        analyzerUtilizationPct, activeAnalyzers, totalAnalyzers,
        pendingVerification,
        monthlyGrowthPct: growthPct,
        // The two sides of the growth comparison, for tooltips/labels.
        monthToDateOrders: monthToDate,
        previousMonthSameWindowOrders: previousSameWindow,
      },
      dailySeries,
      topTests,
      analyzerUtilization,
      monthlyGrowth,
      rejectionBreakdown,
    });
  } catch (err) {
    console.error('analytics error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
