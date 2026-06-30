import { useEffect, useState } from "react";
import { api } from "../api.js";
import { userTables } from "../utils.js";
import ItemEditor from "./ItemEditor.jsx";
import ItemsResultTable from "./ItemsResultTable.jsx";
import QueryMetrics from "./QueryMetrics.jsx";

function mergeMetrics(previous, current) {
  if (!previous) return current;
  const prevUnits = previous.consumedCapacity?.CapacityUnits ?? 0;
  const currUnits = current.consumedCapacity?.CapacityUnits ?? 0;
  const hasCapacity = previous.consumedCapacity || current.consumedCapacity;
  return {
    count: previous.count + current.count,
    scannedCount: previous.scannedCount + current.scannedCount,
    consumedCapacity: hasCapacity
      ? { CapacityUnits: prevUnits + currUnits }
      : null,
    elapsedMs: previous.elapsedMs + current.elapsedMs,
  };
}

export default function DataBrowser() {
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState("");
  const [keySchema, setKeySchema] = useState([]);
  const [mode, setMode] = useState("scan");
  const [items, setItems] = useState([]);
  const [lastKey, setLastKey] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState({
    partitionKey: "",
    partitionValue: "",
    sortKey: "",
    sortValue: "",
  });
  const [editor, setEditor] = useState({ open: false, item: null, isNew: false });

  useEffect(() => {
    api.tables
      .list()
      .then((d) => setTables(userTables(d.tables)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!table) {
      setKeySchema([]);
      return;
    }
    api.tables
      .describe(table)
      .then((d) => {
        setKeySchema(d.table.KeySchema ?? []);
        const pk = d.table.KeySchema?.find((k) => k.KeyType === "HASH");
        const sk = d.table.KeySchema?.find((k) => k.KeyType === "RANGE");
        setQuery((q) => ({
          ...q,
          partitionKey: pk?.AttributeName ?? "",
          sortKey: sk?.AttributeName ?? "",
        }));
      })
      .catch(() => setKeySchema([]));
  }, [table]);

  async function runScan(startKey) {
    if (!table) return;
    setLoading(true);
    setError("");
    try {
      const params = { limit: "25" };
      if (startKey) params.startKey = JSON.stringify(startKey);
      const data = await api.data.scan(table, params);
      setItems((prev) => (startKey ? [...prev, ...data.items] : data.items));
      setLastKey(data.lastEvaluatedKey);
      setMetrics((prev) =>
        startKey ? mergeMetrics(prev, data.metrics) : data.metrics ?? null
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function runQuery(startKey) {
    if (!table) return;
    setLoading(true);
    setError("");
    try {
      const params = {
        partitionKey: query.partitionKey,
        partitionValue: query.partitionValue,
        limit: "25",
      };
      if (query.sortKey) {
        params.sortKey = query.sortKey;
        params.sortValue = query.sortValue;
      }
      if (startKey) params.startKey = JSON.stringify(startKey);
      const data = await api.data.query(table, params);
      setItems((prev) => (startKey ? [...prev, ...data.items] : data.items));
      setLastKey(data.lastEvaluatedKey);
      setMetrics((prev) =>
        startKey ? mergeMetrics(prev, data.metrics) : data.metrics ?? null
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function runLoad(startKey) {
    if (mode === "scan") return runScan(startKey);
    return runQuery(startKey);
  }

  function openEditor(item) {
    setEditor({ open: true, item, isNew: false });
  }

  function openNewEditor() {
    const template = {};
    for (const k of keySchema) {
      template[k.AttributeName] = "";
    }
    setEditor({ open: true, item: template, isNew: true });
  }

  async function saveEditor(item) {
    setError("");
    try {
      await api.data.putItem(table, item);
      setEditor({ open: false, item: null, isNew: false });
      if (mode === "scan") await runScan();
      else await runQuery();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteItem(item) {
    if (!confirm("Delete this item? This cannot be undone.")) return;
    const key = {};
    for (const k of keySchema) {
      key[k.AttributeName] = item[k.AttributeName];
    }
    setError("");
    try {
      await api.data.deleteItem(table, key);
      if (mode === "scan") await runScan();
      else await runQuery();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}

      <div className="panel">
        <div className="panel-header">
          <h2>Scan or query items</h2>
          <p>
            Select a table and operation. Results show up to 25 items per page.
          </p>
        </div>
        <div className="panel-body">
          <div className="explore-toolbar">
            <div className="row">
              <div className="field">
                <label htmlFor="data-table">Table name</label>
                <select
                  id="data-table"
                  value={table}
                  onChange={(e) => {
                    setTable(e.target.value);
                    setItems([]);
                    setLastKey(null);
                    setMetrics(null);
                  }}
                >
                  <option value="">Select a table</option>
                  {tables.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="data-mode">Operation</label>
                <select
                  id="data-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="scan">Scan</option>
                  <option value="query">Query</option>
                </select>
              </div>
            </div>

            {mode === "query" && (
              <div className="row" style={{ marginTop: "0.75rem" }}>
                <div className="field">
                  <label htmlFor="q-pk">Partition key</label>
                  <input
                    id="q-pk"
                    className="mono"
                    value={query.partitionKey}
                    onChange={(e) =>
                      setQuery({ ...query, partitionKey: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="q-pv">Partition value</label>
                  <input
                    id="q-pv"
                    value={query.partitionValue}
                    onChange={(e) =>
                      setQuery({ ...query, partitionValue: e.target.value })
                    }
                    placeholder="e.g. user-123"
                  />
                </div>
                {query.sortKey && (
                  <>
                    <div className="field">
                      <label htmlFor="q-sk">Sort key</label>
                      <input
                        id="q-sk"
                        className="mono"
                        value={query.sortKey}
                        readOnly
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="q-sv">Sort value</label>
                      <input
                        id="q-sv"
                        value={query.sortValue}
                        onChange={(e) =>
                          setQuery({ ...query, sortValue: e.target.value })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="row-actions" style={{ marginTop: "0.75rem" }}>
              <button
                type="button"
                onClick={() => (mode === "scan" ? runScan() : runQuery())}
                disabled={!table || loading}
              >
                {loading ? "Running…" : mode === "scan" ? "Run scan" : "Run query"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={openNewEditor}
                disabled={!table}
              >
                Create item
              </button>
            </div>
            <QueryMetrics metrics={metrics} mode={mode} />
          </div>
        </div>
      </div>

      {editor.open && (
        <ItemEditor
          item={editor.item}
          keySchema={keySchema}
          title={editor.isNew ? "Create item" : "Edit item"}
          onSave={saveEditor}
          onCancel={() => setEditor({ open: false, item: null, isNew: false })}
        />
      )}

      <div className="panel panel-body-flush">
        <div className="panel-header">
          <h2>
            Items returned ({items.length}
            {lastKey ? "+" : ""})
          </h2>
        </div>
        {items.length === 0 ? (
          <p className="empty">
            {loading
              ? "Loading items…"
              : "No items to display. Run a scan or query."}
          </p>
        ) : (
          <div className="panel-body panel-body-flush">
            <ItemsResultTable
              items={items}
              keySchema={keySchema}
              onEdit={openEditor}
              onDelete={deleteItem}
            />
            {lastKey && (
              <div className="dynamo-items-footer">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => runLoad(lastKey)}
                  disabled={loading}
                >
                  Load more results
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
