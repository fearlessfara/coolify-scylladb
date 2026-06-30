export const ATTR_TYPES = [
  { value: "S", label: "String" },
  { value: "N", label: "Number" },
  { value: "BOOL", label: "Boolean" },
  { value: "NULL", label: "Null" },
  { value: "L", label: "List" },
  { value: "M", label: "Map" },
  { value: "SS", label: "String Set" },
  { value: "NS", label: "Number Set" },
];

let idCounter = 0;

export function newAttrId() {
  idCounter += 1;
  return `attr-${idCounter}`;
}

export function resetAttrIds() {
  idCounter = 0;
}

export function inferAttrType(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return "S";
  if (typeof value === "number") return "N";
  if (typeof value === "boolean") return "BOOL";
  if (value instanceof Set) {
    const first = [...value][0];
    return typeof first === "number" ? "NS" : "SS";
  }
  if (Array.isArray(value)) return "L";
  if (typeof value === "object") return "M";
  return "S";
}

export function defaultValueForType(type) {
  switch (type) {
    case "S":
      return "";
    case "N":
      return "0";
    case "BOOL":
      return false;
    case "NULL":
      return null;
    case "L":
      return [];
    case "M":
      return {};
    case "SS":
    case "NS":
      return new Set();
    default:
      return "";
  }
}

export function valueToAttrNode(name, value) {
  const type = inferAttrType(value);
  const node = { id: newAttrId(), name: name ?? "", type };

  if (type === "L") {
    node.children = value.map((child) => valueToAttrNode("", child));
    return node;
  }

  if (type === "M") {
    node.children = Object.entries(value).map(([childName, childValue]) =>
      valueToAttrNode(childName, childValue)
    );
    return node;
  }

  if (type === "SS" || type === "NS") {
    node.scalar = [...value].join(", ");
    return node;
  }

  if (type === "N") {
    node.scalar = String(value);
    return node;
  }

  node.scalar = value;
  return node;
}

export function itemToAttrNodes(item = {}) {
  resetAttrIds();
  return Object.entries(item).map(([name, value]) => valueToAttrNode(name, value));
}

function nodeToValue(node) {
  switch (node.type) {
    case "S":
      return String(node.scalar ?? "");
    case "N": {
      const n = Number(node.scalar);
      if (Number.isNaN(n)) throw new Error(`"${node.name}" is not a valid number`);
      return n;
    }
    case "BOOL":
      return Boolean(node.scalar);
    case "NULL":
      return null;
    case "L":
      return (node.children ?? []).map((child) => nodeToValue(child));
    case "M": {
      const map = {};
      for (const child of node.children ?? []) {
        const key = child.name?.trim();
        if (!key) throw new Error("Map attributes require a name");
        map[key] = nodeToValue(child);
      }
      return map;
    }
    case "SS": {
      const items = String(node.scalar ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return new Set(items);
    }
    case "NS": {
      const items = String(node.scalar ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const n = Number(s);
          if (Number.isNaN(n)) throw new Error(`Invalid number in set: ${s}`);
          return n;
        });
      return new Set(items);
    }
    default:
      return node.scalar ?? "";
  }
}

export function attrNodesToItem(nodes) {
  const item = {};
  for (const node of nodes) {
    const name = node.name?.trim();
    if (!name) throw new Error("Every top-level attribute needs a name");
    item[name] = nodeToValue(node);
  }
  return item;
}

export function formatDisplayValue(value, type) {
  if (type === "NULL" || value === null) return "null";
  if (type === "BOOL") return value ? "true" : "false";
  if (type === "SS" || type === "NS") {
    const items = value instanceof Set ? [...value] : value;
    return `{ ${items.join(", ")} }`;
  }
  if (type === "L") return `[ ${value.length} attribute${value.length === 1 ? "" : "s"} ]`;
  if (type === "M") {
    const keys = Object.keys(value);
    return `{ ${keys.length} attribute${keys.length === 1 ? "" : "s"} }`;
  }
  return String(value);
}

export function collectItemColumns(items, keySchema = []) {
  const keyNames = keySchema.map((k) => k.AttributeName);
  const seen = new Set(keyNames);
  const columns = [...keyNames];

  for (const item of items) {
    for (const name of Object.keys(item ?? {})) {
      if (!seen.has(name)) {
        seen.add(name);
        columns.push(name);
      }
    }
  }

  return columns;
}

export function flattenItemAttributes(item, prefix = "") {
  const rows = [];
  for (const [name, value] of Object.entries(item ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name;
    const type = inferAttrType(value);
    if (type === "M") {
      rows.push({ path, name, type, value: null, expandable: true });
      rows.push(...flattenItemAttributes(value, path));
    } else if (type === "L") {
      rows.push({ path, name, type, value, expandable: true });
      value.forEach((entry, index) => {
        const entryType = inferAttrType(entry);
        const entryPath = `${path}[${index}]`;
        if (entryType === "M" || entryType === "L") {
          rows.push({
            path: entryPath,
            name: String(index),
            type: entryType,
            value: entry,
            expandable: true,
            nested: true,
          });
          if (entryType === "M") {
            rows.push(...flattenItemAttributes(entry, entryPath));
          }
        } else {
          rows.push({
            path: entryPath,
            name: String(index),
            type: entryType,
            value: entry,
            nested: true,
          });
        }
      });
    } else {
      rows.push({ path, name, type, value });
    }
  }
  return rows;
}
