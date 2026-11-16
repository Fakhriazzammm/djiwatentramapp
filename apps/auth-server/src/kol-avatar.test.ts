import { describe, expect, it } from "bun:test";
import { AVATAR_PUBLIC_BASE, googleImageAt256, isGoogleImageUrl, mirrorGoogleAvatar } from "./kol-portal";

const png = new Uint8Array(400).fill(7);
const okFetch = (async () => new Response(png, { status: 200, headers: { "Content-Type": "image/png" } })) as unknown as typeof fetch;

function fakeDb() {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  return { calls, query: async (text: string, values: unknown[] = []) => { calls.push({ text, values }); return { rows: [] }; } };
}

describe("KOL avatar mirror", () => {
  it("only trusts Google image hosts and upgrades the size", () => {
    expect(isGoogleImageUrl("https://lh3.googleusercontent.com/a/abc=s96-c")).toBe(true);
    expect(isGoogleImageUrl("https://evil.example/a.png")).toBe(false);
    expect(isGoogleImageUrl("http://lh3.googleusercontent.com/a")).toBe(false);
    expect(isGoogleImageUrl("https://lh3.googleusercontent.com.evil.example/a")).toBe(false);
    expect(googleImageAt256("https://lh3.googleusercontent.com/a/abc=s96-c")).toBe("https://lh3.googleusercontent.com/a/abc=s256-c");
  });

  it("stores the image and points avatar_url at the stored copy", async () => {
    const db = fakeDb();
    const url = await mirrorGoogleAvatar(db, "kol_ok", "https://lh3.googleusercontent.com/a/ok=s96-c", okFetch);
    expect(url?.startsWith(`${AVATAR_PUBLIC_BASE}/kol_ok?v=`)).toBe(true);
    expect(db.calls[0]!.text).toContain("insert into pos.kol_avatars");
    expect(db.calls[1]!.text).toContain("update pos.kol_creators set avatar_url");
    expect(db.calls[1]!.text).toContain("avatar_url is null");
  });

  it("refuses non-image responses and backs off after a failure", async () => {
    const db = fakeDb();
    const htmlFetch = (async () => new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } })) as unknown as typeof fetch;
    expect(await mirrorGoogleAvatar(db, "kol_bad", "https://lh3.googleusercontent.com/a/bad=s96-c", htmlFetch)).toBeNull();
    expect(db.calls.length).toBe(0);
    // within the cooldown the second attempt does not even fetch
    let fetched = 0;
    const countingFetch = (async () => { fetched++; return new Response(png, { headers: { "Content-Type": "image/png" } }); }) as unknown as typeof fetch;
    expect(await mirrorGoogleAvatar(db, "kol_bad", "https://lh3.googleusercontent.com/a/bad=s96-c", countingFetch)).toBeNull();
    expect(fetched).toBe(0);
  });

  it("rejects tiny or oversized images", async () => {
    const db = fakeDb();
    const tiny = (async () => new Response(new Uint8Array(10), { headers: { "Content-Type": "image/png" } })) as unknown as typeof fetch;
    expect(await mirrorGoogleAvatar(db, "kol_tiny", "https://lh3.googleusercontent.com/a/t=s96-c", tiny)).toBeNull();
    const huge = (async () => new Response(new Uint8Array(1_100_000), { headers: { "Content-Type": "image/png" } })) as unknown as typeof fetch;
    expect(await mirrorGoogleAvatar(db, "kol_huge", "https://lh3.googleusercontent.com/a/h=s96-c", huge)).toBeNull();
    expect(db.calls.length).toBe(0);
  });
});
