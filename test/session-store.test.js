"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { SessionStore, isExpired } = require("../src/session-store");

test("SessionStore reads missing files as null and writes JSON atomically", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hon-session-"));
  const file = path.join(dir, "session.json");
  const store = new SessionStore(file);

  assert.equal(await store.read(), null);

  await store.write({ refreshToken: "refresh", sessionToken: "session" });
  assert.deepEqual(await store.read(), { refreshToken: "refresh", sessionToken: "session" });
});

test("isExpired treats missing, invalid, and near-expiry timestamps as expired", () => {
  assert.equal(isExpired(""), true);
  assert.equal(isExpired("not-a-date"), true);
  assert.equal(isExpired(new Date(Date.now() + 1000).toISOString(), 2000), true);
  assert.equal(isExpired(new Date(Date.now() + 60_000).toISOString(), 1000), false);
});
