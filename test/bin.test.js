const test = require("node:test");
const assert = require("node:assert/strict");
const { run, usage } = require("../bin/node-hon");

test("node-hon prints usage for missing command", async () => {
  let output = "";
  const code = await run([], { stderr: { write: (text) => { output += text; } }, commands: fakeCommands() });

  assert.equal(code, 1);
  assert.equal(output, `${usage()}\n`);
});

test("node-hon routes apply preset command", async () => {
  const calls = [];
  const code = await run(["apply", "Bedroom", "preset_fan"], {
    baseDir: "/pkg",
    stderr: silentStderr(),
    commands: fakeCommands(calls)
  });

  assert.equal(code, 0);
  assert.deepEqual(calls, [{ command: "apply", options: { acId: "Bedroom", presetName: "preset_fan", baseDir: "/pkg" } }]);
});

test("node-hon routes apply off command", async () => {
  const calls = [];
  const code = await run(["apply", "bedroom", "off"], {
    baseDir: "/pkg",
    stderr: silentStderr(),
    commands: fakeCommands(calls)
  });

  assert.equal(code, 0);
  assert.deepEqual(calls, [{ command: "apply", options: { acId: "bedroom", presetName: "off", baseDir: "/pkg" } }]);
});

test("node-hon routes generate-preset command", async () => {
  const calls = [];
  const code = await run(["generate-preset"], {
    baseDir: "/pkg",
    stderr: silentStderr(),
    commands: fakeCommands(calls)
  });

  assert.equal(code, 0);
  assert.deepEqual(calls, [{ command: "generatePreset", options: { baseDir: "/pkg" } }]);
});

test("node-hon routes list command", async () => {
  const calls = [];
  const code = await run(["list"], {
    baseDir: "/pkg",
    stderr: silentStderr(),
    commands: fakeCommands(calls)
  });

  assert.equal(code, 0);
  assert.deepEqual(calls, [{ command: "list", options: { baseDir: "/pkg" } }]);
});

function fakeCommands(calls = []) {
  return {
    apply: async (options) => {
      calls.push({ command: "apply", options });
    },
    list: async (options) => {
      calls.push({ command: "list", options });
    },
    generatePreset: async (options) => {
      calls.push({ command: "generatePreset", options });
    }
  };
}

function silentStderr() {
  return { write: () => {} };
}
