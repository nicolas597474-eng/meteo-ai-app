import path from "node:path";

export function getStaticAssetCacheControl(filePath: string): string {
 const normalized = filePath.replaceAll("\\", "/");
 const name = path.posix.basename(normalized);
 // Never cache HTML/session/runtime metadata, even if a filename resembles a hash.
 const hashedAsset = normalized.includes("/assets/") && /-[a-zA-Z0-9_-]{8,}\.(js|css|woff2?|png|jpe?g|webp|avif|svg)$/.test(name);
 return hashedAsset ? "public, max-age=31536000, immutable" : "no-cache, no-store, must-revalidate";
}
