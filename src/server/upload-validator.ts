import type { ValidatedUpload } from "./types.ts";

export const DEFAULT_ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
] as const;

const MIME_EXTENSIONS: Record<string, string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"]
};

export interface UploadValidationOptions {
  maxAttachmentSize?: number;
  allowedContentTypes?: string[];
  maxImageDimensions?: [number, number];
}

export class UploadValidationError extends Error {
  public readonly status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "UploadValidationError";
    this.status = status;
  }
}

export function detectMagicMimeType(bytes: Uint8Array): string | null {
  if (bytes.byteLength >= 8) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return "image/png";
    }
  }

  if (bytes.byteLength >= 3) {
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
  }

  if (bytes.byteLength >= 6) {
    // GIF87a / GIF89a
    const gifSig = String.fromCharCode(
      bytes[0],
      bytes[1],
      bytes[2],
      bytes[3],
      bytes[4],
      bytes[5]
    );
    if (gifSig === "GIF87a" || gifSig === "GIF89a") {
      return "image/gif";
    }
  }

  if (bytes.byteLength >= 12) {
    // RIFF....WEBP
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (riff === "RIFF" && webp === "WEBP") {
      return "image/webp";
    }
  }

  return null;
}

export function extractImageDimensions(
  bytes: Uint8Array,
  mimeType: string
): [number, number] | null {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (mimeType === "image/png") {
      if (bytes.byteLength < 24) return null;
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      return [width, height];
    }

    if (mimeType === "image/gif") {
      if (bytes.byteLength < 10) return null;
      const width = view.getUint16(6, true);
      const height = view.getUint16(8, true);
      return [width, height];
    }

    if (mimeType === "image/webp") {
      if (bytes.byteLength < 30) return null;
      const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (chunkType === "VP8 ") {
        const w = view.getUint16(26, true) & 0x3fff;
        const h = view.getUint16(28, true) & 0x3fff;
        return [w, h];
      }
      if (chunkType === "VP8L") {
        const bits = view.getUint32(21, true);
        const w = (bits & 0x3fff) + 1;
        const h = ((bits >> 14) & 0x3fff) + 1;
        return [w, h];
      }
      if (chunkType === "VP8X") {
        const w = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
        const h = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
        return [w, h];
      }
      return null;
    }

    if (mimeType === "image/jpeg") {
      let idx = 2;
      const len = bytes.byteLength;
      while (idx + 9 < len) {
        if (bytes[idx] !== 0xff) {
          idx += 1;
          continue;
        }
        const marker = bytes[idx + 1];
        idx += 2;
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
          continue;
        }
        const segLen = view.getUint16(idx, false);
        if (segLen < 2) break;
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3) {
          const height = view.getUint16(idx + 3, false);
          const width = view.getUint16(idx + 5, false);
          return [width, height];
        }
        idx += segLen;
      }
      return null;
    }
  } catch {
    return null;
  }

  return null;
}

export function sanitizeFilename(filename: string | null | undefined, detectedMime: string): string {
  const defaultExt = MIME_EXTENSIONS[detectedMime]?.[0] ?? ".bin";
  if (!filename || filename.trim().length === 0) {
    return `attachment${defaultExt}`;
  }
  const stripped = filename.trim().replace(/^.*[\\/]/, "");
  const safe = stripped.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safe || safe.startsWith(".")) {
    return `attachment${defaultExt}`;
  }
  return safe;
}

function getExtensionLower(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0) return "";
  return filename.slice(lastDot).toLowerCase();
}

export function validateBinaryUpload(
  bytes: Uint8Array,
  originalFilename?: string | null,
  options: UploadValidationOptions = {}
): ValidatedUpload {
  const byteSize = bytes.byteLength;
  if (byteSize === 0) {
    throw new UploadValidationError("Uploaded file cannot be empty");
  }

  const maxSize = options.maxAttachmentSize ?? 10 * 1024 * 1024;
  if (maxSize > 0 && byteSize > maxSize) {
    throw new UploadValidationError(
      `File size (${byteSize} bytes) exceeds maximum allowed size (${maxSize} bytes)`
    );
  }

  const detectedMime = detectMagicMimeType(bytes);
  const allowedTypes = options.allowedContentTypes ?? [...DEFAULT_ALLOWED_CONTENT_TYPES];
  if (!detectedMime || !allowedTypes.includes(detectedMime)) {
    throw new UploadValidationError(
      `Unsupported or invalid file content type (detected: ${detectedMime ?? "unknown"})`
    );
  }

  const filename = sanitizeFilename(originalFilename, detectedMime);
  const ext = getExtensionLower(filename);
  const allowedExts = MIME_EXTENSIONS[detectedMime] ?? [];
  if (ext && !allowedExts.includes(ext)) {
    throw new UploadValidationError(
      `File extension '${ext}' does not match detected content type '${detectedMime}'`
    );
  }

  const dimensions = extractImageDimensions(bytes, detectedMime);
  if (dimensions) {
    const [width, height] = dimensions;
    if (width <= 0 || height <= 0) {
      throw new UploadValidationError(`Invalid image dimensions (${width}x${height})`);
    }
    const [maxW, maxH] = options.maxImageDimensions ?? [4096, 4096];
    if ((maxW > 0 && width > maxW) || (maxH > 0 && height > maxH)) {
      throw new UploadValidationError(
        `Image dimensions (${width}x${height}) exceed maximum allowed (${maxW}x${maxH})`
      );
    }
  }

  return {
    data: bytes,
    filename,
    content_type: detectedMime,
    byte_size: byteSize,
    dimensions
  };
}

export function decodeBase64DataUrl(
  rawData: string,
  customFilename?: string | null,
  options: UploadValidationOptions = {}
): ValidatedUpload {
  const payload = rawData.includes(";base64,")
    ? rawData.split(";base64,")[1] ?? ""
    : rawData;
  const trimmed = payload.trim();
  if (!trimmed || !/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) || trimmed.length % 4 !== 0) {
    throw new UploadValidationError("Invalid base64 attachment data");
  }

  const buf = Buffer.from(trimmed, "base64");
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return validateBinaryUpload(bytes, customFilename || "screenshot.png", options);
}

