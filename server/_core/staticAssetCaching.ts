import path from "node:path";

/**
 * Le shell SPA ne contient aucune donnée propre à une session. Un cache court
 * permet aux navigations entre pages de ne pas repasser systématiquement par
 * le proxy public lent, tout en laissant une nouvelle version disponible vite.
 */
export const SPA_SHELL_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

export function getStaticAssetCacheControl(filePath: string): string {
 const normalized = filePath.replaceAll("\\", "/");
 const name = path.posix.basename(normalized);
 // Never cache HTML/session/runtime metadata, even if a filename resembles a hash.
 const hashedAsset = normalized.includes("/assets/") && /-[a-zA-Z0-9_-]{8,}\.(js|css|woff2?|png|jpe?g|webp|avif|svg)$/.test(name);
 return hashedAsset ? "public, max-age=31536000, immutable" : "no-cache, no-store, must-revalidate";
}
