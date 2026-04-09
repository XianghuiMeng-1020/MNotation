import { describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { createSessionCookieValue, parseSessionCookieValue } from "../auth";
import { __test_helpers } from "../index";

describe("auth cookie signature", () => {
  it("valid signed cookie parses successfully", async () => {
    const env = { AUTH_COOKIE_SECRET: "test-secret" };
    const cookie = await createSessionCookieValue(
      { email: "u@example.com", name: "U", userId: "email:u@example.com" },
      env as any
    );
    const identity = await parseSessionCookieValue(cookie, env as any);
    expect(identity?.email).toBe("u@example.com");
    expect(identity?.userId).toBe("email:u@example.com");
  });

  it("tampered cookie is rejected", async () => {
    const env = { AUTH_COOKIE_SECRET: "test-secret" };
    const cookie = await createSessionCookieValue(
      { email: "u@example.com", name: "U", userId: "email:u@example.com" },
      env as any
    );
    const tampered = `${decodeURIComponent(cookie)}x`;
    const identity = await parseSessionCookieValue(encodeURIComponent(tampered), env as any);
    expect(identity).toBeNull();
  });
});

describe("submit validation helper", () => {
  it("rejects invalid label", () => {
    const res = __test_helpers.validateLabelingSubmission({
      label: "X",
      allowedLabels: new Set(["A", "B"]),
      itemExists: true,
      assignmentStatus: "todo"
    });
    expect(res?.error).toBe("invalid_label");
  });

  it("passes valid state", () => {
    const res = __test_helpers.validateLabelingSubmission({
      label: "A",
      allowedLabels: new Set(["A", "B"]),
      itemExists: true,
      assignmentStatus: "todo"
    });
    expect(res).toBeNull();
  });
});

describe("export cursor pagination helper", () => {
  it("computes next cursor and hasMore", () => {
    const paging = __test_helpers.computePagingFromRows(3, 2, [
      [{ rowid: 4 }, { rowid: 5 }],
      [{ rowid: 9 }],
      []
    ]);
    expect(paging.nextCursor).toBe(9);
    expect(paging.hasMore).toBe(true);
  });
});

describe("quota helper", () => {
  it("function exists for quota path tests", () => {
    expect(typeof __test_helpers.consumeCustomPromptQuota).toBe("function");
  });
});

describe("miniflare availability", () => {
  it("can construct miniflare instance", async () => {
    const mf = new Miniflare({
      script: "addEventListener('fetch', (event) => event.respondWith(new Response('ok')));"
    });
    const res = await mf.dispatchFetch("http://localhost/");
    expect(await res.text()).toBe("ok");
    await mf.dispose();
  });
});
