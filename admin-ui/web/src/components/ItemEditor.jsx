import { Fragment, useMemo, useState } from "react";
import {
  ATTR_TYPES,
  attrNodesToItem,
  defaultValueForType,
  itemToAttrNodes,
  newAttrId,
} from "../dynamoItem.js";

function cloneNodes(nodes) {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNodes(node.children) : undefined,
  }));
}

function updateNode(nodes, id, updater) {
  return nodes.map((node) => {
    if (node.id === id) return updater(node);
    if (node.children?.length) {
      return { ...node, children: updateNode(node.children, id, updater) };
    }
    return node;
  });
}

function removeNode(nodes, id) {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) =>
      node.children?.length
        ? { ...node, children: removeNode(node.children, id) }
        : node
    );
}

function AttributeValueInput({ node, onChange }) {
  const { type } = node;

  if (type === "NULL") {
    return <span className="dynamo-null-value">null</span>;
  }

  if (type === "BOOL") {
    return (
      <select
        value={node.scalar ? "true" : "false"}
        onChange={(e) => onChange({ ...node, scalar: e.target.value === "true" })}
      >
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  }

  if (type === "SS" || type === "NS") {
    return (
      <input
        type="text"
        className="mono"
        value={node.scalar ?? ""}
        placeholder={type === "NS" ? "1, 2, 3" : "alpha, beta"}
        onChange={(e) => onChange({ ...node, scalar: e.target.value })}
      />
    );
  }

  if (type === "L" || type === "M") {
    return (
      <span className="dynamo-complex-hint">
        {type === "L" ? "List" : "Map"}
      </span>
    );
  }

  return (
    <input
      type="text"
      className={type === "N" ? "mono" : undefined}
      value={node.scalar ?? ""}
      onChange={(e) => onChange({ ...node, scalar: e.target.value })}
    />
  );
}

function AttributeRows({
  nodes,
  onChange,
  depth = 0,
  isMap = true,
  lockedNames = [],
}) {
  function patch(id, updater) {
    onChange(updateNode(nodes, id, updater));
  }

  function remove(id) {
    onChange(removeNode(nodes, id));
  }

  function addChild() {
    const child = {
      id: newAttrId(),
      name: "",
      type: "S",
      scalar: "",
    };
    onChange([...nodes, child]);
  }

  return (
    <div className={`dynamo-attr-block depth-${depth}`}>
      <table className="dynamo-attr-table">
        <thead>
          <tr>
            <th className="col-name">{isMap ? "Attribute name" : "Index"}</th>
            <th className="col-type">Type</th>
            <th className="col-value">Value</th>
            <th className="col-actions" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {nodes.length === 0 && (
            <tr>
              <td colSpan={4} className="dynamo-empty-row">
                No attributes. Add one below.
              </td>
            </tr>
          )}
          {nodes.map((node, index) => {
            const isKeyAttribute = isMap && lockedNames.includes(node.name);
            const isComplex = node.type === "L" || node.type === "M";

            return (
              <Fragment key={node.id}>
                <tr key={node.id}>
                  <td className="col-name">
                    {isMap ? (
                      <input
                        type="text"
                        className="mono"
                        value={node.name}
                        readOnly={isKeyAttribute}
                        placeholder="Attribute"
                        onChange={(e) =>
                          patch(node.id, (n) => ({ ...n, name: e.target.value }))
                        }
                      />
                    ) : (
                      <span className="dynamo-index mono">{index}</span>
                    )}
                  </td>
                  <td className="col-type">
                    <select
                      value={node.type}
                      disabled={isKeyAttribute}
                      onChange={(e) => {
                        const type = e.target.value;
                        const next = {
                          ...node,
                          type,
                          scalar: undefined,
                          children: undefined,
                        };
                        if (type === "L" || type === "M") {
                          next.children = [];
                        } else if (type === "SS" || type === "NS") {
                          next.scalar = "";
                        } else if (type === "BOOL") {
                          next.scalar = false;
                        } else if (type === "NULL") {
                          next.scalar = null;
                        } else if (type === "N") {
                          next.scalar = "0";
                        } else {
                          next.scalar = defaultValueForType(type);
                        }
                        patch(node.id, () => next);
                      }}
                    >
                      {ATTR_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="col-value">
                    <AttributeValueInput
                      node={node}
                      onChange={(next) => patch(node.id, () => next)}
                    />
                  </td>
                  <td className="col-actions">
                    {!isKeyAttribute && (
                      <button
                        type="button"
                        className="dynamo-remove-btn"
                        title="Remove attribute"
                        onClick={() => remove(node.id)}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
                {isComplex && (
                  <tr key={`${node.id}-nested`} className="dynamo-nested-row">
                    <td colSpan={4} className="dynamo-nested-cell">
                      <AttributeRows
                        nodes={node.children ?? []}
                        isMap={node.type === "M"}
                        depth={depth + 1}
                        lockedNames={[]}
                        onChange={(children) =>
                          patch(node.id, (n) => ({ ...n, children }))
                        }
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <button type="button" className="dynamo-add-link" onClick={addChild}>
        Add new attribute
      </button>
    </div>
  );
}

export default function ItemEditor({
  item,
  keySchema = [],
  onSave,
  onCancel,
  title,
}) {
  const lockedNames = useMemo(
    () => keySchema.map((k) => k.AttributeName),
    [keySchema]
  );

  const [nodes, setNodes] = useState(() => itemToAttrNodes(item ?? {}));
  const [view, setView] = useState("form");
  const [jsonText, setJsonText] = useState(() => JSON.stringify(item ?? {}, null, 2));
  const [localError, setLocalError] = useState("");

  function switchToJson() {
    try {
      setJsonText(JSON.stringify(attrNodesToItem(cloneNodes(nodes)), null, 2));
      setView("json");
      setLocalError("");
    } catch (err) {
      setLocalError(err.message);
    }
  }

  function switchToForm() {
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Item must be a JSON object");
      }
      setNodes(itemToAttrNodes(parsed));
      setView("form");
      setLocalError("");
    } catch (err) {
      setLocalError(err.message);
    }
  }

  function handleSave() {
    setLocalError("");
    try {
      const payload = view === "json" ? JSON.parse(jsonText) : attrNodesToItem(nodes);
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        throw new Error("Item must be an object");
      }
      onSave(payload);
    } catch (err) {
      setLocalError(err.message);
    }
  }

  return (
    <div className="panel dynamo-item-editor">
      <div className="panel-header">
        <div className="dynamo-editor-header">
          <div>
            <h3>{title}</h3>
            <p>Attributes — same layout as the DynamoDB console item editor.</p>
          </div>
          <div className="dynamo-view-toggle">
            <button
              type="button"
              className={view === "form" ? "active" : "secondary"}
              onClick={() => (view === "json" ? switchToForm() : setView("form"))}
            >
              Form
            </button>
            <button
              type="button"
              className={view === "json" ? "active" : "secondary"}
              onClick={() => (view === "form" ? switchToJson() : setView("json"))}
            >
              JSON view
            </button>
          </div>
        </div>
      </div>
      <div className="panel-body">
        {localError && <div className="error">{localError}</div>}

        {view === "form" ? (
          <AttributeRows
            nodes={nodes}
            onChange={setNodes}
            lockedNames={lockedNames}
          />
        ) : (
          <textarea
            rows={14}
            className="mono dynamo-json-textarea"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
          />
        )}

        <div className="row-actions" style={{ marginTop: "1rem" }}>
          <button type="button" onClick={handleSave}>
            Save changes
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
