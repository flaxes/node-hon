const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { HonAirConditioner } = require("../src/ac");
const { HonClient } = require("../src/client");
const { HonCommand } = require("../src/command");
const { HonAppliance } = require("../src/appliance");
const { ApplianceNotFoundError, UnsupportedControlError } = require("../src/errors");
const { DebugLogger } = require("../src/logger");

test("HonClient matches air conditioner by macAddress, uniqueId, then nickName", async () => {
  const first = fakeAc("aa", "Living");
  const second = fakeAc("bb", "Bedroom");
  const client = new HonClient({ email: "u", password: "p", sessionFile: "unused", fetch: async () => jsonResponse({}) });
  client.appliances = [first, second];

  assert.equal((await client.getAirConditionerById("aa")).nickName, "Living");
  assert.equal((await client.getAirConditionerById(second.uniqueId)).nickName, "Bedroom");
  assert.equal((await client.getAirConditionerById("Living")).macAddress, "aa");
});

test("HonClient reports missing and ambiguous AC_ID with candidates", async () => {
  const first = fakeAc("aa", "Same");
  const second = fakeAc("bb", "Same");
  const client = new HonClient({ email: "u", password: "p", sessionFile: "unused", fetch: async () => jsonResponse({}) });
  client.appliances = [first, second];

  await assert.rejects(() => client.getAirConditionerById("missing"), ApplianceNotFoundError);
  await assert.rejects(() => client.getAirConditionerById("Same"), ApplianceNotFoundError);
});

test("HonAirConditioner maps helper controls to discovered command parameters", async () => {
  const appliance = fakeAc("aa", "Living");
  /** @type {{ command: string, params: any } | null} */
  let sent = null;
  appliance.api = {
    sendCommand: async (_appliance, command, params) => {
      sent = { command, params };
      return true;
    }
  };
  appliance.commands.settings = new HonCommand("settings", {
    description: "settings",
    protocolType: "iot",
    parameters: {
      tempSel: { typology: "range", minimumValue: 16, maximumValue: 30, incrementValue: 1, defaultValue: 22 }
    }
  }, appliance);
  const ac = new HonAirConditioner(appliance);

  await ac.setTargetTemperature(24);

  assert.deepEqual(sent, { command: "settings", params: { tempSel: 24 } });
});

test("HonAirConditioner throws UnsupportedControlError for missing controls", async () => {
  const ac = new HonAirConditioner(fakeAc("aa", "Living"));
  await assert.rejects(() => ac.setSwing("on"), UnsupportedControlError);
});

test("HonAirConditioner loads preset_fan.json", async () => {
  const appliance = presetAc();
  /** @type {{ command: string, params: any, programName: string } | null} */
  let sent = null;
  appliance.api = {
    sendCommand: async (_appliance, command, params, _ancillary, programName) => {
      sent = { command, params, programName };
      return true;
    }
  };
  const ac = new HonAirConditioner(appliance);

  await ac.applyPresetFile(path.resolve(__dirname, "..", "presets", "preset_fan.json"));

  assert.ok(sent);
  const actual = /** @type {{ command: string, params: any, programName: string }} */ (sent);
  assert.equal(actual.command, "startProgram");
  assert.equal(actual.programName, "PROGRAM.IOT_UV_AND_FAN");
  assert.deepEqual(actual.params, {
    tempSel: 24,
    windSpeed: "2",
    windDirectionVertical: "2",
    windDirectionHorizontal: "0",
    healthMode: "1"
  });
});

test("HonAirConditioner applies presets with one command and switches out of cleaning category", async () => {
  const appliance = presetAc();
  let calls = 0;
  /** @type {{ command: string, params: any, programName: string } | null} */
  let sent = null;
  appliance.api = {
    sendCommand: async (_appliance, command, params, _ancillary, programName) => {
      calls += 1;
      sent = { command, params, programName };
      return true;
    }
  };
  const ac = new HonAirConditioner(appliance);

  await ac.applyPreset({
    mode: "iot_fan",
    windSpeed: "2",
    windDirection: "2",
    healthMode: "1"
  });

  assert.equal(calls, 1);
  assert.ok(sent);
  const actual = /** @type {{ command: string, params: any, programName: string }} */ (sent);
  assert.equal(actual.command, "startProgram");
  assert.equal(actual.programName, "PROGRAM.IOT_FAN");
  assert.deepEqual(actual.params, {
    windDirection: "2",
    windSpeed: "2",
    healthMode: "1"
  });
});

test("HonAirConditioner maps explicit presets to real iot capabilities", async () => {
  const appliance = realCapabilityAc();
  /** @type {{ command: string, params: any, programName: string } | null} */
  let sent = null;
  appliance.api = {
    sendCommand: async (_appliance, command, params, _ancillary, programName) => {
      sent = { command, params, programName };
      return true;
    }
  };

  await new HonAirConditioner(appliance).applyPreset({
    mode: "iot_uv_and_cool",
    tempSel: "24",
    windSpeed: "2",
    windDirectionVertical: "2",
    healthMode: "1"
  });

  assert.deepEqual(sent, {
    command: "startProgram",
    params: {
      tempSel: 24,
      windSpeed: "2",
      windDirectionVertical: "2",
      healthMode: 1
    },
    programName: "PROGRAMS.AC.IOT_UV_AND_COOL"
  });
});

test("HonAirConditioner logs preset apply timing when debug logger is enabled", async () => {
  const appliance = realCapabilityAc();
  appliance.api = {
    sendCommand: async () => true
  };
  const lines = [];
  const times = [
    new Date("2026-01-30T15:30:16"),
    new Date("2026-01-30T15:30:17"),
    new Date("2026-01-30T15:30:26")
  ];
  const logger = new DebugLogger({
    enabled: true,
    sink: (line) => lines.push(line),
    now: () => times.shift() || new Date("2026-01-30T15:30:26")
  });

  await new HonAirConditioner(appliance, logger).applyPreset({
    mode: "iot_uv_and_cool",
    tempSel: "24",
    windSpeed: "2",
    windDirectionVertical: "2",
    healthMode: "1"
  }, "uv_fan");

  assert.deepEqual(lines, [
    "2026-01-30 15:30:16: Turning on preset: \"uv_fan\"...",
    "2026-01-30 15:30:17: Selected preset command: \"startProgram\" (PROGRAMS.AC.IOT_UV_AND_COOL)",
    "2026-01-30 15:30:26: Turned on preset: \"uv_fan\" (10secs)"
  ]);
});

test("HonAirConditioner prefers startProgram over settings for presets", async () => {
  const appliance = presetAc();
  appliance.commands.settings = new HonCommand("settings", presetCommandAttributes(), appliance);
  /** @type {{ command: string, params: any } | null} */
  let sent = null;
  appliance.api = {
    sendCommand: async (_appliance, command, params) => {
      sent = { command, params };
      return true;
    }
  };

  await new HonAirConditioner(appliance).applyPreset({ windSpeed: "2", healthMode: "1" });

  assert.ok(sent);
  const actual = /** @type {{ command: string, params: any }} */ (sent);
  assert.equal(actual.command, "startProgram");
});

test("HonAirConditioner reports unsupported preset fields and values", async () => {
  const ac = new HonAirConditioner(presetAc());

  await assert.rejects(() => ac.applyPreset({ turbo: "on" }), UnsupportedControlError);
  await assert.rejects(() => ac.applyPreset({ windSpeed: "warp" }), UnsupportedControlError);
});

function fakeAc(macAddress, nickName) {
  return new HonAppliance(null, {
    macAddress,
    applianceTypeName: "AC",
    applianceModelId: "123",
    modelName: "Air Conditioner",
    nickName
  });
}

function presetAc() {
  const appliance = fakeAc("aa", "Living");
  const categories = {};
  const cleaning = new HonCommand("startProgram", presetCommandAttributes(), appliance, categories, "PROGRAM.IOT_SELF_CLEAN");
  const fan = new HonCommand("startProgram", presetCommandAttributes(), appliance, categories, "PROGRAM.IOT_FAN");
  const uvFan = new HonCommand("startProgram", presetCommandAttributes(), appliance, categories, "PROGRAM.IOT_UV_AND_FAN");
  const cool = new HonCommand("startProgram", presetCommandAttributes(), appliance, categories, "PROGRAM.IOT_UV_AND_COOL");
  categories.iot_self_clean = cleaning;
  categories.iot_fan = fan;
  categories.iot_uv_and_fan = uvFan;
  categories.iot_uv_and_cool = cool;
  appliance.commands.startProgram = cleaning;
  return appliance;
}

function presetCommandAttributes() {
  return {
    description: "start",
    protocolType: "iot",
    parameters: {
      windSpeed: { typology: "enum", enumValues: ["1", "2", "3", "5"], defaultValue: "1" },
      swingMode: { typology: "enum", enumValues: ["auto", "fixed"], defaultValue: "auto" },
      windDirection: { typology: "enum", enumValues: ["1", "2", "3"], defaultValue: "1" },
      windDirectionVertical: { typology: "enum", enumValues: ["1", "2", "3"], defaultValue: "1" },
      windDirectionHorizontal: { typology: "enum", enumValues: ["0", "1", "2"], defaultValue: "0" },
      tempSel: { typology: "range", minimumValue: 16, maximumValue: 30, incrementValue: 1, defaultValue: 22 },
      healthMode: { typology: "enum", enumValues: ["0", "1"], defaultValue: "0" }
    }
  };
}

function realCapabilityAc() {
  const appliance = fakeAc("aa", "Living");
  const categories = {};
  for (const name of ["iot_simple_start", "iot_fan", "iot_uv_and_cool", "iot_self_clean"]) {
    categories[name] = new HonCommand("startProgram", realCapabilityCommandAttributes(), appliance, categories, `PROGRAMS.AC.${name.toUpperCase()}`);
  }
  appliance.commands.startProgram = categories.iot_simple_start;
  return appliance;
}

function realCapabilityCommandAttributes() {
  return {
    description: "start",
    protocolType: "iot",
    parameters: {
      program: { typology: "enum", enumValues: ["iot_simple_start", "iot_fan", "iot_uv_and_cool", "iot_self_clean"], defaultValue: "iot_simple_start" },
      machMode: { typology: "enum", enumValues: ["0", "1", "2", "4", "6"], defaultValue: "2" },
      tempSel: { typology: "range", minimumValue: 16, maximumValue: 30, incrementValue: 1, defaultValue: 22 },
      windSpeed: { typology: "enum", enumValues: ["1", "2", "3", "5"], defaultValue: "5" },
      windDirectionVertical: { typology: "enum", enumValues: ["2", "4", "5", "6", "7", "8"], defaultValue: "5" },
      healthMode: { typology: "range", minimumValue: 0, maximumValue: 1, incrementValue: 1, defaultValue: 0 }
    }
  };
}

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}
