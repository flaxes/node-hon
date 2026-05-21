const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { main } = require("../cli/ac_apply_preset");

test("apply CLI powers off when preset name is off", async () => {
  const calls = [];

  await main({
    acId: "Bedroom",
    presetName: "off",
    getAcClient: async () => fakeAcClient(calls)
  });

  assert.deepEqual(calls, ["powerOff", "close"]);
});

test("apply CLI applies selected preset file", async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "node-hon-cli-"));
  await fs.mkdir(path.join(baseDir, "presets"));
  await fs.writeFile(path.join(baseDir, "presets", "preset_test.json"), JSON.stringify({ mode: "iot_cool" }), "utf8");
  const calls = [];

  await main({
    acId: "Bedroom",
    presetName: "preset_test",
    baseDir,
    getAcClient: async () => fakeAcClient(calls)
  });

  assert.deepEqual(calls, [{ preset: { mode: "iot_cool" }, name: "preset_test" }, "close"]);
});

function fakeAcClient(calls) {
  return {
    ac: {
      nickName: "Bedroom",
      macAddress: "aa",
      powerOff: async () => {
        calls.push("powerOff");
      },
      applyPreset: async (preset, name) => {
        calls.push({ preset, name });
      }
    },
    client: {
      close: async () => {
        calls.push("close");
      }
    }
  };
}
