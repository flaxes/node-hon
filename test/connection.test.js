const test = require("node:test");
const assert = require("node:assert/strict");
const { HonConnection } = require("../src/connection");

test("HonConnection injects auth headers and retries once after 401", async () => {
  const headers = [];
  let refreshes = 0;
  const auth = {
    refreshToken: "refresh",
    sessionToken: "session",
    idToken: "id",
    tokenExpiresSoon: () => false,
    tokenIsExpired: () => false,
    initialize: async () => {},
    authenticate: async () => {},
    refresh: async () => {
      refreshes += 1;
    }
  };
  const connection = new HonConnection(auth, async (_url, options) => {
    headers.push(options.headers);
    return new Response(JSON.stringify({ ok: true }), { status: headers.length === 1 ? 401 : 200 });
  });

  const response = await connection.get("https://example.test");

  assert.equal(response.status, 200);
  assert.equal(refreshes, 1);
  assert.equal(headers[0]["cognito-token"], "session");
  assert.equal(headers[0]["id-token"], "id");
});
