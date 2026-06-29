const headers = {
  "Content-Type": "application/json",
  "X-Requested-With": "ScyllaAdmin",
};

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers,
    ...options,
    headers: { ...headers, ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || res.statusText);
  }
  return data;
}

export const api = {
  login: (username, password) =>
    request("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request("/api/logout", { method: "POST" }),
  me: () => request("/api/me"),
  roles: {
    list: () => request("/api/roles"),
    create: (role, password) =>
      request("/api/roles", {
        method: "POST",
        body: JSON.stringify({ role, password }),
      }),
    rotate: (role, password) =>
      request(`/api/roles/${encodeURIComponent(role)}/rotate`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    drop: (role) =>
      request(`/api/roles/${encodeURIComponent(role)}`, { method: "DELETE" }),
    grant: (role, body) =>
      request(`/api/roles/${encodeURIComponent(role)}/grants`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  tables: {
    list: () => request("/api/tables"),
    describe: (name) => request(`/api/tables/${encodeURIComponent(name)}`),
    create: (body) =>
      request("/api/tables", { method: "POST", body: JSON.stringify(body) }),
    delete: (name) =>
      request(`/api/tables/${encodeURIComponent(name)}`, { method: "DELETE" }),
  },
  data: {
    scan: (table, params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/data/${encodeURIComponent(table)}/scan?${q}`);
    },
    query: (table, params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/data/${encodeURIComponent(table)}/query?${q}`);
    },
    getItem: (table, key) =>
      request(
        `/api/data/${encodeURIComponent(table)}/item?key=${encodeURIComponent(JSON.stringify(key))}`
      ),
    putItem: (table, item) =>
      request(`/api/data/${encodeURIComponent(table)}/item`, {
        method: "PUT",
        body: JSON.stringify({ item }),
      }),
    deleteItem: (table, key) =>
      request(`/api/data/${encodeURIComponent(table)}/item`, {
        method: "DELETE",
        body: JSON.stringify({ key }),
      }),
  },
};
