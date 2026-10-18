import { authFetch } from "./authFetch";

export class VtonError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "VtonError";
    this.code = code;
  }
}

/**

Resizes the user's image (maximum 1280px) and converts it to a JPEG data URL.

The backend accepts data URLs only (jpeg/png/webp) up to 10MB, and large images

taken on mobile devices can exceed this limit.

Works with data:, blob:, and HTTP URLs that allow CORS.
*/
export function prepareUserPhoto(src: string, maxSide = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas not available"));
      ctx.fillStyle = "#ffffff";           
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch (e) {
        reject(e);                         
      }
    };
    img.onerror = () => reject(new Error("could not load the photo"));
    img.src = src;
  });
}

export async function preserveLowerBody(
  bottomImageUrl: string,
  topImageUrl: string,
  fadeStartPercent: number,
  fadeEndPercent: number,
): Promise<string> {
  const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("could not load try-on result"));
    image.src = src;
  });
  const [bottomImage, topImage] = await Promise.all([
    loadImage(bottomImageUrl),
    loadImage(topImageUrl),
  ]);
  const width = bottomImage.naturalWidth || bottomImage.width;
  const height = bottomImage.naturalHeight || bottomImage.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas not available");

  ctx.drawImage(bottomImage, 0, 0, width, height);
  const topLayer = document.createElement("canvas");
  topLayer.width = width;
  topLayer.height = height;
  const topCtx = topLayer.getContext("2d");
  if (!topCtx) throw new Error("canvas not available");
  topCtx.drawImage(topImage, 0, 0, width, height);

  const start = Math.max(0, Math.min(99, fadeStartPercent));
  const end = Math.max(start + 1, Math.min(100, fadeEndPercent));
  const mask = topCtx.createLinearGradient(0, 0, 0, height);
  mask.addColorStop(0, "rgba(0, 0, 0, 1)");
  mask.addColorStop(start / 100, "rgba(0, 0, 0, 1)");
  mask.addColorStop(end / 100, "rgba(0, 0, 0, 0)");
  mask.addColorStop(1, "rgba(0, 0, 0, 0)");
  topCtx.globalCompositeOperation = "destination-in";
  topCtx.fillStyle = mask;
  topCtx.fillRect(0, 0, width, height);
  ctx.drawImage(topLayer, 0, 0);

  return canvas.toDataURL("image/png");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts the virtual try-on process using LaDI-VTON and waits for the result.
 * @param userPhoto  data URL (use prepareUserPhoto)
 * @param productIds Catalog product IDs (top/bottom/dress). Shoes and accessories are skipped by the backend.
 * @returns tryOnUrl = data URL of the final image
 */
export async function runVton(
  userPhoto: string,
  productIds: string[],
  onStatus?: (status: string) => void,
  timeoutMs = 10 * 60 * 1000,
  pollMs = 4000,
): Promise<{ tryOnUrl: string; skipped: string[] }> {
  const start = await authFetch("/api/vton", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userPhoto, productIds }),
  });
  const first: any = await start.json().catch(() => ({}));
  if (!start.ok) {
    const timeoutLike = start.status === 408 || first?.error === "timeout" || /timeout/i.test(first?.message || "");
    if (timeoutLike) {
      throw new VtonError(
        "The virtual try-on service timed out. Please retry in a moment and make sure the Colab/TRYON backend is running.",
        "timeout",
      );
    }
    throw new VtonError(
      first.message || (start.status === 401 ? "Please sign in again." : `Try-on failed (${start.status})`),
      first.error || (start.status === 401 ? "unauthorized" : "failed"),
    );
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const r = await authFetch(`/api/vton/${first.jobId}`);
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      const timeoutLike = r.status === 408 || j?.error === "timeout" || /timeout/i.test(j?.message || "");
      if (timeoutLike) {
        throw new VtonError(
          "The virtual try-on service timed out while rendering. Please retry in a moment.",
          "timeout",
        );
      }
      throw new VtonError(j.message || `Try-on failed (${r.status})`, j.error || "failed");
    }
    onStatus?.(j.status);
    if (j.status === "done") return { tryOnUrl: j.tryOnUrl as string, skipped: first.skipped || [] };
    if (j.status === "error") throw new VtonError(j.message || "Try-on failed. Please try again.", "job_failed");
  }
  throw new VtonError("The try-on took too long. Please retry in a moment while the rendering service is available.", "timeout");
}
