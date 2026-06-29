import { useEffect, useState } from "react";
import { api } from "../api.js";
import { gsiRows, keySchemaRows, userTables } from "../utils.js";

const ATTR_TYPES = { S: "String (S)", N: "Number (N)", B: "Binary (B)" };

export default function Tables() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [description, setDescription] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    tableName: "",
    partitionKey: "pk",
    partitionKeyType: "S",
    sortKey: "",
    sortKeyType: "S",
    gsiName: "",
    gsiPartitionKey: "",
    gsiPartitionKeyType: "S",
  });

  async function load() {
    setError("");
    try {
      const data = await api.tables.list();
      setTables(userTables(data.tables));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDescribe(name) {
    setSelected(name);
    setDescription(null);
    setError("");
    try {
      const data = await api.tables.describe(name);
      setDescription(data.table);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const body = {
        tableName: form.tableName,
        partitionKey: form.partitionKey,
        partitionKeyType: form.partitionKeyType,
      };
      if (form.sortKey) {
        body.sortKey = form.sortKey;
        body.sortKeyType = form.sortKeyType;
      }
      if (form.gsiName && form.gsiPartitionKey) {
        body.gsiName = form.gsiName;
        body.gsiPartitionKey = form.gsiPartitionKey;
        body.gsiPartitionKeyType = form.gsiPartitionKeyType;
      }
      await api.tables.create(body);
      setNotice(`Table "${form.tableName}" created (PAY_PER_REQUEST).`);
      setForm({
        tableName: "",
        partitionKey: "pk",
        partitionKeyType: "S",
        sortKey: "",
        sortKeyType: "S",
        gsiName: "",
        gsiPartitionKey: "",
        gsiPartitionKeyType: "S",
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(name) {
    if (
      !confirm(
        `Delete table "${name}" and all its data? This cannot be undone.`
      )
    ) {
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await api.tables.delete(name);
      setNotice(`Table "${name}" deleted.`);
      if (selected === name) {
        setSelected(null);
        setDescription(null);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const schema = description ? keySchemaRows(description) : [];
  const gsis = description ? gsiRows(description) : [];

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      <div className="panel">
        <div className="panel-header">
        <h2>Create table</h2>
        <p className="hint">
          Creates a DynamoDB-compatible table with on-demand billing (
          <code className="mono">PAY_PER_REQUEST</code>).
        </p>
        </div>
        <div className="panel-body">
        <form onSubmit={handleCreate}>
          <div className="row">
            <div className="field">
              <label htmlFor="table-name">Table name</label>
              <input
                id="table-name"
                placeholder="events"
                value={form.tableName}
                onChange={(e) =>
                  setForm({ ...form, tableName: e.target.value })
                }
                required
              />
            </div>
            <div className="field">
              <label htmlFor="partition-key">Partition key attribute</label>
              <input
                id="partition-key"
                value={form.partitionKey}
                onChange={(e) =>
                  setForm({ ...form, partitionKey: e.target.value })
                }
                required
              />
            </div>
            <div className="field">
              <label htmlFor="partition-key-type">Partition key type</label>
              <select
                id="partition-key-type"
                value={form.partitionKeyType}
                onChange={(e) =>
                  setForm({ ...form, partitionKeyType: e.target.value })
                }
              >
                {Object.entries(ATTR_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="sort-key">Sort key attribute (optional)</label>
              <input
                id="sort-key"
                value={form.sortKey}
                onChange={(e) => setForm({ ...form, sortKey: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="sort-key-type">Sort key type</label>
              <select
                id="sort-key-type"
                value={form.sortKeyType}
                onChange={(e) =>
                  setForm({ ...form, sortKeyType: e.target.value })
                }
                disabled={!form.sortKey}
              >
                {Object.entries(ATTR_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="gsi-name">GSI name (optional)</label>
              <input
                id="gsi-name"
                value={form.gsiName}
                onChange={(e) => setForm({ ...form, gsiName: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="gsi-pk">GSI partition key</label>
              <input
                id="gsi-pk"
                value={form.gsiPartitionKey}
                onChange={(e) =>
                  setForm({ ...form, gsiPartitionKey: e.target.value })
                }
                disabled={!form.gsiName}
              />
            </div>
            <div className="field">
              <label htmlFor="gsi-pk-type">GSI key type</label>
              <select
                id="gsi-pk-type"
                value={form.gsiPartitionKeyType}
                onChange={(e) =>
                  setForm({ ...form, gsiPartitionKeyType: e.target.value })
                }
                disabled={!form.gsiName}
              >
                {Object.entries(ATTR_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={busy}>
              Create table
            </button>
          </div>
        </form>
        </div>
      </div>

      <div className="panel panel-body-flush">
        <div className="panel-header">
        <h2>Tables ({tables.length})</h2>
        </div>
        {loading ? (
          <p className="empty">Loading tables…</p>
        ) : tables.length === 0 ? (
          <p className="empty">No user tables yet.</p>
        ) : (
          <div className="aws-table-wrap">
          <table className="aws-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((name) => (
                <tr key={name}>
                  <td className="mono">{name}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn-sm secondary"
                        onClick={() => handleDescribe(name)}
                      >
                        {selected === name ? "Refresh" : "Describe"}
                      </button>
                      <button
                        className="btn-sm danger"
                        onClick={() => handleDelete(name)}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {description && (
        <div className="panel">
          <div className="panel-header">
          <h3>{selected}</h3>
          <p className="hint">Table details from DescribeTable</p>
          </div>
          <div className="panel-body">
          <div className="schema-grid">
            <div className="schema-block">
              <h4>Billing</h4>
              <p>{description.BillingModeSummary?.BillingMode ?? "—"}</p>
            </div>
            <div className="schema-block">
              <h4>Status</h4>
              <p>{description.TableStatus ?? "—"}</p>
            </div>
            <div className="schema-block">
              <h4>Item count</h4>
              <p>{description.ItemCount ?? 0}</p>
            </div>
          </div>

          {schema.length > 0 && (
            <div className="aws-table-wrap">
            <table className="aws-table">
              <thead>
                <tr>
                  <th>Attribute</th>
                  <th>Role</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {schema.map((row) => (
                  <tr key={row.name}>
                    <td className="mono">{row.name}</td>
                    <td>{row.role}</td>
                    <td>{ATTR_TYPES[row.type] ?? row.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {gsis.length > 0 && (
            <>
              <h4 style={{ marginTop: "1rem", color: "var(--aws-text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Global secondary indexes
              </h4>
              <div className="aws-table-wrap">
              <table className="aws-table">
                <thead>
                  <tr>
                    <th>Index</th>
                    <th>Keys</th>
                    <th>Projection</th>
                  </tr>
                </thead>
                <tbody>
                  {gsis.map((gsi) => (
                    <tr key={gsi.name}>
                      <td className="mono">{gsi.name}</td>
                      <td className="mono">{gsi.keys}</td>
                      <td>{gsi.projection}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}

          <details className="raw-json">
            <summary>View raw JSON</summary>
            <pre className="mono">{JSON.stringify(description, null, 2)}</pre>
          </details>
          </div>
        </div>
      )}
    </div>
  );
}
