/**
 * Fleet File Transfer — Vercel Blob Protocol
 *
 * POST /api/transfer
 *   Upload a file to Vercel Blob storage. Returns a public download URL.
 *   The download URL is logged to ACMI for audit trail.
 *
 * Usage from any agent:
 *   curl -X POST https://acmi-product.vercel.app/api/transfer \\
 *     -H "Authorization: Bearer <fleet-transfer-token>" \\
 *     -F "file=@/path/to/file.py" \\
 *     -F "target=android-worker" \\
 *     -F "description=SMS bridge scripts for phone"
 *
 * Response:
 *   { "url": "https://public.blob.vercel-storage.com/...", "size": 1234 }
 *
 * Download on target:
 *   curl -O <url>
 *
 * Protocol pattern (v1):
 *   1. Source agent uploads file → gets public URL
 *   2. Source posts ACMI event: [file-transfer @target] URL
 *   3. Target downloads from URL
 *   4. Target ACKs via ACMI event: [file-transfer-ack @source] received
 */

import Busboy from "@fastify/busboy";
import { put } from "@vercel/blob";
import { createHash } from "node:crypto";

export const config = {
  runtime: "nodejs",
  // Max 50MB uploads
};

export default async function handler(req, res) {
  // POST only
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  // Auth check — fleet-transfer-token matches env
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");
  const expectedToken = process.env.FLEET_TRANSFER_TOKEN || "";
  if (expectedToken && token !== expectedToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Parse multipart form
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      return res.status(400).json({ error: "multipart/form-data required" });
    }

    const busboy = new Busboy({
      headers: req.headers,
      limits: {
        fileSize: 50 * 1024 * 1024,
        files: 1,
      },
    });

    const fileChunks = [];
    let fileBuffer = null;
    let fileName = "transfer.bin";
    let target = "unknown";
    let description = "";
    let sawFile = false;
    let fileTooLarge = false;

    await new Promise((resolve, reject) => {
      busboy.on("file", (fieldname, file, filename) => {
        if (fieldname !== "file") {
          file.resume();
          return;
        }

        sawFile = true;
        if (typeof filename === "string" && filename.trim()) {
          fileName = filename;
        }

        file.on("data", (chunk) => {
          fileChunks.push(chunk);
        });

        file.on("limit", () => {
          fileTooLarge = true;
          file.resume();
        });

        file.on("error", reject);
      });

      busboy.on("field", (fieldname, value) => {
        if (fieldname === "target") {
          target = value.trim();
        } else if (fieldname === "description") {
          description = value.trim();
        }
      });

      busboy.on("error", reject);
      busboy.on("finish", resolve);
      req.pipe(busboy);
    });

    if (fileTooLarge) {
      return res.status(413).json({ error: "file too large" });
    }

    if (!sawFile) {
      return res.status(400).json({ error: "No file field in upload" });
    }

    fileBuffer = Buffer.concat(fileChunks);

    // Generate a path: fleet-transfers/<target>/<date>/<filename>-<hash>
    const hash = createHash("sha256").update(fileBuffer).digest("hex").slice(0, 12);
    const date = new Date().toISOString().split("T")[0];
    const blobPath = `fleet-transfers/${target}/${date}/${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}-${hash}`;

    // Upload to Vercel Blob
    const blob = await put(blobPath, fileBuffer, {
      access: "public",
      contentType: fileName.endsWith(".py") ? "text/x-python" : 
                   fileName.endsWith(".csv") ? "text/csv" :
                   fileName.endsWith(".sh") ? "application/x-sh" :
                   "application/octet-stream",
      addRandomSuffix: false,
    });

    // Return the public URL
    return res.status(200).json({
      url: blob.url,
      path: blobPath,
      size: fileBuffer.length,
      fileName,
      contentType: blob.contentType,
      target,
      description,
      uploadedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Transfer error:", error);
    return res.status(500).json({ error: error.message });
  }
}
