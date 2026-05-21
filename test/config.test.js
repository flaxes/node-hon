const test = require("node:test");
const assert = require("node:assert/strict");
const { validateConfig } = require("../src/lib/config");

test("validateConfig accepts required project config fields", () => {
  assert.equal(validateConfig({
    email: "user@example.com",
    password: "secret",
    sessionFile: "./cache/.hon-session.json"
  }), true);
});

test("validateConfig rejects missing required fields", () => {
  assert.throws(() => validateConfig({ email: "user@example.com" }), /password/);
});
