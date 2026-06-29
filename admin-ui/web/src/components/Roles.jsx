import { useEffect, useState } from "react";
import { api } from "../api.js";
import CopyButton from "./CopyButton.jsx";

const PRESETS = [
  {
    id: "full",
    label: "Full access",
    detail: "SELECT, MODIFY, CREATE, DROP on the table",
  },
  {
    id: "readwrite",
    label: "Read / write",
    detail: "SELECT + MODIFY (Get/Put/Update/Delete)",
  },
  { id: "readonly", label: "Read only", detail: "SELECT (Get/Query/Scan)" },
  {
    id: "create",
    label: "Create tables",
    detail: "CREATE on all keyspaces",
  },
];

function BoolBadge({ value, yesLabel, noLabel = "No" }) {
  return (
    <span className={`badge ${value ? "badge-yes" : "badge-no"}`}>
      {value ? yesLabel : noLabel}
    </span>
  );
}

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [credentials, setCredentials] = useState(null);
  const [rotateRole, setRotateRole] = useState(null);
  const [rotatePassword, setRotatePassword] = useState("");
  const [newRole, setNewRole] = useState({ role: "", password: "" });
  const [grant, setGrant] = useState({
    role: "",
    preset: "full",
    tableName: "",
  });

  const selectedPreset = PRESETS.find((p) => p.id === grant.preset);
  const grantTarget =
    grant.preset === "create"
      ? "ALL KEYSPACES (CREATE)"
      : grant.tableName
        ? `alternator_${grant.tableName}.${grant.tableName}`
        : null;

  async function load() {
    setError("");
    try {
      const data = await api.roles.list();
      setRoles(data.roles);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const data = await api.roles.create(newRole.role, newRole.password);
      setCredentials(data);
      setNewRole({ role: "", password: "" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRotate(e) {
    e.preventDefault();
    if (!rotateRole || !rotatePassword) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const data = await api.roles.rotate(rotateRole, rotatePassword);
      setCredentials(data);
      setRotateRole(null);
      setRotatePassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDrop(role) {
    if (!confirm(`Drop role "${role}"? Apps using this access key will stop working.`)) {
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await api.roles.drop(role);
      setNotice(`Role "${role}" dropped.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGrant(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await api.roles.grant(grant.role, {
        preset: grant.preset,
        tableName: grant.tableName || undefined,
      });
      setNotice(
        result.target
          ? `Granted ${grant.preset} on ${result.target} to ${grant.role}.`
          : `Granted ${grant.preset} to ${grant.role}.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      {credentials && (
        <div className="panel credential-box">
          <div className="panel-body">
          <p className="success" style={{ marginTop: 0 }}>
            Save these Alternator credentials now — the secret is shown once and
            is not stored in the UI.
          </p>
          <div className="credential-row">
            <span>
              <strong>Access Key ID</strong>
              <br />
              <span className="mono">{credentials.accessKeyId}</span>
            </span>
            <CopyButton text={credentials.accessKeyId} label="Copy key" />
          </div>
          <div className="credential-row">
            <span>
              <strong>Secret Access Key</strong>{" "}
              <span className="hint">(salted_hash — use in AWS SDK, not CQL password)</span>
              <br />
              <span className="mono">{credentials.secretAccessKey}</span>
            </span>
            <CopyButton text={credentials.secretAccessKey} label="Copy secret" />
          </div>
          <button type="button" className="secondary" onClick={() => setCredentials(null)}>
            Dismiss
          </button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
        <h2>Create role</h2>
        <p className="hint">
          Creates a CQL login role. The role name becomes the Alternator{" "}
          <code className="mono">accessKeyId</code>; use the returned{" "}
          <code className="mono">salted_hash</code> as{" "}
          <code className="mono">secretAccessKey</code>.
        </p>
        </div>
        <div className="panel-body">
        <form onSubmit={handleCreate}>
          <div className="row">
            <div className="field">
              <label htmlFor="new-role">Role name</label>
              <input
                id="new-role"
                placeholder="myapp"
                value={newRole.role}
                onChange={(e) =>
                  setNewRole({ ...newRole, role: e.target.value })
                }
                pattern="[A-Za-z][A-Za-z0-9_]*"
                title="Letters, numbers, underscore; must start with a letter"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-password">CQL password</label>
              <input
                id="new-password"
                type="password"
                value={newRole.password}
                onChange={(e) =>
                  setNewRole({ ...newRole, password: e.target.value })
                }
                required
              />
            </div>
            <button type="submit" disabled={busy}>
              Create role
            </button>
          </div>
        </form>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
        <h2>Grant permissions</h2>
        <p className="hint">
          Applies CQL grants on Alternator keyspaces. Table grants target{" "}
          <code className="mono">alternator_&lt;table&gt;.&lt;table&gt;</code>.
        </p>
        </div>
        <div className="panel-body">
        <form onSubmit={handleGrant}>
          <div className="row">
            <div className="field">
              <label htmlFor="grant-role">Role</label>
              <select
                id="grant-role"
                value={grant.role}
                onChange={(e) => setGrant({ ...grant, role: e.target.value })}
                required
              >
                <option value="">Select role…</option>
                {roles.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.role}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="grant-preset">Preset</label>
              <select
                id="grant-preset"
                value={grant.preset}
                onChange={(e) => setGrant({ ...grant, preset: e.target.value })}
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            {grant.preset !== "create" && (
              <div className="field">
                <label htmlFor="grant-table">Table name</label>
                <input
                  id="grant-table"
                  placeholder="my_table"
                  value={grant.tableName}
                  onChange={(e) =>
                    setGrant({ ...grant, tableName: e.target.value })
                  }
                  required
                />
              </div>
            )}
            <button type="submit" disabled={busy}>
              Apply grant
            </button>
          </div>
          {selectedPreset && (
            <p className="hint" style={{ marginBottom: 0 }}>
              {selectedPreset.detail}
              {grantTarget ? ` · Target: ${grantTarget}` : ""}
            </p>
          )}
        </form>
        </div>
      </div>

      <div className="panel panel-body-flush">
        <div className="panel-header">
        <h2>Roles ({roles.length})</h2>
        </div>
        {loading ? (
          <p className="empty">Loading roles…</p>
        ) : roles.length === 0 ? (
          <p className="empty">No roles found.</p>
        ) : (
          <div className="aws-table-wrap">
          <table className="aws-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Login</th>
                <th>Superuser</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.role}>
                  <td className="mono">{r.role}</td>
                  <td>
                    <BoolBadge value={r.canLogin} yesLabel="Yes" />
                  </td>
                  <td>
                    {r.isSuperuser ? (
                      <span className="badge badge-warn">Superuser</span>
                    ) : (
                      <span className="badge badge-no">No</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn-sm secondary"
                        onClick={() => {
                          setRotateRole(r.role);
                          setRotatePassword("");
                        }}
                      >
                        Rotate password
                      </button>
                      {r.role !== "cassandra" && (
                        <button
                          className="btn-sm danger"
                          onClick={() => handleDrop(r.role)}
                          disabled={busy}
                        >
                          Drop
                        </button>
                      )}
                    </div>
                    {rotateRole === r.role && (
                      <form className="inline-form" onSubmit={handleRotate}>
                        <div className="field">
                          <label htmlFor={`rotate-${r.role}`}>New CQL password</label>
                          <input
                            id={`rotate-${r.role}`}
                            type="password"
                            value={rotatePassword}
                            onChange={(e) => setRotatePassword(e.target.value)}
                            required
                          />
                        </div>
                        <button type="submit" className="btn-sm" disabled={busy}>
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn-sm secondary"
                          onClick={() => setRotateRole(null)}
                        >
                          Cancel
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
