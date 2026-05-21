"use strict";

const fs = require("node:fs/promises");
const { UnsupportedControlError } = require("./errors");
const { cleanValue } = require("./parameters");

const POWER_ON_COMMANDS = ["startProgram", "start", "resumeProgram", "powerOn", "turnOn"];
const POWER_OFF_COMMANDS = ["stopProgram", "stop", "pauseProgram", "powerOff", "turnOff"];
const PRESET_COMMAND_ORDER = ["startProgram", "settings"];

class HonAirConditioner {
  constructor(appliance) {
    this.appliance = appliance;
  }

  get macAddress() {
    return this.appliance.macAddress;
  }

  get uniqueId() {
    return this.appliance.uniqueId;
  }

  get nickName() {
    return this.appliance.nickName;
  }

  get identifiers() {
    return {
      macAddress: this.macAddress,
      uniqueId: this.uniqueId,
      nickName: this.nickName
    };
  }

  async powerOn() {
    const command = this.findCommand(POWER_ON_COMMANDS);
    if (!command) {
      return this.setPowerValue(true);
    }
    return command.send();
  }

  async powerOff() {
    const command = this.findCommand(POWER_OFF_COMMANDS);
    if (!command) {
      return this.setPowerValue(false);
    }
    return command.send();
  }

  async setMode(value) {
    return this.setControl(["machMode", "mode", "program", "prStr"], value);
  }

  async setTargetTemperature(value) {
    return this.setControl(["tempSel", "targetTemperature", "temperature", "temp", "setTemperature"], value);
  }

  async setFanSpeed(value) {
    return this.setControl(["windSpeed", "fanSpeed", "fan", "airFlow"], value);
  }

  async setSwing(value) {
    return this.setControl(["windDirectionVertical", "windDirection", "swing", "swingMode", "airDirection"], value);
  }

  async sendCommand(name, params = {}) {
    const command = this.appliance.commands[name];
    if (!command) {
      throw this.unsupported(`command:${name}`);
    }
    for (const [key, value] of Object.entries(params)) {
      if (!command.parameters[key]) {
        throw this.unsupported(`${name}.${key}`);
      }
      command.parameters[key].value = value;
    }
    return command.sendSpecific(Object.keys(params));
  }

  async applyPresetFile(filePath) {
    const text = await fs.readFile(filePath, "utf8");
    return this.applyPreset(JSON.parse(text));
  }

  async applyPreset(preset) {
    if (!preset || typeof preset !== "object" || Array.isArray(preset)) {
      throw this.unsupported("preset", { reason: "Preset must be a JSON object" });
    }
    const resolved = this.resolvePreset(preset);
    for (const { parameter, value } of resolved.params) {
      parameter.value = value;
    }
    return resolved.command.sendSpecific(resolved.params.map(({ key }) => key));
  }

  resolvePreset(preset) {
    const errors = [];
    for (const command of this.presetCommandCandidates(preset.mode)) {
      const resolved = this.tryResolvePresetForCommand(command, preset);
      if (resolved.ok) {
        return resolved;
      }
      errors.push(resolved.error);
    }
    throw this.unsupported("preset", {
      preset,
      failures: errors,
      available: this.capabilities()
    });
  }

  presetCommandCandidates(mode) {
    const ordered = [];
    for (const name of PRESET_COMMAND_ORDER) {
      if (this.appliance.commands[name]) {
        ordered.push(this.appliance.commands[name]);
      }
    }
    for (const [name, command] of Object.entries(this.appliance.commands)) {
      if (!PRESET_COMMAND_ORDER.includes(name)) {
        ordered.push(command);
      }
    }
    return ordered.map((command) => this.commandForMode(command, mode));
  }

  commandForMode(command, mode) {
    if (!mode || !command.categories) {
      return command;
    }
    const wanted = cleanValue(mode);
    if (command.categories[wanted]) {
      return command.categories[wanted];
    }
    return (
      Object.entries(command.categories).find(([category]) => cleanValue(category) === wanted)?.[1] ||
      command
    );
  }

  tryResolvePresetForCommand(command, preset) {
    const params = [];
    const seen = new Set();
    for (const [field, value] of Object.entries(preset)) {
      if (field === "mode") {
        if (this.modeMatchesCommand(command, value)) {
          continue;
        }
        const modeParam = this.resolveExactParameter(command, field, value);
        if (modeParam) {
          params.push(modeParam);
          seen.add(modeParam.key);
          continue;
        }
        return this.unresolved(command, field, value);
      }
      const resolved = this.resolveExactParameter(command, field, value);
      if (!resolved) {
        return this.unresolved(command, field, value);
      }
      if (!seen.has(resolved.key)) {
        params.push(resolved);
        seen.add(resolved.key);
      }
    }
    return { ok: true, command, params };
  }

  modeMatchesCommand(command, mode) {
    return Boolean(command.categoryName && cleanValue(command.categoryName.split(".").pop()) === cleanValue(mode));
  }

  resolveExactParameter(command, key, value) {
    const parameter = command.parameters[key];
    if (!parameter || !this.canSetValue(parameter, value)) {
      return null;
    }
    return { key, parameter, value };
  }

  canSetValue(parameter, value) {
    try {
      const original = parameter.value;
      parameter.value = value;
      parameter.value = original;
      return true;
    } catch {
      return false;
    }
  }

  unresolved(command, field, value) {
    return {
      ok: false,
      error: {
        command: command.name,
        category: command.categoryName,
        presetField: field,
        requestedValue: value,
        parameters: Object.keys(command.parameters),
        matches: this.describeParameter(command, field)
      }
    };
  }

  describeParameter(command, key) {
    const keys = [key];
    return Object.fromEntries(
      keys
        .filter((name) => command.parameters[name])
        .map((name) => [
          name,
          {
            typology: command.parameters[name].typology,
            value: command.parameters[name].value,
            values: command.parameters[name].values
          }
        ])
    );
  }

  async setControl(keys, value) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const command of Object.values(this.appliance.commands)) {
      for (const key of keyList) {
        const parameter = command.parameters[key];
        if (!parameter) {
          continue;
        }
        parameter.value = value;
        return command.sendSpecific([key]);
      }
    }
    throw this.unsupported(keyList[0]);
  }

  async setPowerValue(on) {
    const candidates = ["onOffStatus", "onOff", "power", "airConditionerStatus"];
    for (const command of Object.values(this.appliance.commands)) {
      for (const key of candidates) {
        const parameter = command.parameters[key];
        if (!parameter) {
          continue;
        }
        const value = choosePowerValue(parameter, on);
        if (value == null) {
          continue;
        }
        parameter.value = value;
        return command.sendSpecific([key]);
      }
    }
    throw this.unsupported(on ? "powerOn" : "powerOff");
  }

  findCommand(names) {
    for (const name of names) {
      if (this.appliance.commands[name]) {
        return this.appliance.commands[name];
      }
    }
    return null;
  }

  unsupported(control, details = {}) {
    return new UnsupportedControlError(`AC control is not available: ${control}`, {
      control,
      appliance: this.identifiers,
      commands: Object.keys(this.appliance.commands),
      ...details
    });
  }

  capabilities() {
    return Object.fromEntries(
      Object.entries(this.appliance.commands).map(([name, command]) => [
        name,
        describeCommand(command)
      ])
    );
  }
}

function choosePowerValue(parameter, on) {
  const values = parameter.values || [];
  const preferred = on ? ["1", "on", "true", "start", "run"] : ["0", "off", "false", "stop"];
  for (const value of preferred) {
    if (values.includes(value)) {
      return value;
    }
  }
  if (values.length === 2) {
    return on ? values[1] : values[0];
  }
  return null;
}

function describeCommand(command) {
  const result = {
    category: command.categoryName || "",
    categories: command.categories ? Object.keys(command.categories) : [],
    parameters: {}
  };
  for (const [key, parameter] of Object.entries(command.parameters)) {
    result.parameters[key] = {
      group: parameter.group,
      typology: parameter.typology,
      value: parameter.value,
      values: parameter.values
    };
  }
  return result;
}

module.exports = { HonAirConditioner };
