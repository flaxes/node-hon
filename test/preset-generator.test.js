const test = require("node:test");
const assert = require("node:assert/strict");
const { HonAirConditioner } = require("../src/ac");
const { HonAppliance } = require("../src/appliance");
const { HonCommand } = require("../src/command");
const {
  PresetGeneratorError,
  buildPreset,
  getFieldDescriptors,
  getModeOptions,
  listAirConditioners,
  selectAirConditioner,
  selectPresetCommand,
} = require("../src/preset-generator");

test("preset generator lists and selects AC capability entries", () => {
  const capabilities = fixtureCapabilities();

  assert.deepEqual(listAirConditioners(capabilities), [
    "Bedroom_xx-xx-xx-xx-xx-yy",
    "BigRoom_xx-xx-xx-xx-xx-xx",
  ]);
  assert.equal(
    selectAirConditioner(capabilities, "xx-xx-xx-xx-xx-xx").name,
    "BigRoom_xx-xx-xx-xx-xx-xx",
  );
});

test("preset generator prefers startProgram command", () => {
  const selected = selectPresetCommand(
    fixtureCapabilities()["BigRoom_xx-xx-xx-xx-xx-xx"],
  );

  assert.equal(selected.name, "startProgram");
});

test("preset generator resolves mode options from categories", () => {
  const selected = selectPresetCommand(
    fixtureCapabilities()["BigRoom_xx-xx-xx-xx-xx-xx"],
  );

  assert.deepEqual(getModeOptions(selected.command), [
    "iot_cool",
    "iot_fan",
    "iot_simple_start",
  ]);
});

test("preset generator basic mode skips unsupported and fixed fields", () => {
  const selected = selectPresetCommand(
    fixtureCapabilities()["BigRoom_xx-xx-xx-xx-xx-xx"],
  );
  const result = getFieldDescriptors(selected.command, "basic");

  assert.deepEqual(
    result.fields.map((field) => field.name),
    ["tempSel", "windSpeed", "windDirectionVertical"],
  );
  assert.deepEqual(result.skipped, [
    { name: "windDirectionHorizontal", reason: "fixed" },
  ]);
});

test("preset generator advanced mode excludes fixed, custom, and ancillary fields", () => {
  const selected = selectPresetCommand(
    fixtureCapabilities()["BigRoom_xx-xx-xx-xx-xx-xx"],
  );
  const result = getFieldDescriptors(selected.command, "advanced");

  assert.deepEqual(
    result.fields.map((field) => field.name),
    ["healthMode", "machMode", "tempSel", "windDirectionVertical", "windSpeed"],
  );
  assert.ok(
    result.skipped.some(
      (field) => field.name === "program" && field.reason === "internal",
    ),
  );
  assert.ok(
    result.skipped.some(
      (field) => field.name === "remoteVisible" && field.reason === "fixed",
    ),
  );
  assert.ok(
    result.skipped.some(
      (field) =>
        field.name === "windDirectionVerticalPositionSequence" &&
        field.reason === "internal",
    ),
  );
});

test("preset generator validates values before building preset", () => {
  const selected = selectPresetCommand(
    fixtureCapabilities()["BigRoom_xx-xx-xx-xx-xx-xx"],
  );

  assert.throws(
    () => buildPreset(selected.command, { windSpeed: "9" }, "iot_cool"),
    PresetGeneratorError,
  );
});

test("preset generator output can be applied by HonAirConditioner", async () => {
  const selected = selectPresetCommand(
    fixtureCapabilities()["BigRoom_xx-xx-xx-xx-xx-xx"],
  );
  const preset = buildPreset(
    selected.command,
    {
      tempSel: "24",
      windSpeed: "2",
      windDirectionVertical: "5",
      healthMode: "1",
    },
    "iot_cool",
  );
  const appliance = realCapabilityAc();
  /** @type {{ command: string, params: any, programName: string } | null} */
  let sent = null;
  appliance.api = {
    sendCommand: async (
      _appliance,
      command,
      params,
      _ancillary,
      programName,
    ) => {
      sent = { command, params, programName };
      return true;
    },
  };

  await new HonAirConditioner(appliance).applyPreset(preset);

  assert.deepEqual(sent, {
    command: "startProgram",
    params: {
      tempSel: 24,
      windSpeed: "2",
      windDirectionVertical: "5",
      healthMode: 1,
    },
    programName: "PROGRAMS.AC.IOT_COOL",
  });
});

function fixtureCapabilities() {
  return {
    "BigRoom_xx-xx-xx-xx-xx-xx": {
      settings: {
        category: "setParameters",
        categories: ["setParameters", "setConfig"],
        parameters: {
          tempSel: field("parameters", "range", 22, rangeValues(16, 30)),
          windSpeed: field("parameters", "enum", "5", ["1", "2", "3", "5"]),
        },
      },
      startProgram: {
        category: "PROGRAMS.AC.IOT_SIMPLE_START",
        categories: ["iot_simple_start", "iot_cool", "iot_fan"],
        parameters: {
          program: field("custom", "enum", "iot_simple_start", [
            "iot_simple_start",
            "iot_cool",
            "iot_fan",
          ]),
          machMode: field("parameters", "enum", "2", ["0", "1", "2", "4", "6"]),
          tempSel: field("parameters", "range", 22, rangeValues(16, 30)),
          windSpeed: field("parameters", "enum", "5", ["1", "2", "3", "5"]),
          windDirectionVertical: field("parameters", "enum", "5", [
            "2",
            "4",
            "5",
            "6",
            "7",
            "8",
          ]),
          windDirectionHorizontal: field("parameters", "fixed", "0", ["0"]),
          healthMode: field("parameters", "range", 0, ["0", "1"]),
          remoteVisible: field("ancillaryParameters", "fixed", "0", ["0"]),
          windDirectionVerticalPositionSequence: field(
            "ancillaryParameters",
            "enum",
            "0",
            ["2", "4", "5", "6", "7", "8"],
          ),
        },
      },
    },
    "Bedroom_xx-xx-xx-xx-xx-yy": {
      settings: {
        category: "setParameters",
        categories: ["setParameters", "setConfig"],
        parameters: {
          tempSel: field("parameters", "range", 22, rangeValues(16, 30)),
        },
      },
    },
  };
}

function field(group, typology, value, values) {
  return { group, typology, value, values };
}

function rangeValues(min, max) {
  const values = [];
  for (let value = min; value <= max; value += 1) {
    values.push(String(value));
  }
  return values;
}

function fakeAc(macAddress, nickName) {
  return new HonAppliance(null, {
    macAddress,
    applianceTypeName: "AC",
    applianceModelId: "123",
    modelName: "Air Conditioner",
    nickName,
  });
}

function realCapabilityAc() {
  const appliance = fakeAc("aa", "Living");
  const categories = {};
  for (const name of ["iot_simple_start", "iot_cool", "iot_fan"]) {
    categories[name] = new HonCommand(
      "startProgram",
      realCapabilityCommandAttributes(),
      appliance,
      categories,
      `PROGRAMS.AC.${name.toUpperCase()}`,
    );
  }
  appliance.commands.startProgram = categories.iot_simple_start;
  return appliance;
}

function realCapabilityCommandAttributes() {
  return {
    description: "start",
    protocolType: "iot",
    parameters: {
      program: {
        typology: "enum",
        enumValues: ["iot_simple_start", "iot_cool", "iot_fan"],
        defaultValue: "iot_simple_start",
      },
      machMode: {
        typology: "enum",
        enumValues: ["0", "1", "2", "4", "6"],
        defaultValue: "2",
      },
      tempSel: {
        typology: "range",
        minimumValue: 16,
        maximumValue: 30,
        incrementValue: 1,
        defaultValue: 22,
      },
      windSpeed: {
        typology: "enum",
        enumValues: ["1", "2", "3", "5"],
        defaultValue: "5",
      },
      windDirectionVertical: {
        typology: "enum",
        enumValues: ["2", "4", "5", "6", "7", "8"],
        defaultValue: "5",
      },
      healthMode: {
        typology: "range",
        minimumValue: 0,
        maximumValue: 1,
        incrementValue: 1,
        defaultValue: 0,
      },
    },
  };
}

