import { useMemo } from "react";
import {
  collectItemColumns,
  formatDisplayValue,
  inferAttrType,
} from "../dynamoItem.js";

function CellValue({ value }) {
  if (value === undefined) {
    return <span className="dynamo-cell-empty">—</span>;
  }

  const type = inferAttrType(value);
  const text = formatDisplayValue(value, type);
  const isComplex = type === "M" || type === "L";

  return (
    <span
      className={`mono${isComplex ? " dynamo-cell-complex" : ""}`}
      title={isComplex ? JSON.stringify(value) : undefined}
    >
      {text}
    </span>
  );
}

export default function ItemsResultTable({ items, keySchema, onEdit, onDelete }) {
  const columns = useMemo(
    () => collectItemColumns(items, keySchema),
    [items, keySchema]
  );

  if (items.length === 0) return null;

  return (
    <div className="aws-table-wrap dynamo-items-table-wrap">
      <table className="aws-table dynamo-items-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} className="mono">
                {col}
              </th>
            ))}
            <th className="dynamo-items-actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index}>
              {columns.map((col) => (
                <td key={col}>
                  <CellValue value={item[col]} />
                </td>
              ))}
              <td className="dynamo-items-actions-col">
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn-sm link-btn"
                    onClick={() => onEdit(item)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-sm danger"
                    onClick={() => onDelete(item)}
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
  );
}
