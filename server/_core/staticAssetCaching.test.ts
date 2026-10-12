import { describe, expect, it } from "vitest";
import { getStaticAssetCacheControl } from "./staticAssetCaching";
describe("static asset caching", () => {
 it("caches content-hashed JavaScript and CSS", () => {
  for (const file of ["/dist/public/assets/Dashboard-B2zD5I7i.js", "/dist/public/assets/index-Abc12345.css"]) expect(getStaticAssetCacheControl(file)).toBe("public, max-age=31536000, immutable");
 });
 it("never caches shell, runtime/session data, service workers or unversioned assets", () => {
  for (const file of ["/dist/public/index.html", "/dist/public/__manus__/version.json", "/dist/public/assets/index.js", "/dist/public/assets/page-Abc12345.html", "/dist/public/sw.js", "/api/trpc/auth.me"]) expect(getStaticAssetCacheControl(file)).toContain("no-store");
 });
});
