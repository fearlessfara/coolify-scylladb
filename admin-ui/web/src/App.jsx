import { useEffect, useState } from "react";
import { api } from "./api.js";
import Login from "./components/Login.jsx";
import Roles from "./components/Roles.jsx";
import Tables from "./components/Tables.jsx";
import DataBrowser from "./components/DataBrowser.jsx";

const TABS = [
  { id: "roles", label: "Access management" },
  { id: "tables", label: "Tables" },
  { id: "data", label: "Explore items" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("tables");

  useEffect(() => {
    api
      .me()
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
  }

  if (loading) {
    return <div className="loading-screen">Loading…</div>;
  }

  if (!user) {
    return <Login onLogin={(data) => setUser(data)} />;
  }

  const activeTab = TABS.find((t) => t.id === tab);

  return (
    <div className="console-shell">
      <header className="console-topbar">
        <div className="console-topbar-brand">
          <strong>Alternator</strong>
          <span>ScyllaDB · DynamoDB-compatible API</span>
        </div>
        <div className="console-topbar-actions">
          <span>{user.username}</span>
          <button type="button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="console-body">
        <div className="console-content">
          <div className="page-header">
            <h1>{activeTab?.label ?? "Console"}</h1>
            <p>
              {tab === "roles" &&
                "Manage CQL roles and Alternator access keys."}
              {tab === "tables" &&
                "Create, describe, and delete DynamoDB-compatible tables."}
              {tab === "data" &&
                "Scan or query items and edit them as JSON."}
            </p>
          </div>

          <nav className="console-tabs" aria-label="Console sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? "active" : ""}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "roles" && <Roles />}
          {tab === "tables" && <Tables />}
          {tab === "data" && <DataBrowser />}
        </div>
      </main>
    </div>
  );
}
