/** Hide Alternator internal Paxos tables from user-facing lists. */
export function userTables(tables = []) {
  return tables.filter((name) => !name.includes("$"));
}

export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

export function keySchemaRows(table) {
  if (!table?.KeySchema) return [];
  return table.KeySchema.map((key) => {
    const attr = table.AttributeDefinitions?.find(
      (a) => a.AttributeName === key.AttributeName
    );
    return {
      name: key.AttributeName,
      role: key.KeyType === "HASH" ? "Partition key" : "Sort key",
      type: attr?.AttributeType ?? "—",
    };
  });
}

export function gsiRows(table) {
  return (table?.GlobalSecondaryIndexes ?? []).map((gsi) => ({
    name: gsi.IndexName,
    keys: gsi.KeySchema.map((k) => k.AttributeName).join(", "),
    projection: gsi.Projection?.ProjectionType ?? "—",
  }));
}
