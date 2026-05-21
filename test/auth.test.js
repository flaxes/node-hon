"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { HonAuth } = require("../src/auth");
const { HonDevice } = require("../src/device");

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

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}
