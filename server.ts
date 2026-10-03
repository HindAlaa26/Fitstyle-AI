import "dotenv/config";
import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { Client, handle_file } from "@gradio/client";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";

// Initialize Express
const app = express();
app.use(express.json({ limit: "50mb" }));

// DynamoDB-backed product catalogue.
// GET requests are served from an in-memory cache (dbProducts) loaded once at
// startup -- NOT from a live DynamoDB Scan on every request. Our Products table
// is provisioned at only 10 RCU/5 WCU (see infra/dynamodb.tf) to stay inside the
// Always Free tier, and scanning ~11.5k items on every page load would blow
// through that budget immediately and get throttled. Writes (POST/PUT/DELETE)
// go to DynamoDB AND update the in-memory cache together, so it never drifts.

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const ddb = DynamoDBDocumentClient.from(ddbClient);
const PRODUCTS_TABLE = process.env.DYNAMODB_PRODUCTS_TABLE || "fitstyle-ai-Products";

// Kaggle's "usage" field doesn't have "Wedding" or "Interview" values, so those
// two occasions currently have zero real inventory after this mapping. Known
// limitation, not solved here -- see conversation notes / tag some Formal items
// as Wedding-appropriate later if needed.
function mapUsageToOccasion(usage: string): string {
  const normalized = (usage || "").trim().toLowerCase();
  if (normalized === "formal") return "Formal";
  if (normalized === "party") return "Party";
  if (normalized === "casual") return "Casual";
  if (normalized === "smart casual") return "Casual";
  return "Casual"; // safe default for anything unmapped (Ethnic, Sports, Travel, Home, etc.)
}

function toFrontendProduct(item: any) {
  const occasion = item.occasion || mapUsageToOccasion(item.usage);
  return {
    id: item.id,
    name: item.name,
    category: item.category || "top",
    colour: item.colour,
    occasion,
    occasions: item.occasions || [occasion],
    size: Array.isArray(item.available_sizes) ? item.available_sizes.join(", ") : (item.size || ""),
    price: item.price,
    image: item.image || "",
    inStock: item.inStock !== false,
    quantity: item.quantity,
    season: item.season || "",
  };
}

let dbProducts: any[] = [];

async function loadProductsFromDynamoDB() {
  const items: any[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  do {
    const result: any = await ddb.send(
      new ScanCommand({
        TableName: PRODUCTS_TABLE,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  dbProducts = items.map(toFrontendProduct);
  console.log(`[DynamoDB] Loaded ${dbProducts.length} products into memory from ${PRODUCTS_TABLE}`);
}

// Initialize Product Catalogue from DynamoDB at startup
loadProductsFromDynamoDB().catch((err) => {
  console.error("[DynamoDB] Failed to load products at startup:", err);
  dbProducts = [];
});

// Server-side Qwen (OpenRouter) Client configuration
const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_1 ;
const OPENROUTER_MODEL = "qwen/qwen2.5-vl-72b-instruct";

async function callOpenRouter(messages: any[], responseJson: boolean = false) {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_1;
  const headers: any = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${key}`,
    "HTTP-Referer": "https://ai.studio/build",
    "X-Title": "FitStyle AI",
  };

  const bodyData: any = {
    model: OPENROUTER_MODEL,
    messages: messages,
    temperature: 0.3,
    max_tokens: 1000
  };

  if (responseJson) {
    bodyData.response_format = { type: "json_object" };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify(bodyData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API returned HTTP status ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error("Invalid response from OpenRouter API: No choices returned");
  }
  return choice.message?.content || "";
}

// ----------------------------------------------------
// API ROUTES FIRST
// ----------------------------------------------------

// Health Checker Endpoint
app.get("/api/health", async (req: Request, res: Response) => {
  try {
    const key = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_1 ;
    let gemmaStatus: "active" | "quota_exceeded" | "invalid_key" | "error" = "active";
    let gemmaError: string | null = null;

    if (!key || key.trim() === "") {
      gemmaStatus = "invalid_key";
      gemmaError = "OPENROUTER_API_KEY is not configured.";
    } else {
      try {
        await callOpenRouter([
          {
            role: "user",
            content: "Reply with only the word: OK"
          }
        ]);
        gemmaStatus = "active";
      } catch (err: any) {
        let errStr = "";
        try {
          errStr = JSON.stringify({
            message: err?.message || "",
            status: err?.status || err?.statusCode || "",
            code: err?.code || "",
            name: err?.name || "",
            error: err?.error || "",
            string: String(err || "")
          });
        } catch (e) {
          errStr = String(err?.message || err || "");
        }
        console.log("[INFO] Gemma API health check updated. Status:", gemmaStatus);
        gemmaError = errStr;

        const lowerErr = errStr.toLowerCase();
        const errStatus = err?.status || err?.statusCode || err?.code || (err?.error && (err?.error?.status || err?.error?.code));
        
        const isQuota = 
          lowerErr.includes("429") || 
          lowerErr.includes("resource_exhausted") || 
          lowerErr.includes("quota") || 
          lowerErr.includes("too many requests") ||
          lowerErr.includes("rate_limit") ||
          lowerErr.includes("rate limit");

        const isInvalidKey =
          lowerErr.includes("401") ||
          lowerErr.includes("403") ||
          lowerErr.includes("400") ||
          lowerErr.includes("api_key_invalid") || 
          lowerErr.includes("invalid_key") || 
          lowerErr.includes("invalid api key") || 
          lowerErr.includes("expired") ||
          lowerErr.includes("key expired") ||
          lowerErr.includes("invalid_argument") ||
          lowerErr.includes("api key expired") ||
          lowerErr.includes("api key invalid") ||
          errStatus === 400 ||
          errStatus === 401 ||
          errStatus === 403;

        if (isQuota) {
          gemmaStatus = "quota_exceeded";
        } else if (isInvalidKey) {
          gemmaStatus = "invalid_key";
        } else {
          gemmaStatus = "error";
        }
      }
    }

    const grokKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1;
    let grokStatus: "active" | "quota_exceeded" | "invalid_key" | "error" = "active";
    let grokError: string | null = null;

    if (!grokKey || grokKey.trim() === "") {
      grokStatus = "invalid_key";
      grokError = "GROQ_API_KEY is not configured.";
    } else {
      try {
        const grokResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${grokKey}`
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              {
                role: "user",
                content: "Reply with only the word: OK"
              }
            ],
            temperature: 0.1
          })
        });

        if (!grokResponse.ok) {
          const bodyText = await grokResponse.text();
          throw new Error(`Grok API returned HTTP status ${grokResponse.status}: ${bodyText}`);
        }
        grokStatus = "active";
      } catch (err: any) {
        let errStr = "";
        try {
          errStr = JSON.stringify({
            message: err?.message || "",
            status: err?.status || err?.statusCode || "",
            code: err?.code || "",
            name: err?.name || "",
            error: err?.error || "",
            string: String(err || "")
          });
        } catch (e) {
          errStr = String(err?.message || err || "");
        }
        console.log("[INFO] Grok API health check updated. Status:", grokStatus);
        grokError = errStr;

        const lowerErr = errStr.toLowerCase();
        const errStatus = err?.status || err?.statusCode || err?.code || (err?.error && (err?.error?.status || err?.error?.code));
        
        const isQuota = 
          lowerErr.includes("429") || 
          lowerErr.includes("resource_exhausted") || 
          lowerErr.includes("quota") || 
          lowerErr.includes("too many requests") ||
          lowerErr.includes("rate_limit") ||
          lowerErr.includes("rate limit");

        const isInvalidKey =
          lowerErr.includes("401") ||
          lowerErr.includes("403") ||
          lowerErr.includes("400") ||
          lowerErr.includes("api_key_invalid") || 
          lowerErr.includes("invalid_key") || 
          lowerErr.includes("invalid api key") || 
          lowerErr.includes("expired") ||
          lowerErr.includes("key expired") ||
          lowerErr.includes("invalid_argument") ||
          lowerErr.includes("api key expired") ||
          lowerErr.includes("api key invalid") ||
          errStatus === 400 ||
          errStatus === 401 ||
          errStatus === 403 ||
          errStatus === "INVALID_ARGUMENT";

        if (isQuota) {
          grokStatus = "quota_exceeded";
        } else if (isInvalidKey) {
          grokStatus = "invalid_key";
        } else {
          grokStatus = "error";
        }
      }
    }

    res.json({
      gemma: {
        status: gemmaStatus,
        model: OPENROUTER_MODEL,
        remaining: "unknown",
        error: gemmaError
      },
      grok: {
        status: grokStatus,
        model: "groq-grok-llama-3.3",
        remaining: "unknown",
        error: grokError
      }
    });
  } catch (globalErr: any) {
    console.log("[INFO] Global health check error handled cleanly.");
    res.status(500).json({
      gemma: {
        status: "error",
        model: OPENROUTER_MODEL,
        remaining: "unknown",
        error: String(globalErr?.message || globalErr)
      },
      grok: {
        status: "error",
        model: "groq-grok-llama-3.3",
        remaining: "unknown",
        error: String(globalErr?.message || globalErr)
      }
    });
  }
});

// Products API (DynamoDB-backed)
app.get("/api/products", (req: Request, res: Response) => {
  res.json(dbProducts);
});

app.post("/api/upload-image", async (req: Request, res: Response) => {
  try {
    const { productId, fileName, base64Data, contentType } = req.body;
    if (!base64Data) {
      return res.status(400).json({ error: "Missing image data" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: "Supabase not configured on the server" });
    }

    const buffer = Buffer.from(base64Data, "base64");
    const storagePath = `products/${productId}/${Date.now()}-${fileName || "image"}.webp`;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/product-images/${storagePath}`;

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": contentType || "image/webp",
        "x-upsert": "true",
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("[Supabase] Upload failed:", uploadRes.status, errText);
      return res.status(500).json({ error: "Image upload failed" });
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/product-images/${storagePath}`;
    res.json({ url: publicUrl });
  } catch (err) {
    console.error("[Supabase] Upload route error:", err);
    res.status(500).json({ error: "Image upload failed" });
  }
});

app.post("/api/products", async (req: Request, res: Response) => {
  const newItem: any = {
    id: `prod-${Date.now()}`,
    ...req.body,
  };
  if (typeof newItem.quantity === "number") {
    newItem.inStock = newItem.quantity > 0;
  }
  try {
    await ddb.send(new PutCommand({ TableName: PRODUCTS_TABLE, Item: newItem }));
    dbProducts.push(toFrontendProduct(newItem));
    res.status(201).json(toFrontendProduct(newItem));
  } catch (err) {
    console.error("[DynamoDB] Failed to add product:", err);
    res.status(500).json({ error: "Failed to save product to database" });
  }
});

app.put("/api/products/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = dbProducts.findIndex((p) => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Product not found" });
  }
  const updated: any = { ...dbProducts[idx], ...req.body, id };
  if (typeof updated.quantity === "number") {
    updated.inStock = updated.quantity > 0;
  }
  try {
    await ddb.send(new PutCommand({ TableName: PRODUCTS_TABLE, Item: updated }));
    dbProducts[idx] = toFrontendProduct(updated);
    res.json(dbProducts[idx]);
  } catch (err) {
    console.error("[DynamoDB] Failed to update product:", err);
    res.status(500).json({ error: "Failed to update product in database" });
  }
});

app.delete("/api/products/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = dbProducts.findIndex((p) => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Product not found" });
  }
  try {
    await ddb.send(new DeleteCommand({ TableName: PRODUCTS_TABLE, Key: { id } }));
    dbProducts.splice(idx, 1);
    res.json({ success: true });
  } catch (err) {
    console.error("[DynamoDB] Failed to delete product:", err);
    res.status(500).json({ error: "Failed to delete product from database" });
  }
});

app.post("/api/products/:id/decrement-stock", async (req: Request, res: Response) => {
  const { id } = req.params;
  const amount = Number(req.body?.amount) || 1;
  const idx = dbProducts.findIndex((p) => p.id === id);

  if (idx === -1 || typeof dbProducts[idx].quantity !== "number") {
    return res.json({ skipped: true });
  }

  try {
    const result: any = await ddb.send(
      new UpdateCommand({
        TableName: PRODUCTS_TABLE,
        Key: { id },
        UpdateExpression: "SET quantity = quantity - :amt, inStock = (quantity - :amt > :zero)",
        ConditionExpression: "quantity >= :amt",
        ExpressionAttributeValues: { ":amt": amount, ":zero": 0 },
        ReturnValues: "ALL_NEW",
      })
    );
    dbProducts[idx] = toFrontendProduct(result.Attributes);
    res.json({ success: true, remaining: result.Attributes.quantity });
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      return res.status(409).json({ error: "Not enough stock" });
    }
    console.error("[DynamoDB] Failed to decrement stock:", err);
    res.status(500).json({ error: "Failed to update stock" });
  }
});

const USERS_TABLE = process.env.DYNAMODB_USERS_TABLE || "fitstyle-ai-Users";

// Comma-separated allowlist, e.g. "hind@example.com,teammate2@example.com"
// Only emails on this list can ever end up with role "owner" -- enforced
// here server-side, never trusted from the client.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function resolveRole(email: string, requestedRole: string | undefined): "shopper" | "owner" {
  if (requestedRole === "owner" && ADMIN_EMAILS.includes((email || "").toLowerCase())) {
    return "owner";
  }
  return "shopper";
}

// Users API (DynamoDB-backed) -- profile is keyed by Cognito's userId (uid)
app.get("/api/users/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result: any = await ddb.send(
      new GetCommand({
        TableName: USERS_TABLE,
        Key: { userId: id },
      })
    );
    if (!result.Item) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(result.Item);
  } catch (err) {
    console.error("[DynamoDB] Failed to fetch user:", err);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

app.put("/api/users/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const profile = {
    ...req.body,
    uid: id,
    userId: id,
    role: resolveRole(req.body.email, req.body.role), // server has final say, not the client
  };
  try {
    await ddb.send(new PutCommand({ TableName: USERS_TABLE, Item: profile }));
    res.json(profile);
  } catch (err) {
    console.error("[DynamoDB] Failed to save user:", err);
    res.status(500).json({ error: "Failed to save user profile" });
  }
});

app.delete("/api/users/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await ddb.send(new DeleteCommand({ TableName: USERS_TABLE, Key: { userId: id } }));
    res.json({ success: true });
  } catch (err) {
    console.error("[DynamoDB] Failed to delete user profile:", err);
    res.status(500).json({ error: "Failed to delete user profile" });
  }
});

const MEASUREMENTS_TABLE = process.env.DYNAMODB_MEASUREMENTS_TABLE || "fitstyle-ai-Measurements";
const ORDERS_TABLE = process.env.DYNAMODB_ORDERS_TABLE || "fitstyle-ai-Orders";

// Measurements API -- one item per user (hash key userId), replaces the old
// Firestore users/{uid}/bodyProfile/current subcollection document.
app.get("/api/measurements/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    const result: any = await ddb.send(
      new GetCommand({ TableName: MEASUREMENTS_TABLE, Key: { userId } })
    );
    if (!result.Item) {
      return res.status(404).json({ error: "No measurements saved yet" });
    }
    res.json(result.Item);
  } catch (err) {
    console.error("[DynamoDB] Failed to fetch measurements:", err);
    res.status(500).json({ error: "Failed to fetch measurements" });
  }
});

app.put("/api/measurements/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  const item = { ...req.body, userId };
  try {
    await ddb.send(new PutCommand({ TableName: MEASUREMENTS_TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error("[DynamoDB] Failed to save measurements:", err);
    res.status(500).json({ error: "Failed to save measurements" });
  }
});

// Orders API -- one item per order (hash key orderId), replaces the old
// Firestore users/{uid}/orderHistory/{orderId} subcollection.
// Listing "my orders" uses Scan+filter rather than a Global Secondary Index --
// simpler and avoids allocating extra RCU/WCU out of our 25/25 free-tier
// budget. Fine at this project's scale; revisit if the Orders table grows large.
app.get("/api/orders/user/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    const result: any = await ddb.send(
      new ScanCommand({
        TableName: ORDERS_TABLE,
        FilterExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId },
      })
    );
    res.json(result.Items || []);
  } catch (err) {
    console.error("[DynamoDB] Failed to list orders:", err);
    res.status(500).json({ error: "Failed to list orders" });
  }
});

app.put("/api/orders/:orderId", async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const item = { ...req.body, orderId };
  try {
    await ddb.send(new PutCommand({ TableName: ORDERS_TABLE, Item: item }));
    res.json(item);
  } catch (err) {
    console.error("[DynamoDB] Failed to save order:", err);
    res.status(500).json({ error: "Failed to save order" });
  }
});

// List all users -- used by the admin Sales Analytics dashboard (e.g. active
// signup count). Small dataset (admin-only usage, infrequent), Scan is fine.
app.get("/api/users", async (req: Request, res: Response) => {
  try {
    const result: any = await ddb.send(new ScanCommand({ TableName: USERS_TABLE }));
    res.json(result.Items || []);
  } catch (err) {
    console.error("[DynamoDB] Failed to list users:", err);
    res.status(500).json({ error: "Failed to list users" });
  }
});

// Analytics feed for the admin Sales Analytics dashboard. Joins Orders +
// Users + Measurements server-side (was 3 separate Firestore real-time
// listeners with nested reads) into the exact shape the dashboard already
// expects. No push/real-time here -- the frontend polls this on an interval
// instead, which is the simplest free-tier-safe substitute for Firestore's
// onSnapshot (a true push mechanism would mean API Gateway WebSockets +
// DynamoDB Streams, more moving parts than this project needs).
app.get("/api/analytics/orders", async (req: Request, res: Response) => {
  try {
    const [usersResult, measurementsResult, ordersResult]: any[] = await Promise.all([
      ddb.send(new ScanCommand({ TableName: USERS_TABLE })),
      ddb.send(new ScanCommand({ TableName: MEASUREMENTS_TABLE })),
      ddb.send(new ScanCommand({ TableName: ORDERS_TABLE })),
    ]);

    const usersById: Record<string, any> = {};
    (usersResult.Items || []).forEach((u: any) => { usersById[u.userId || u.uid] = u; });

    const measurementsById: Record<string, any> = {};
    (measurementsResult.Items || []).forEach((m: any) => { measurementsById[m.userId] = m; });

    const analyticsOrders = (ordersResult.Items || []).map((order: any) => {
      const user = usersById[order.userId] || {};
      const measurements = measurementsById[order.userId] || {};

      const outfit = order.outfit || {};
      const itemsArr: string[] = [];
      if (outfit.top) itemsArr.push(outfit.top.name);
      if (outfit.bottom) itemsArr.push(outfit.bottom.name);
      if (outfit.footwear) itemsArr.push(outfit.footwear.name);
      if (outfit.accessories) itemsArr.push(outfit.accessories.name);

      let computedOccasion = "Casual";
      if (outfit.top) {
        const matchedProd = dbProducts.find((p: any) => p.id === outfit.top.id);
        if (matchedProd && matchedProd.occasion) computedOccasion = matchedProd.occasion;
      }

      return {
        orderId: order.orderId,
        date: order.date || new Date().toISOString(),
        totalAmount: Number(order.totalAmount) || 0,
        sizing: order.sizing || "M",
        shippingAddress: order.shippingAddress || "FitStyle Elite Resident",
        customerName: user.fullName || "Elite Resident",
        customerEmail: user.email || "shopper@fitstyle.ai",
        occasion: computedOccasion,
        bodyShape: measurements.classifyDetails?.shape || "Hourglass",
        skinTone: measurements.sizeRecommendation?.skinTone || "Olive",
        status: "Completed",
        items: itemsArr.length > 0 ? itemsArr : ["Apparel Pack"],
        itemsCount: itemsArr.length || 1,
      };
    });

    analyticsOrders.sort((a: any, b: any) => b.date.localeCompare(a.date));
    res.json(analyticsOrders);
  } catch (err) {
    console.error("[DynamoDB] Failed to build analytics feed:", err);
    res.status(500).json({ error: "Failed to build analytics feed" });
  }
});

function fallbackColors(skinTone: string, undertone: string): { name: string, hex: string }[] {
  const sk = (skinTone || "Medium").toLowerCase();
  const ut = (undertone || "Warm").toLowerCase();

  if (sk.includes("fair")) {
    if (ut.includes("warm")) {
      return [
        { name: "Peach", hex: "#FFCBA4" },
        { name: "Gold", hex: "#FFD700" },
        { name: "Coral", hex: "#FF7F50" },
        { name: "Ivory", hex: "#FFFFF0" }
      ];
    } else {
      return [
        { name: "Lavender", hex: "#E6E6FA" },
        { name: "Ice Blue", hex: "#F0F8FF" },
        { name: "Rose", hex: "#FFC0CB" },
        { name: "Silver", hex: "#C0C0C0" }
      ];
    }
  } else if (sk.includes("olive")) {
    return [
      { name: "Mustard", hex: "#FFDB58" },
      { name: "Forest Green", hex: "#228B22" },
      { name: "Rust", hex: "#B7410E" },
      { name: "Camel", hex: "#C19A6B" }
    ];
  } else if (sk.includes("dark") || sk.includes("black")) {
    if (ut.includes("warm")) {
      return [
        { name: "Cobalt", hex: "#0047AB" },
        { name: "Emerald", hex: "#50C878" },
        { name: "Fuchsia", hex: "#FF00FF" },
        { name: "Gold", hex: "#FFD700" }
      ];
    } else {
      return [
        { name: "Royal Purple", hex: "#7851A9" },
        { name: "Teal", hex: "#008080" },
        { name: "Crimson", hex: "#DC143C" },
        { name: "Silver", hex: "#C0C0C0" }
      ];
    }
  } else {
    // Default to Medium or standard fallback match
    if (ut.includes("cool")) {
      return [
        { name: "Dusty Rose", hex: "#DCAE96" },
        { name: "Navy", hex: "#000080" },
        { name: "Mauve", hex: "#E0B0FF" },
        { name: "Cool Grey", hex: "#808080" }
      ];
    } else {
      return [
        { name: "Terracotta", hex: "#E2725B" },
        { name: "Sage", hex: "#8FBC8F" },
        { name: "Warm Beige", hex: "#F5F5DC" },
        { name: "Burnt Orange", hex: "#CC5500" }
      ];
    }
  }
}

// Analyze Body Endpoint using FitVerse local measurement service with Qwen fallback
app.post("/api/analyze-body", async (req: Request, res: Response) => {
  const { imageBase64, heightCm, weightKg, occasion: userOccasion } = req.body;
  const targetOccasion = userOccasion || "Casual";

  if (!imageBase64) {
    return res.status(400).json({ error: "Image data is required for personal Haute Stylist calibration." });
  }

  // Parse mimeType & raw base64 data from Data URL or HTTP URL
  let mimeType = "image/jpeg";
  let data = imageBase64;
  if (imageBase64.includes(";base64,")) {
    const parts = imageBase64.split(";base64,");
    mimeType = parts[0].replace("data:", "");
    data = parts[1];
  } else if (imageBase64.startsWith("http://") || imageBase64.startsWith("https://")) {
    try {
      console.log("[INFO] Fetching image representation from URL:", imageBase64);
      const imgRes = await fetch(imageBase64);
      if (imgRes.ok) {
        const arrayBuffer = await imgRes.arrayBuffer();
        data = Buffer.from(arrayBuffer).toString("base64");
        const contentType = imgRes.headers.get("content-type");
        if (contentType) {
          mimeType = contentType;
        }
        console.log("[INFO] Successfully fetched and converted URL image to base64.");
      } else {
        console.log(`[INFO] Image fetch returned status ${imgRes.status}`);
      }
    } catch (urlErr: any) {
      console.log("[INFO] Failed to fetch layout image from URL:", urlErr?.message || String(urlErr));
    }
  }

  // Set default initial step 1 fallback structure
  let step1Data: any = {
    height_cm_range: "165-175 cm",
    shoulders_in: 34,
    waist_in: 26,
    hips_in: 35,
    silhouette: "Hourglass",
    skin_tone: "Medium",
    undertone: "Neutral",
    suggested_size: "M",
    confidence: "High",
    color_palette: fallbackColors("Medium", "Neutral")
  };

  // Validate the resulting data string after fetching is fully processed
  const base64ImageData = data || "";
  console.log("Image bytes length:", base64ImageData.length);

  const looksLikeBase64 = base64ImageData && !base64ImageData.startsWith("http://") && !base64ImageData.startsWith("https://") && base64ImageData.trim().length > 100;

  console.log(`[INFO] Image data validation: looksLikeBase64=${looksLikeBase64}, dataLength=${base64ImageData.length}`);

  // Run Step 1: Vision/Text estimation extraction using Qwen Vision via OpenRouter
  if (looksLikeBase64) {
    const analysisKey = `analysis_${Date.now()}`;
    console.log("Analyzing new image:", analysisKey);

    try {
      const step1Prompt = `You are an expert body measurement analyst for a fashion AI system.
Analyze this photo and extract accurate body measurements.

CRITICAL RULES:
1. ALWAYS measure the SKELETON/FRAME underneath clothing, NOT the clothing itself
2. Dark, baggy, or oversized clothing HIDES the real body — look at:
   - Neck width to estimate shoulder width
   - Wrist size to estimate overall frame
   - Visible ankle/calf to estimate hip width
   - Posture and spine line for height

MEASUREMENT GUIDELINES:

SHOULDERS:
- Normal female range: 14-18 inches
- If clothing is baggy → add 1-2 inches to visible estimate
- Minimum realistic value: 13 inches
- Maximum realistic value: 20 inches

WAIST:
- Normal female range: 24-36 inches
- Never report waist larger than hips
- If dress/coat hides waist → estimate from rib cage visibility

HIPS:
- Normal female range: 34-46 inches
- Hips must ALWAYS be at least 6 inches larger than waist
- If pants/skirt hides hips → estimate from thigh gap and stance width
- Minimum hip = waist + 4 inches (absolute rule)

BODY SHAPE RULES (strictly follow):
- Hourglass: hips ≈ shoulders, waist 8-12in smaller than both
- Pear: hips > shoulders by 3+ inches
- Apple: waist ≈ hips, fuller midsection
- Rectangle: shoulders ≈ waist ≈ hips (difference < 4in)
- Inverted Triangle: shoulders > hips by 3+ inches
- NEVER assign Hourglass if hips - waist < 6 inches

SIZE CHART (use hips as primary measurement):
- XS: hips 33-34in
- S:  hips 35-36in
- M:  hips 37-38in
- L:  hips 39-41in
- XL: hips 42-44in
- XXL: hips 45-47in
- NEVER assign XL unless hips > 41 inches

CONFIDENCE SCORING:
- HIGH: person wearing fitted/tight clothing, clear body outline
- MEDIUM: person wearing normal casual clothing, light-colored loose/flowy dresses, white or pastel garments where body outline is visible
- LOW: person wearing DARK (black/navy/dark grey) baggy or layered clothing where body shape is completely hidden
  → Only assign LOW if the clothing is both dark-colored AND body shape is completely undetectable
  → Light-colored loose clothing (white, cream, pastel) = MEDIUM at minimum, never LOW
  → If LOW confidence: add 10-15% to hip and waist estimates

OUTPUT FORMAT (return exact JSON):
{
  "shoulders_in": number,
  "waist_in": number,
  "hips_in": number,
  "height_cm": number,
  "weight_kg": number,
  "body_shape": "Hourglass|Pear|Apple|Rectangle|InvertedTriangle",
  "skin_tone": "Fair|Light|Medium|Tan|Deep",
  "undertone": "Warm|Neutral|Cool",
  "suggested_size": "XS|S|M|L|XL|XXL",
  "confidence": "High|Medium|Low",
  "confidence_reason": "brief explanation why",
  "clothing_interference": true|false,
  "warnings": ["list any measurement concerns here"]
}

VALIDATION BEFORE RETURNING:
✓ hips > waist (always)
✓ hips >= waist + 4 (minimum)
✓ body_shape matches the actual numbers
✓ suggested_size matches the hip measurement chart
✓ if clothing_interference is true AND clothing is dark-colored → confidence must be Low or Medium
✓ if clothing_interference is true BUT clothing is light/white/pastel → confidence can still be Medium`;

      console.log("=== IMAGE DATA CHECK ===");
      console.log("base64 length:", base64ImageData?.length || "MISSING");
      console.log("mimeType:", mimeType || "MISSING");

      // Body-shape canonical -> the exact casing the rest of this endpoint expects
      const BODY_SHAPE_LABELS: Record<string, string> = {
        pear: "Pear",
        hourglass: "Hourglass",
        apple: "Apple",
        rectangle: "Rectangle",
        inverted_triangle: "InvertedTriangle",
        unknown: "Hourglass",
      };

      let responseText = "{}";
      let usedFitVerse = false;

      // Try the real FitVerse (MediaPipe) model first -- local, free, no API key needed.
      try {
        console.log("[INFO] Attempting body analysis via local FitVerse measurement service...");
        const fitVerseRes = await fetch("http://localhost:5001/detect-size", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: `data:${mimeType};base64,${base64ImageData}`, heightCm: heightCm || 165 }),
          signal: AbortSignal.timeout(15000),
        });

        if (fitVerseRes.ok) {
          const fv = await fitVerseRes.json();
          const m = fv.measurements || {};
          const shouldersIn = m.shoulder ? m.shoulder / 2.54 : 14;
          const hipsIn = m.hip ? m.hip / 2.54 : 36;
          const waistIn = m.waist ? m.waist / 2.54 : Math.max(20, hipsIn - 6);
          const clothingInterference = fv.waist_method === "proportional_fallback";

          responseText = JSON.stringify({
            shoulders_in: Number(shouldersIn.toFixed(1)),
            waist_in: Number(waistIn.toFixed(1)),
            hips_in: Number(hipsIn.toFixed(1)),
            height_cm: m.height_cm || heightCm || 165,
            weight_kg: weightKg || 58,
            body_shape: BODY_SHAPE_LABELS[fv.body_shape] || "Hourglass",
            skin_tone: "Medium",
            undertone: "Neutral",
            suggested_size: fv.recommended_size || "M",
            confidence: fv.waist_confidence === "high" ? "High" : fv.waist_confidence === "low" ? "Low" : "Medium",
            confidence_reason: `Waist measured via ${fv.waist_method || "unknown"} method (MediaPipe pose + segmentation).`,
            clothing_interference: clothingInterference,
            warnings: clothingInterference
              ? ["Waist estimate used a proportional fallback -- loose clothing may reduce accuracy."]
              : [],
            annotated_image_base64: fv.annotated_image_base64
              ? `data:image/jpeg;base64,${fv.annotated_image_base64}`
              : null,
            line_positions: fv.line_positions || null,
          });
          usedFitVerse = true;
          console.log("[INFO] FitVerse measurement succeeded.");
        } else {
          console.log("[INFO] FitVerse service returned an error status, falling back to Qwen.");
        }
      } catch (fitVerseErr: any) {
        console.log("[INFO] FitVerse service unreachable (is body_measurement_service.py running?), falling back to Qwen:", fitVerseErr.message);
      }

      if (!usedFitVerse) {
        const key = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_1;
        if (!key || key.trim() === "") {
          return res.status(500).json({
            error: "FitVerse service is unreachable and OPENROUTER_API_KEY is not configured as a fallback. Start body_measurement_service.py or set OPENROUTER_API_KEY in .env.",
          });
        }
        console.log("[INFO] Attempting visual body analysis with Qwen Vision (multimodal)...");
        try {
          responseText = await callOpenRouter([
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `${step1Prompt}\n\nClient-Provided Metadata for Guidelines:\nHeight Context: ${heightCm || 165} cm\nWeight Context: ${weightKg || 58} kg\nTarget Occasion Context: ${targetOccasion}`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64ImageData}`
                  }
                }
              ]
            }
          ], true);
        } catch (imageErr: any) {
          console.log(`[INFO] Qwen Vision multimodal call fallback triggered due to: ${imageErr.message}`);
          // Text-based fallback
          responseText = await callOpenRouter([
            {
              role: "user",
              content: `${step1Prompt}\n\nClient-Provided Metadata for Sizing Estimation:\nHeight: ${heightCm || 165} cm\nWeight: ${weightKg || 58} kg\nTarget Occasion: ${targetOccasion}\n\nPlease perform precise mathematical estimation based on this biometric data to return matching JSON.`
            }
          ], true);
        }
      }

      console.log("=== RAW response (FitVerse or Qwen) ===", responseText);

      try {
        const rawJsonText = responseText.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(rawJsonText);
        
        let shoulders = Number(parsed.shoulders_in) || 34;
        let waist = Number(parsed.waist_in) || 26;
        let hips = Number(parsed.hips_in) || 35;
        let confidence = parsed.confidence || "High";
        // Only flag as obscuring if the model explicitly said clothing_interference AND confidence is truly Low
        // Medium confidence with clothing_interference should NOT be treated as fully obscured
        let is_clothing_obscuring = parsed.clothing_interference === true && String(confidence).toLowerCase() === "low";
        let body_shape = parsed.body_shape || "Hourglass";
        let suggested_size = parsed.suggested_size || "M";

        // IMPORVED LOGIC RULES:
        // Rule 1: If clothing is dark/baggy, increase hip estimate by 15-20%
        if (is_clothing_obscuring) {
          hips = hips * 1.18;
        }

        // Rule 3: If shoulders < 15in, downgrade confidence at most one step, never force to Low
        if (shoulders < 15) {
          if (confidence === "High") confidence = "Medium";
          // Only force Low if it was already Medium AND clothing is dark/obscuring
          else if (confidence === "Medium" && is_clothing_obscuring) confidence = "Low";
          shoulders = Math.max(15.0, shoulders + 1.5);
          if (!parsed.warnings) parsed.warnings = [];
          if (!parsed.warnings.includes("Shoulders under 15in benchmark. Calibrating skeletal offset.")) {
            parsed.warnings.push("Shoulders under 15in benchmark. Calibrating skeletal offset.");
          }
        }

        // Rule 2: Hips must always be >= waist + 6 inches for hourglass shape
        if (body_shape.toLowerCase() === "hourglass") {
          if (hips < waist + 6) {
            hips = waist + 6;
          }
        }

        // Rule 4: Size XL requires hips > 40in — validate size vs measurements
        if (suggested_size === "XL") {
          if (hips <= 40) {
            hips = 41.5;
          }
        } else if (hips > 40 && suggested_size !== "XL" && suggested_size !== "XXL") {
          suggested_size = "XL";
        }

        shoulders = Math.round(shoulders * 10) / 10;
        waist = Math.round(waist * 10) / 10;
        hips = Math.round(hips * 10) / 10;

        step1Data = {
          silhouette: body_shape,
          suggested_size: suggested_size,
          skin_tone: parsed.skin_tone || "Medium",
          undertone: parsed.undertone || "Neutral",
          confidence: confidence,
          color_palette: parsed.color_palette || fallbackColors(parsed.skin_tone || "Medium", parsed.undertone || "Neutral"),
          shoulders_in: shoulders,
          waist_in: waist,
          hips_in: hips,
          clothing_interference: is_clothing_obscuring,
          warnings: parsed.warnings || [],
          confidence_reason: parsed.confidence_reason || "",
          annotated_image_base64: parsed.annotated_image_base64 || null,
          line_positions: parsed.line_positions || null
        };

        if (parsed.height_cm) {
          step1Data.height_cm = Number(parsed.height_cm);
          step1Data.height_cm_range = `${parsed.height_cm - 5}-${parsed.height_cm + 5} cm`;
        } else {
          step1Data.height_cm = heightCm || 165;
          step1Data.height_cm_range = `${(heightCm || 165) - 5}-${(heightCm || 165) + 5} cm`;
        }

        if (parsed.weight_kg) {
          step1Data.weight_kg = Number(parsed.weight_kg);
        } else {
          step1Data.weight_kg = weightKg || 58;
        }

      } catch (parseError) {
        console.error("JSON parse failed:", parseError);
        step1Data = {};
      }

      console.log("=== PARSED step1Data ===", JSON.stringify(step1Data));
      console.log("=== SUGGESTED SIZE VALUE ===", step1Data?.suggested_size);

      // Populate other key attributes cleanly using intelligent estimations as fallback
      const fallbackHeightIn = (heightCm || 165) / 2.54;
      const bmi = (weightKg || 58) / Math.pow((heightCm || 165)/100, 2);
      const estimatedWaist = Math.round(fallbackHeightIn * 0.36 + (bmi - 21) * 0.8);
      const estimatedShoulders = Math.round(fallbackHeightIn * 0.22 + (bmi - 21) * 0.3);
      const estimatedHips = Math.round(fallbackHeightIn * 0.38 + (bmi - 21) * 1.0);

      // Assign attributes
      step1Data.silhouette = step1Data.silhouette || (bmi > 27 ? "Apple" : bmi < 19 ? "Rectangle" : "Hourglass");
      step1Data.shoulders_in = step1Data.shoulders_in || estimatedShoulders;
      step1Data.waist_in = step1Data.waist_in || estimatedWaist;
      step1Data.hips_in = step1Data.hips_in || estimatedHips;
      step1Data.suggested_size = step1Data.suggested_size || "M";
      step1Data.confidence = step1Data.confidence || "Medium";
      step1Data.skin_tone = step1Data.skin_tone || "Medium";
      step1Data.undertone = step1Data.undertone || "Neutral";
      step1Data.height_cm_range = step1Data.height_cm_range || `${Math.round((heightCm || 165) - 5)}-${Math.round((heightCm || 165) + 5)} cm`;
      step1Data.height_cm = step1Data.height_cm || heightCm || 165;
      step1Data.clothing_interference = step1Data.clothing_interference || false;
      step1Data.warnings = step1Data.warnings || [];
      step1Data.confidence_reason = step1Data.confidence_reason || "";

      if (!step1Data.color_palette || !Array.isArray(step1Data.color_palette) || step1Data.color_palette.length === 0) {
        step1Data.color_palette = fallbackColors(step1Data.skin_tone, step1Data.undertone);
      }

      if (step1Data.photo_quality === 'unusable') {
        return res.status(422).json({
          error: "unusable_photo",
          message: step1Data.photo_quality_reason || 
          "Please upload a real full-body photograph, not a cartoon or illustration."
        });
      }
    } catch (apiError: any) {
      console.log(`[INFO] Qwen API returned error: ${apiError?.message || apiError}. Activating smart real-time estimation fallback.`);

      const fallbackHeightIn = (heightCm || 165) / 2.54;
      const bmi = (weightKg || 58) / Math.pow((heightCm || 165)/100, 2);
      let estimatedWaist = Math.round(fallbackHeightIn * 0.36 + (bmi - 21) * 0.8);
      let estimatedShoulders = Math.round(fallbackHeightIn * 0.22 + (bmi - 21) * 0.3);
      let estimatedHips = Math.round(fallbackHeightIn * 0.38 + (bmi - 21) * 1.0);
      let confidence = "High";
      let body_shape = bmi > 27 ? "Apple" : bmi < 19 ? "Rectangle" : "Hourglass";

      if (estimatedShoulders < 15) {
        confidence = "Low";
        estimatedShoulders = 15.2;
      }
      if (body_shape === "Hourglass" && estimatedHips < estimatedWaist + 6) {
        estimatedHips = estimatedWaist + 6;
      }
      let estSize = "M";
      if (estimatedHips > 40) {
        estSize = "XL";
      } else if (estimatedHips < 34) {
        estSize = "XS";
      } else if (estimatedHips < 36) {
        estSize = "S";
      } else if (estimatedHips < 38) {
        estSize = "M";
      } else {
        estSize = "L";
      }

      console.warn("[WARNING] Qwen API offline or expired key. Reverting to smart real-time estimations fallback.");

      step1Data = {
        suggested_size: estSize,
        silhouette: body_shape,
        shoulders_in: Math.round(estimatedShoulders * 10) / 10,
        waist_in: Math.round(estimatedWaist * 10) / 10,
        hips_in: Math.round(estimatedHips * 10) / 10,
        confidence: confidence,
        skin_tone: "Medium",
        undertone: "Neutral",
        height_cm_range: `${Math.round((heightCm || 165) - 5)}-${Math.round((heightCm || 165) + 5)} cm`,
        height_cm: heightCm || 165,
        weight_kg: weightKg || 58,
        color_palette: fallbackColors("Medium", "Neutral"),
        clothing_interference: false,
        warnings: [],
        confidence_reason: "Algorithmic regression evaluation"
      };
    }
  } else {
    console.log("[INFO] Qwen vision analysis skipped (no base64 data or client not active). Running algorithmic sizing calibration...");
    const heightIn = (heightCm || 165) / 2.54;
    const bmi = (weightKg || 58) / Math.pow((heightCm || 165)/100, 2);
    let estimatedWaist = Math.round(heightIn * 0.36 + (bmi - 21) * 0.8);
    let estimatedShoulders = Math.round(heightIn * 0.22 + (bmi - 21) * 0.3);
    let estimatedHips = Math.round(heightIn * 0.38 + (bmi - 21) * 1.0);
    let confidence = "High";
    let body_shape = bmi > 27 ? "Apple" : bmi < 19 ? "Rectangle" : "Hourglass";

    if (estimatedShoulders < 15) {
      confidence = "Low";
      estimatedShoulders = 15.2;
    }
    if (body_shape === "Hourglass" && estimatedHips < estimatedWaist + 6) {
      estimatedHips = estimatedWaist + 6;
    }
    let estSize = "M";
    if (estimatedHips > 40) {
      estSize = "XL";
    } else if (estimatedHips < 34) {
      estSize = "XS";
    } else if (estimatedHips < 36) {
      estSize = "S";
    } else if (estimatedHips < 38) {
      estSize = "M";
    } else {
      estSize = "L";
    }

    step1Data.shoulders_in = step1Data.shoulders_in || Math.round(estimatedShoulders * 10) / 10;
    step1Data.waist_in = step1Data.waist_in || Math.round(estimatedWaist * 10) / 10;
    step1Data.hips_in = step1Data.hips_in || Math.round(estimatedHips * 10) / 10;
    step1Data.suggested_size = estSize;
    step1Data.height_cm_range = `${Math.round((heightCm || 165) - 5)}-${Math.round((heightCm || 165) + 5)} cm`;
    step1Data.height_cm = heightCm || 165;
    step1Data.weight_kg = weightKg || 58;
    step1Data.skin_tone = "Medium";
    step1Data.undertone = "Neutral";
    step1Data.color_palette = fallbackColors("Medium", "Neutral");
    step1Data.confidence = confidence;
    step1Data.clothing_interference = false;
    step1Data.warnings = [];
    step1Data.confidence_reason = "Manual calibration sizing template";
  }

  // STAGE 2 — Grok: Style Recommendation Based on Detected Size
  const grokApiKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1;
  let recommendedProductIds: string[] = [];
  const occasionFilteredProducts = dbProducts.filter(
    (p: any) =>
      p.occasion?.toLowerCase() === targetOccasion.toLowerCase() &&
      (p.category === "top" || p.category === "bottom")
  );

  if (occasionFilteredProducts.length === 0) {
    console.log(`[WARNING] No top/bottom products found for occasion: ${targetOccasion}`);
  }

  const isWeddingOccasion = targetOccasion.toLowerCase() === "wedding";
  const grokPrompt = isWeddingOccasion
    ? `A shopper has the following body metrics detected by AI vision:
${JSON.stringify(step1Data, null, 2)}
Their selected occasion is: ${targetOccasion} (Bridal/Wedding event).
From the available product catalog below, recommend:
- 1 Wedding dress (category: top) only — this serves as the full outfit.

IMPORTANT: Do NOT recommend any bottom, footwear, shoes, accessories, bags, or jewelry.
For Wedding occasion, a dress (category: top) IS the complete outfit — no bottom is needed.
Only recommend products with category 'top' that are in the Wedding catalog.
Return ONLY a JSON array with exactly 1 product ID (the wedding dress).
Do not recommend any product not present in the catalog.
Product catalog: ${JSON.stringify(occasionFilteredProducts, null, 2)}`
    : `A shopper has the following body metrics detected by AI vision:
${JSON.stringify(step1Data, null, 2)}
Their selected occasion is: ${targetOccasion}
(Formal / Casual / Party).
From the available product catalog below, recommend:
- 1 Top Layer outfit (category: top) only
- 1 Bottom Fit outfit (category: bottom) only

Do NOT recommend any footwear, shoes, accessories,
accents, bags, jewelry, or any non-clothing items.
Only recommend products with category 'top' or 'bottom'.
Return ONLY a JSON array of recommended product IDs from the catalog.
Do not recommend any product not present in the catalog.
Product catalog: ${JSON.stringify(occasionFilteredProducts, null, 2)}`;

  try {
    const grokResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${grokApiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: "You are fitstyle AI elite coordinator. You must return ONLY a raw JSON array of recommended product IDs from the catalog for TOP and BOTTOM clothing only. e.g. [\"prod-1\", \"prod-2\"] Do not include footwear, accessories, or accents. Do not include markdown blocks or explanations."
          },
          {
            role: "user",
            content: grokPrompt
          }
        ],
        temperature: 0.1
      })
    });

    if (!grokResponse.ok) {
      throw new Error(`Grok API returned HTTP status ${grokResponse.status}`);
    }

    const grokResData = await grokResponse.json();
    const content = grokResData.choices?.[0]?.message?.content || "[]";
    let cleanGrokJson = content.trim();
    if (cleanGrokJson.startsWith("```json")) {
      cleanGrokJson = cleanGrokJson.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (cleanGrokJson.startsWith("```")) {
      cleanGrokJson = cleanGrokJson.replace(/^```/, "").replace(/```$/, "").trim();
    }

    const parsedIds = JSON.parse(cleanGrokJson);
    if (Array.isArray(parsedIds)) {
      recommendedProductIds = parsedIds;
      console.log("[INFO] Grok style recommendation retrieved IDs:", recommendedProductIds);
    }
  } catch (err: any) {
    console.log(`[WARNING] Grok API call failed: ${err?.message || err}. Silently logging error.`);
  }

  const chooseProduct = (category: string, occasion: string, candidateIds: string[]) => {
    const lowerOccasion = occasion.toLowerCase();
    let product = occasionFilteredProducts.find(p =>
      candidateIds.includes(p.id) &&
      p.category === category &&
      p.occasion.toLowerCase() === lowerOccasion
    );
    if (!product) {
      product = occasionFilteredProducts.find(p =>
        p.category === category && p.occasion.toLowerCase() === lowerOccasion
      );
    }
    return product || null;
  };

  // Load products in local catalog matching recommended IDs, but prefer the selected occasion
  let topItem = chooseProduct("top", targetOccasion, recommendedProductIds);
  // For Wedding: dress (top) is the complete outfit — no bottom needed
  let bottomItem = isWeddingOccasion ? null : chooseProduct("bottom", targetOccasion, recommendedProductIds);

  // Map to the outfit_coordinates layout output
  const outfitCoordinates = [
    topItem ? {
      category: "TOP_LAYER",
      id: topItem.id,
      name: topItem.name,
      price_usd: topItem.price,
      image: topItem.image,
      color: { name: topItem.colour, hex: "#FAEDF5" }
    } : null,
    bottomItem ? {
      category: "BOTTOM_FIT",
      id: bottomItem.id,
      name: bottomItem.name,
      price_usd: bottomItem.price,
      image: bottomItem.image,
      color: { name: bottomItem.colour, hex: "#FAEDF5" }
    } : null
  ].filter(Boolean);

  // Generate dynamic empowering stylist comments
  const stylistLog = {
    harmony_analysis: `Our Qwen Sizing analysis calibrated your elegant ${step1Data.silhouette} framework. Grok searched the curated atelier database and recommended absolute luxury fits matching your ${step1Data.skin_tone} tone and ${step1Data.undertone} presence for high-impact ${targetOccasion} styling.`,
    silhouette_calibration: `With visual dimensions of Shoulders: ${step1Data.shoulders_in}in, Waist: ${step1Data.waist_in}in, Hips: ${step1Data.hips_in}in (calibrated to actual: ${Math.round(step1Data.hips_in * 1.7)}in), your suggested Size ${step1Data.suggested_size} outline is highlighted gracefully.`,
    color_palette: (step1Data.color_palette || []).map((col: any) => {
      let hexVal = col.hex || "#E8D8C8";
      if (!hexVal.startsWith("#")) hexVal = "#" + hexVal;
      return {
        color_name: col.name || col.color_name || "Warm Beige",
        hex: hexVal,
        role: "NEUTRAL",
        why: "Perfect accent for your calibrated presentation."
      };
    })
  };

  const finalMerged = {
    body_analysis: {
      shoulders_in: step1Data.shoulders_in,
      waist_in: step1Data.waist_in,
      hips_in: step1Data.hips_in,
      body_shape: step1Data.silhouette,
      body_shape_description: `Elegant symmetry aligned around a classic ${step1Data.silhouette} posture structure. Ideal for bespoke atelier tailoring layouts.`,
      recommended_size: step1Data.suggested_size,
      size_range: step1Data.suggested_size,
      skin_tone: step1Data.skin_tone,
      undertone: step1Data.undertone,
      confidence: step1Data.confidence,
      height_cm_range: step1Data.height_cm_range,
      height_cm: step1Data.height_cm,
      weight_kg: step1Data.weight_kg,
      clothing_interference: step1Data.clothing_interference,
      warnings: step1Data.warnings,
      confidence_reason: step1Data.confidence_reason,
      annotated_image_base64: step1Data.annotated_image_base64 || null,
      line_positions: step1Data.line_positions || null
    },
    stylist_log: stylistLog,
    outfit_coordinates: outfitCoordinates,
    engines: {
      vision: OPENROUTER_MODEL,
      styling: "groq-grok-llama-3.3"
    }
  };

  return res.json(finalMerged);
});

async function fileOutputToDataUrl(fileOutput: any): Promise<string | null> {
  let outputUrl = fileOutput?.url || fileOutput?.path || fileOutput;

  if (typeof outputUrl !== "string") {
    return null;
  }

  if (outputUrl.startsWith("data:")) {
    return outputUrl;
  }

  try {
    if (fs.existsSync(outputUrl)) {
      const fileData = fs.readFileSync(outputUrl);
      const base64 = fileData.toString("base64");
      const ext = path.extname(outputUrl).toLowerCase().replace(".", "") || "png";
      return `data:image/${ext};base64,${base64}`;
    }

    if (outputUrl.startsWith("http://") || outputUrl.startsWith("https://")) {
      const fetched = await fetch(outputUrl);
      if (!fetched.ok) {
        throw new Error(`Failed to fetch output image: HTTP ${fetched.status}`);
      }
      const arrayBuffer = await fetched.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");
      const contentType = fetched.headers.get("content-type") || "image/png";
      const mime = contentType.split(";")[0];
      return `data:${mime};base64,${base64}`;
    }
  } catch (err) {
    console.warn("[WARNING] Failed to convert try-on output to data URL:", err);
  }

  return outputUrl;
}

function prepareKolorsImageInput(
  imageData: string,
  prefix: string,
  tempFiles: string[]
) {
  if (imageData.startsWith("data:image/")) {
    const match = imageData.match(/^data:image\/(\w+);base64,/);
    const ext = match ? match[1] : "png";
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const tempPath = path.join(
      process.cwd(),
      `temp_${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`
    );
    fs.writeFileSync(tempPath, base64Data, "base64");
    tempFiles.push(tempPath);
    return handle_file(tempPath);
  }

  if (imageData.startsWith("/") && !imageData.startsWith("//")) {
    const localPath = path.join(process.cwd(), imageData.replace(/^\//, ""));
    if (fs.existsSync(localPath)) {
      return handle_file(localPath);
    }
  }

  return { path: imageData };
}

// STAGE 3 — Hugging Face Kolors Virtual Try-On (server-side proxy)
app.post("/api/try-on", async (req: Request, res: Response) => {
  const { userPhoto, topImage } = req.body;
  const tempSavedFiles: string[] = [];

  if (!userPhoto || !topImage) {
    return res.status(400).json({
      success: false,
      error: "Missing user photo or garment image"
    });
  }

  try {
    console.log("[TryOn] userPhoto length:", userPhoto?.length || 0);
    console.log("[TryOn] topImage:", topImage);

    const personInput = prepareKolorsImageInput(userPhoto, "person", tempSavedFiles);
    const garmentInput = prepareKolorsImageInput(topImage, "garment", tempSavedFiles);

    const hfToken = process.env.HF_TOKEN;
    const client = await Client.connect("Kwai-Kolors/Kolors-Virtual-Try-On", {
      ...(hfToken ? ({ hf_token: hfToken } as any) : {})
    });

    const result = await client.predict(2, [
      personInput,
      garmentInput,
      42,
      false
    ]);

    for (const filePath of tempSavedFiles) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup errors
      }
    }

    const outputImage = await fileOutputToDataUrl(result?.data?.[0]);

    if (!outputImage) {
      throw new Error("Kolors returned no output image");
    }

    return res.json({ success: true, tryOnUrl: outputImage });

  } catch (err: any) {
    console.log("[Kolors Error]", err.message);
    for (const filePath of tempSavedFiles) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup errors
      }
    }
    return res.json({
      success: false,
      tryOnUrl: null,
      error: err.message
    });
  }
});

// Style Advice Endpoint (Powered by process.env.OPENROUTER_API_KEY)
app.post("/api/style-advice", async (req: Request, res: Response) => {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_1;
  if (!key || key.trim() === "") {
    return res.status(500).json({ 
      error: "OPENROUTER_API_KEY is not configured. Please set it in your .env file." 
    });
  }

  const { bodyShape, heightCm, weightKg, size, occasion, items } = req.body;

  const itemNames = items && items.length > 0
    ? items.map((i: any) => `${i.name} (${i.colour}, $${i.price})`).join(", ")
    : "No items selected";

  const prompt = `Synthesize a luxury/personal fashion recommendation for a shopper with the following profile:
- Body Silhouette: ${bodyShape || "Hourglass/Rectangle"}
- Measurements: Height ${heightCm || "170"}cm, Estimated Size: ${size || "M"}
- Occasion Target: ${occasion || "Wedding Gala"}
- Selected Boutique Coordinates: ${itemNames}

Explain how these selected garments accent, balance, and flatter their ${bodyShape} silhouette for a ${occasion} event. Present the feedback in a beautiful, warm, expert tone divided as:
1. "The Harmony Analysis" (Analyzing how the items coordinate with their proportions)
2. "Silhouette Calibration" (Why the shapes, cuts, and colors flatter their structure)
3. "Styling Secret" (One premium styling tip to elevate the look)`;

  try {
    console.log("[INFO] Attempting style advice generation with Qwen...");
    const textResult = await callOpenRouter([
      {
        role: "system",
        content: "You are FitStyle AI's head Haute Couture Stylist. Speak with rich fashion authority, kindness, and elegant taste."
      },
      {
        role: "user",
        content: prompt
      }
    ]);
    if (textResult) {
      return res.json({ advice: textResult });
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.log(`[INFO] Qwen client offline or suspended. Formulating luxury style coordinate locally. Details: ${msg.split("\n")[0]}`);
  }

  // Elegant fallback response if API key is not yet configured or fails
  const mockAdvice = `### The Harmony Analysis
Your selected outfit creates a remarkably balanced line. For your ${bodyShape || "Hourglass"} shape, the pairing of the structured shoulders and waist cinch defines a highly refined silhouette. The colors perfectly complement the mood of a traditional yet contemporary ${occasion} look.

### Silhouette Calibration
At a height of ${heightCm || "172"}cm with a Size ${size || "Medium"}, your proportions benefit from extended silhouettes that elongates columns of color:
- **Flattering volume distribution**: Directs attention to your naturally proportioned lines.
- **Strategic proportions**: Gives an instant feeling of confident posture and seamless flow.

### Styling Secret
*Haute Couture Tip:* Elevate this ${occasion || "formal"} look by pairing the items with cream-coloured leather gloves or a structured gold envelope clutch, letting the neckline remain unencumbered to emphasize your refined collar bone structure.`;

  res.json({ advice: mockAdvice });
});

// ----------------------------------------------------
// VITE OR STATIC FILE SERVING
// ----------------------------------------------------
async function startViteServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Launching in development mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving production static bundle...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = 3001;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FitStyle AI Server is running securely on port ${PORT}`);
  });
}

startViteServer();