import { Router } from "express";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
  waitUntilTableExists,
  waitUntilTableNotExists,
} from "@aws-sdk/client-dynamodb";
import { getRaw } from "../scylla.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const result = await getRaw().send(new ListTablesCommand({}));
    res.json({ tables: result.TableNames ?? [] });
  } catch (err) {
    next(err);
  }
});

router.get("/:name", async (req, res, next) => {
  try {
    const result = await getRaw().send(
      new DescribeTableCommand({ TableName: req.params.name })
    );
    res.json({ table: result.Table });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const {
      tableName,
      partitionKey,
      partitionKeyType = "S",
      sortKey,
      sortKeyType = "S",
      gsiName,
      gsiPartitionKey,
      gsiPartitionKeyType = "S",
    } = req.body ?? {};

    if (!tableName || !partitionKey) {
      return res
        .status(400)
        .json({ error: "tableName and partitionKey are required" });
    }

    const attributeDefinitions = [
      { AttributeName: partitionKey, AttributeType: partitionKeyType },
    ];
    const keySchema = [{ AttributeName: partitionKey, KeyType: "HASH" }];

    if (sortKey) {
      attributeDefinitions.push({
        AttributeName: sortKey,
        AttributeType: sortKeyType,
      });
      keySchema.push({ AttributeName: sortKey, KeyType: "RANGE" });
    }

    const params = {
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: attributeDefinitions,
      KeySchema: keySchema,
    };

    if (gsiName && gsiPartitionKey) {
      attributeDefinitions.push({
        AttributeName: gsiPartitionKey,
        AttributeType: gsiPartitionKeyType,
      });
      params.GlobalSecondaryIndexes = [
        {
          IndexName: gsiName,
          KeySchema: [{ AttributeName: gsiPartitionKey, KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ];
    }

    await getRaw().send(new CreateTableCommand(params));
    await waitUntilTableExists(
      { client: getRaw(), maxWaitTime: 120 },
      { TableName: tableName }
    );

    res.status(201).json({ tableName });
  } catch (err) {
    next(err);
  }
});

router.delete("/:name", async (req, res, next) => {
  try {
    const tableName = req.params.name;
    await getRaw().send(new DeleteTableCommand({ TableName: tableName }));
    await waitUntilTableNotExists(
      { client: getRaw(), maxWaitTime: 120 },
      { TableName: tableName }
    );
    res.json({ ok: true, tableName });
  } catch (err) {
    next(err);
  }
});

export default router;
