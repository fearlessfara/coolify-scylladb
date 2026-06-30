import { formatCapacityUnits } from "../utils.js";

export default function QueryMetrics({ metrics, mode }) {
  if (!metrics) return null;

  const rcu = metrics.consumedCapacity?.CapacityUnits;
  const hasRcu = rcu !== undefined && rcu !== null;
  const efficiency =
    mode === "scan" && metrics.scannedCount > 0
      ? Math.round((metrics.count / metrics.scannedCount) * 100)
      : null;

  return (
    <div className="query-metrics" role="status">
      <span className="query-metrics-status">Completed</span>
      <span className="query-metrics-item">
        Items returned: <strong>{metrics.count}</strong>
      </span>
      {mode === "scan" && (
        <span className="query-metrics-item">
          Items scanned: <strong>{metrics.scannedCount}</strong>
        </span>
      )}
      {efficiency !== null && (
        <span className="query-metrics-item">
          Efficiency: <strong>{efficiency}%</strong>
        </span>
      )}
      {hasRcu ? (
        <span className="query-metrics-item">
          RCUs consumed: <strong>{formatCapacityUnits(rcu)}</strong>
        </span>
      ) : (
        <span className="query-metrics-item query-metrics-muted">
          RCUs consumed: <strong>—</strong>
          <span className="query-metrics-hint" title="Requires Scylla Alternator with ReturnConsumedCapacity support">
            {" "}
            (not reported)
          </span>
        </span>
      )}
      <span className="query-metrics-item">
        Duration: <strong>{metrics.elapsedMs} ms</strong>
      </span>
    </div>
  );
}
