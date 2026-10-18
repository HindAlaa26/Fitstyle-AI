/**
 * tryonService.ts — Connects the website to the LaDI-VTON virtual try-on
 * service (Colab/EC2).
 *
 * Uses the same components as server.ts: requireUser (Cognito) and
 * dbProducts (cache), and maintains the same format as the legacy request:
 * userPhoto = a base64 data URL in JSON.
 *
 * The frontend sends product IDs only (not URLs). The backend retrieves
 * the product image and category from the catalog, preventing anyone from
 * making the GPU service access arbitrary URLs.
 *
 * .env:
 *   TRYON_URL=https://xxxx.trycloudflare.com   (PUBLIC_URL from Cell 13)
 *   TRYON_API_KEY=...                          (API_KEY from Cell 13)
 *   PUBLIC_BASE_URL=https://your-website.com   (Optional: used when product
 *                                               images have local paths "/...")
 *
 * In server.ts (two lines):
 *   import { registerTryOnRoutes } from "./tryonService";
 *   registerTryOnRoutes(app, { getProducts: () => dbProducts, requireUser });
 *
 * Endpoints:
 *   POST /api/vton
 *     Request:  { userPhoto: "data:image/jpeg;base64,...", productIds: ["id1","id2"] }
 *     Response: 202 { jobId, status, skipped }
 *
 *   GET /api/vton/:jobId
 *     Response: { status: "queued"|"running"|"done"|"error",
 *                 tryOnUrl? (data URL), error? }
 */
import type { Express, Response, NextFunction } from "express";

interface CatalogProduct {
  id: string;
  image?: string;
  garmentCategory?: string; // Dress / Top / Bottom / Shoes / Outerwear / Accessory (أو "")
  category?: string;
}

interface Deps {
  getProducts: () => CatalogProduct[];
  requireUser: (req: any, res: Response, next: NextFunction) => unknown;
}

const WEARABLE = new Set(["dress", "top", "bottom", "outerwear"]);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ACTIVE_WINDOW_MS = 10 * 60 * 1000;    
const KEEP_JOBS_MS = 2 * 60 * 60 * 1000;

interface JobInfo { userId: string; createdAt: number; finished: boolean }
const jobs = new Map<string, JobInfo>();

const base = () => (process.env.TRYON_URL || process.env.PUBLIC_URL || "").replace(/\/$/, "");
const apiKey = () => process.env.TRYON_API_KEY || process.env.API_KEY || "";
const authHeaders = () => ({ "X-API-Key": apiKey() });

function absoluteUrl(src: string): string | null {
  if (/^https?:\/\//i.test(src)) return src;
  const pub = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  return src.startsWith("/") && pub ? pub + src : null;
}

function parsePhoto(dataUrl: unknown): { buf: Buffer; mime: string } | null {
  if (typeof dataUrl !== "string") return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64$/i.exec(dataUrl.slice(0, comma));
  if (!m) return null;
  const buf = Buffer.from(dataUrl.slice(comma + 1), "base64");
  return buf.length > 0 && buf.length <= MAX_PHOTO_BYTES ? { buf, mime: m[1].toLowerCase() } : null;
}

export function registerTryOnRoutes(app: Express, { getProducts, requireUser }: Deps): void {
  app.post("/api/vton", requireUser, async (req: any, res: Response) => {
    if (!base() || !apiKey()) {
      return res.status(503).json({ error: "try_on_unavailable", message: "Virtual try-on service is not configured." });
    }
    const userId: string = req.authUserId;
    const { userPhoto, productIds } = req.body || {};

    const photo = parsePhoto(userPhoto);
    if (!photo) {
      return res.status(400).json({ error: "bad_photo", message: "Upload a JPG/PNG/WebP photo up to 10MB." });
    }
    if (!Array.isArray(productIds) || productIds.length < 1 || productIds.length > 6 ||
        !productIds.every((x: unknown) => typeof x === "string")) {
      return res.status(400).json({ error: "bad_products", message: "productIds must be an array of 1-6 product ids." });
    }

    const now = Date.now();
    for (const [id, j] of jobs) if (now - j.createdAt > KEEP_JOBS_MS) jobs.delete(id);
    for (const j of jobs.values()) {
      if (j.userId === userId && !j.finished && now - j.createdAt < ACTIVE_WINDOW_MS) {
        return res.status(429).json({ error: "busy", message: "You already have a try-on in progress." });
      }
    }

    const products = getProducts();
    const garments: { url: string; category?: string }[] = [];
    const skipped: string[] = [];
    for (const id of productIds as string[]) {
      const p = products.find((x) => x.id === id);
      if (!p) return res.status(404).json({ error: "product_not_found", message: `Product ${id} was not found.` });
      const gc = (p.garmentCategory || "").trim();
      if (gc && !WEARABLE.has(gc.toLowerCase())) { skipped.push(id); continue; }   // Shoes / Accessory
      const url = p.image ? absoluteUrl(p.image) : null;
      if (!url) return res.status(422).json({ error: "no_image", message: `Product ${id} has no usable image.` });
      garments.push({ url, ...(gc ? { category: gc } : {}) });
    }
    if (garments.length === 0) {
      return res.status(422).json({ error: "no_wearable_items", message: "Try-on works for tops, bottoms, dresses and outerwear only.", skipped });
    }
    if (garments.length > 3) {
      return res.status(400).json({ error: "too_many_items", message: "Pick up to 3 clothing items." });
    }

    try {
      const form = new FormData();
      form.append("person", new Blob([new Uint8Array(photo.buf)], { type: photo.mime }), "person.jpg");
      form.append("garments", JSON.stringify(garments));
      const r = await fetch(`${base()}/tryon`, {
        method: "POST", headers: authHeaders(), body: form, signal: AbortSignal.timeout(30000),
      });
      const body: any = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error("[VTON] service rejected request:", r.status, body);
        const detail = body.detail || body.message ||
          (r.status === 530
            ? "Cloudflare could not reach the Colab try-on server (HTTP 530). Restart the Colab service and update PUBLIC_URL if its tunnel URL changed."
            : `Try-on service returned HTTP ${r.status}.`);
        return res.status(r.status === 400 ? 400 : 502).json({
          error: "try_on_failed",
          message: String(detail).slice(0, 500),
        });
      }
      jobs.set(body.job_id, { userId, createdAt: now, finished: false });
      return res.status(202).json({ jobId: body.job_id, status: body.status, skipped });
    } catch (err) {
      console.error("[VTON] service unreachable:", err);
      return res.status(502).json({ error: "try_on_unavailable", message: "Try-on service is not reachable right now." });
    }
  });

  app.get("/api/vton/:id", requireUser, async (req: any, res: Response) => {
    const id = String(req.params.id);
    const job = jobs.get(id);
    if (!job || job.userId !== req.authUserId) return res.status(404).json({ error: "not_found" });

    try {
      const r = await fetch(`${base()}/jobs/${encodeURIComponent(id)}`, {
        headers: authHeaders(), signal: AbortSignal.timeout(15000),
      });
      if (r.status === 404) {                      
        jobs.delete(id);
        return res.status(404).json({ error: "expired", message: "This try-on expired. Please try again." });
      }
      const body: any = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(502).json({ error: "try_on_unavailable" });

      if (body.status === "error") {
        job.finished = true;
        console.error("[VTON] job failed:", id, body.error);
        return res.json({ status: "error", message: "Couldn't generate the try-on. Use a clear, full-body, front-facing photo and try again." });
      }
      if (body.status === "done") {
        const img = await fetch(`${base()}${body.result}`, { headers: authHeaders(), signal: AbortSignal.timeout(30000) });
        if (!img.ok) return res.status(502).json({ error: "try_on_unavailable" });
        job.finished = true;
        const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
        return res.json({ status: "done", tryOnUrl: `data:image/png;base64,${b64}` });
      }
      return res.json({ status: body.status });   // queued | running
    } catch (err) {
      console.error("[VTON] status check failed:", err);
      return res.status(502).json({ error: "try_on_unavailable" });
    }
  });
}
