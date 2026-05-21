"use strict";

const fs = require("node:fs");

const BASIC_FIELDS = ["tempSel", "windSpeed", "windDirectionVertical", "windDirectionHorizontal"];
const PRESET_COMMAND_ORDER = ["startProgram", "settings"];

class PresetGeneratorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PresetGeneratorError";
    this.details = details;
  }
}

function loadCapabilitiesFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return validateCapabilities(JSON.parse(text));
}

function validateCapabilities(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new PresetGeneratorError("Capabilities file must contain a JSON object");
  }
  for (const [deviceName, commands] of Object.entries(data)) {
    if (!commands || typeof commands !== "object" || Array.isArray(commands)) {
      throw new PresetGeneratorError(`Capabilities for ${deviceName} must be an object`);
    }
  }
  return data;
}

function listAirConditioners(capabilities) {
  return Object.keys(validateCapabilities(capabilities)).sort();
}

function selectAirConditioner(capabilities, acId = "") {
  const names = listAirConditioners(capabilities);
  if (!names.length) {
    throw new PresetGeneratorError("No air conditioners found in capabilities file");
  }
  if (!acId) {
    return { name: names[0], capabilities: capabilities[names[0]] };
  }
  const matches = names.filter((name) => name === acId || name.endsWith(`_${acId}`) || name.includes(acId));
  if (matches.length === 1) {
    return { name: matches[0], capabilities: capabilities[matches[0]] };
  }
  if (matches.length > 1) {
    throw new PresetGeneratorError(`AC_ID matched multiple capability entries: ${acId}`, { matches });
  }
  throw new PresetGeneratorError(`AC_ID did not match any capability entry: ${acId}`, { available: names });
}

function selectPresetCommand(deviceCapabilities) {
  const orderedNames = [
    ...PRESET_COMMAND_ORDER,
    ...Object.keys(deviceCapabilities).filter((name) => !PRESET_COMMAND_ORDER.includes(name))
  ];
  for (const name of orderedNames) {
    const command = deviceCapabilities[name];
    if (isCommandCapability(command)) {
      return { name, command };
    }
  }
  throw new PresetGeneratorError("No usable command capabilities found for selected AC");
}

function getModeOptions(command) {
  const categories = Array.isArray(command.categories) ? command.categories.filter(Boolean) : [];
  if (categories.length) {
    return [...new Set(categories)].sort();
  }
  const program = command.parameters?.program;
  if (Array.isArray(program?.values)) {
    return [...new Set(program.values.map(String))].sort();
  }
  return [];
}

function getFieldDescriptors(command, mode = "basic") {
  const parameters = command.parameters || {};
  const names = mode === "advanced" ? Object.keys(parameters).sort() : BASIC_FIELDS;
  const fields = [];
  const skipped = [];
  for (const name of names) {
    const parameter = parameters[name];
    if (!parameter) {
      skipped.push({ name, reason: "unsupported" });
      continue;
    }
    if (!isSettableParameter(parameter)) {
      skipped.push({ name, reason: parameter.typology === "fixed" ? "fixed" : "internal" });
      continue;
    }
    fields.push(describeField(name, parameter));
  }
  return { fields, skipped };
}

function buildPreset(command, selectedValues, mode = "") {
  const preset = {};
  const modeOptions = getModeOptions(command);
  if (mode) {
    if (modeOptions.length && !modeOptions.includes(mode)) {
      throw new PresetGeneratorError(`Unsupported mode value: ${mode}`, { values: modeOptions });
    }
    preset.mode = mode;
  }
  for (const [name, value] of Object.entries(selectedValues)) {
    const parameter = command.parameters?.[name];
    if (!parameter) {
      throw new PresetGeneratorError(`Unsupported preset field: ${name}`);
    }
    if (!isSettableParameter(parameter)) {
      throw new PresetGeneratorError(`Preset field is not settable: ${name}`);
    }
    if (!isAllowedValue(parameter, value)) {
      throw new PresetGeneratorError(`Unsupported value for ${name}: ${value}`, { values: parameter.values || [] });
    }
    preset[name] = value;
  }
  return preset;
}

function defaultValueForField(field) {
  return field.value == null ? field.values[0] || "" : String(field.value);
}

function isCommandCapability(command) {
  return Boolean(command && typeof command === "object" && !Array.isArray(command) && command.parameters);
}

function isSettableParameter(parameter) {
  if (!parameter || parameter.typology === "fixed") {
    return false;
  }
  if (parameter.group && parameter.group !== "parameters") {
    return false;
  }
  return Array.isArray(parameter.values) && parameter.values.length > 0;
}

function describeField(name, parameter) {
  return {
    name,
    group: parameter.group || "",
    typology: parameter.typology || "",
    value: parameter.value,
    values: Array.isArray(parameter.values) ? parameter.values.map(String) : []
  };
}

function isAllowedValue(parameter, value) {
  const values = Array.isArray(parameter.values) ? parameter.values.map(String) : [];
  return values.includes(String(value));
}

module.exports = {
  BASIC_FIELDS,
  PresetGeneratorError,
  buildPreset,
  defaultValueForField,
  getFieldDescriptors,
  getModeOptions,
  listAirConditioners,
  loadCapabilitiesFile,
  selectAirConditioner,
  selectPresetCommand,
  validateCapabilities
};
