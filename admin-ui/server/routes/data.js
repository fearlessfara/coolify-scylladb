import { Router } from "express";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDoc } from "../scylla.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

function reviveDynamoValue(value) {
  if (value && typeof value === "object" && Array.isArray(value.__dynamoSet)) {
    return new Set(value.__dynamoSet);
  }
  if (Array.isArray(value)) {
    return value.map(reviveDynamoValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, reviveDynamoValue(v)])
    );
  }
  return value;
}

function operationMetrics(result, elapsedMs) {
  return {
    count: result.Count ?? 0,
    scannedCount: result.ScannedCount ?? result.Count ?? 0,
    consumedCapacity: result.ConsumedCapacity ?? null,
    elapsedMs,
  };
}

router.get("/:table/scan", async (req, res, next) => {
  try {
    const { table } = req.params;
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const started = Date.now();
    const result = await getDoc().send(
      new ScanCommand({
        TableName: table,
        Limit: limit,
        ReturnConsumedCapacity: "TOTAL",
        ExclusiveStartKey: req.query.startKey
          ? JSON.parse(req.query.startKey)
          : undefined,
      })
    );
    const metrics = operationMetrics(result, Date.now() - started);
    res.json({
      items: result.Items ?? [],
      lastEvaluatedKey: result.LastEvaluatedKey ?? null,
      count: metrics.count,
      metrics,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:table/query", async (req, res, next) => {
  try {
    const { table } = req.params;
    const { partitionKey, partitionValue, sortKey, sortValue, limit } =
      req.query;

    if (!partitionKey || partitionValue === undefined) {
      return res
        .status(400)
        .json({ error: "partitionKey and partitionValue are required" });
    }

    let keyCondition = "#pk = :pk";
    const names = { "#pk": partitionKey };
    const values = { ":pk": partitionValue };

    if (sortKey && sortValue !== undefined) {
      keyCondition += " AND #sk = :sk";
      names["#sk"] = sortKey;
      values[":sk"] = sortValue;
    }

    const started = Date.now();
    const result = await getDoc().send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        Limit: Math.min(Number(limit) || 25, 100),
        ReturnConsumedCapacity: "TOTAL",
        ExclusiveStartKey: req.query.startKey
          ? JSON.parse(req.query.startKey)
          : undefined,
      })
    );

    const metrics = operationMetrics(result, Date.now() - started);
    res.json({
      items: result.Items ?? [],
      lastEvaluatedKey: result.LastEvaluatedKey ?? null,
      count: metrics.count,
      metrics,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:table/item", async (req, res, next) => {
  try {
    const { table } = req.params;
    const key = JSON.parse(req.query.key || "{}");
    const result = await getDoc().send(
      new GetCommand({ TableName: table, Key: key })
    );
    res.json({ item: result.Item ?? null });
  } catch (err) {
    next(err);
  }
});

router.put("/:table/item", async (req, res, next) => {
  try {
    const { table } = req.params;
    const { item } = req.body ?? {};
    if (!item || typeof item !== "object") {
      return res.status(400).json({ error: "item object is required" });
    }
    await getDoc().send(
      new PutCommand({ TableName: table, Item: reviveDynamoValue(item) })
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/:table/item", async (req, res, next) => {
  try {
    const { table } = req.params;
    const key = req.body?.key;
    if (!key || typeof key !== "object") {
      return res.status(400).json({ error: "key object is required" });
    }
    await getDoc().send(new DeleteCommand({ TableName: table, Key: key }));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
