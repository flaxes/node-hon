"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { HonAuth } = require("../src/auth");
const { HonDevice } = require("../src/device");
const { DebugLogger } = require("../src/logger");

test("HonAuth reuses valid session file data", async () => {
  let writes = 0;
  const auth = new HonAuth({
    email: "u",
    password: "p",
    device: new HonDevice(),
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
    sessionStore: {
      read: async () => ({
        refreshToken: "refresh",
        sessionToken: "session",
        idToken: "id",
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      }),
      write: async () => {
        writes += 1;
      }
    }
  });

  await auth.initialize();

  assert.equal(auth.refreshToken, "refresh");
  assert.equal(auth.sessionToken, "session");
  assert.equal(auth.idToken, "id");
  assert.equal(writes, 0);
});

test("HonAuth refreshes expired session data and writes updated session", async () => {
  const calls = [];
  let written = null;
  const auth = new HonAuth({
    email: "u",
    password: "p",
    device: new HonDevice(),
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes("/services/oauth2/token")) {
        return jsonResponse({ id_token: "new-id", access_token: "new-access" });
      }
      if (String(url).includes("/auth/v1/login")) {
        return jsonResponse({ cognitoUser: { Token: "new-session" } });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
    sessionStore: {
      read: async () => ({
        refreshToken: "refresh",
        sessionToken: "old-session",
        idToken: "old-id",
        expiresAt: new Date(Date.now() - 1000).toISOString()
      }),
      write: async (data) => {
        written = data;
      }
    }
  });

  await auth.initialize();

  assert.equal(auth.sessionToken, "new-session");
  assert.equal(auth.idToken, "new-id");
  assert.equal(written.refreshToken, "refresh");
  assert.equal(written.sessionToken, "new-session");
  assert.equal(calls.length, 2);
});

test("HonAuth debug logs session reuse without leaking secrets", async () => {
  const lines = [];
  const auth = new HonAuth({
    email: "user@example.com",
    password: "super-secret-password",
    device: new HonDevice(),
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
    logger: new DebugLogger({
      enabled: true,
      sink: (line) => lines.push(line),
      now: () => new Date("2026-01-30T15:30:10")
    }),
    sessionStore: {
      read: async () => ({
        refreshToken: "refresh-token-secret",
        sessionToken: "session-token-secret",
        idToken: "id-token-secret",
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      }),
      write: async () => {}
    }
  });

  await auth.initialize();

  assert.deepEqual(lines, [
    "2026-01-30 15:30:10: Trying to reuse saved session...",
    "2026-01-30 15:30:10: Saved session reused"
  ]);
  assert.equal(lines.join("\n").includes("super-secret-password"), false);
  assert.equal(lines.join("\n").includes("refresh-token-secret"), false);
  assert.equal(lines.join("\n").includes("session-token-secret"), false);
});

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}
