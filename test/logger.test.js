const test = require("node:test");
const assert = require("node:assert/strict");
const { DebugLogger, formatTimestamp, formatElapsed } = require("../src/logger");

test("DebugLogger formats timestamps and elapsed seconds", () => {
  assert.equal(formatTimestamp(new Date("2026-01-30T15:30:10")), "2026-01-30 15:30:10");
  assert.equal(formatElapsed(new Date("2026-01-30T15:30:10"), new Date("2026-01-30T15:30:15")), "5secs");
});

test("DebugLogger emits no output when disabled", () => {
  const lines = [];
  const logger = new DebugLogger({
    enabled: false,
    sink: (line) => lines.push(line),
    now: () => new Date("2026-01-30T15:30:10")
  });

  const operation = logger.start("Trying to login...");
  operation.success("Login success");

  assert.deepEqual(lines, []);
});

test("DebugLogger logs operation start and success with elapsed time", () => {
  const lines = [];
  const times = [
    new Date("2026-01-30T15:30:10"),
    new Date("2026-01-30T15:30:15")
  ];
  const logger = new DebugLogger({
    enabled: true,
    sink: (line) => lines.push(line),
    now: () => times.shift()
  });

  const operation = logger.start("Trying to login...");
  operation.success("Login success");

  assert.deepEqual(lines, [
    "2026-01-30 15:30:10: Trying to login...",
    "2026-01-30 15:30:15: Login success (5secs)"
  ]);
});
