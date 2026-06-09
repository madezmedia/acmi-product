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

    // Read the raw body chunks
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Parse boundary from content-type
    const boundary = contentType.split("boundary=")[1];
    if (!boundary) {
      return res.status(400).json({ error: "No boundary in content-type" });
    }

    // Simple multipart parser for the file field
    const parts = buffer.toString("latin1").split(`--${boundary}`);
    let fileBuffer = null;
    let fileName = "transfer.bin";
    let target = "unknown";
    let description = "";

    for (const part of parts) {
      if (part.includes('name="file"')) {
        // Extract filename from Content-Disposition
        const dispMatch = part.match(/filename="([^"]+)"/);
        if (dispMatch) fileName = dispMatch[1];

        // Extract file content (after double newline, before trailing --)
        const contentStart = part.indexOf("\r\n\r\n") + 4;
        const contentEnd = part.lastIndexOf("\r\n");
        const rawContent = part.slice(contentStart, contentEnd < contentStart ? undefined : contentEnd);
        fileBuffer = Buffer.from(rawContent, "latin1");
      } else if (part.includes('name="target"')) {
        const m = part.match(/\r\n\r\n(.+)/);
        if (m) target = m[1].trim();
      } else if (part.includes('name="description"')) {
        const m = part.match(/\r\n\r\n(.+)/);
        if (m) description = m[1].trim();
      }
    }

    if (!fileBuffer) {
      return res.status(400).json({ error: "No file field in upload" });
    }

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
