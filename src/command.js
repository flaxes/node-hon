const { HonApiError } = require("./errors");
const { HonParameterFixed, HonParameterProgram, createParameter } = require("./parameters");

class HonCommand {
  constructor(name, attributes, appliance, categories = null, categoryName = "") {
    this.name = name;
    this.appliance = appliance;
    this.categories = categories || null;
    this.categoryName = categoryName;
    this.parameters = {};
    this.data = {};
    const copy = { ...attributes };
    delete copy.description;
    delete copy.protocolType;
    this.loadParameters(copy);
  }

  loadParameters(attributes) {
    for (const [group, items] of Object.entries(attributes)) {
      if (!items || typeof items !== "object" || Array.isArray(items)) {
        this.data[group] = items;
        continue;
      }
      for (const [name, data] of Object.entries(items)) {
        this.createParameter(data, name, group);
      }
    }
  }

  createParameter(data, name, group) {
    if (name === "zoneMap" && this.appliance.zone) {
      data.default = this.appliance.zone;
    }
    if (data.category === "rule") {
      return;
    }
    const parameter = createParameter(name, data, group);
    if (!parameter) {
      this.data[name] = data;
      return;
    }
    this.parameters[name] = parameter;
    if (this.categoryName) {
      const key = this.categoryName.includes("PROGRAM") ? "program" : "category";
      this.parameters[key] = new HonParameterProgram(key, this, "custom");
    }
  }

  get settings() {
    return this.parameters;
  }

  get parameterGroups() {
    const result = {};
    for (const [name, parameter] of Object.entries(this.parameters)) {
      if (!result[parameter.group]) {
        result[parameter.group] = {};
      }
      result[parameter.group][name] = parameter.internValue;
    }
    return result;
  }

  get mandatoryParameterGroups() {
    const result = {};
    for (const [name, parameter] of Object.entries(this.parameters)) {
      if (!parameter.mandatory) {
        continue;
      }
      if (!result[parameter.group]) {
        result[parameter.group] = {};
      }
      result[parameter.group][name] = parameter.internValue;
    }
    return result;
  }

  get parameterValue() {
    return Object.fromEntries(Object.entries(this.parameters).map(([name, parameter]) => [name, parameter.value]));
  }

  get category() {
    return this.categoryName;
  }

  set category(category) {
    if (this.categories && this.categories[category]) {
      this.appliance.commands[this.name] = this.categories[category];
    }
  }

  get settingKeys() {
    const result = new Set();
    for (const command of Object.values(this.categories || { _: this })) {
      for (const key of Object.keys(command.parameters)) {
        result.add(key);
      }
    }
    return [...result];
  }

  get availableSettings() {
    const result = {};
    for (const command of Object.values(this.categories || { _: this })) {
      for (const [name, parameter] of Object.entries(command.parameters)) {
        if (!result[name] || parameter.values.length > result[name].values.length) {
          result[name] = parameter;
        }
      }
    }
    return result;
  }

  async send(onlyMandatory = false) {
    const groupedParams = onlyMandatory ? this.mandatoryParameterGroups : this.parameterGroups;
    return this.sendParameters(groupedParams.parameters || {});
  }

  async sendSpecific(paramNames) {
    const params = {};
    for (const [key, parameter] of Object.entries(this.parameters)) {
      if (paramNames.includes(key) || parameter.mandatory) {
        params[key] = parameter.value;
      }
    }
    return this.sendParameters(params);
  }

  async sendParameters(params) {
    const ancillaryParams = { ...(this.parameterGroups.ancillaryParameters || {}) };
    delete ancillaryParams.programRules;
    if (params.prStr) {
      params.prStr = this.categoryName.toUpperCase();
    }
    this.appliance.syncCommandToParams(this.name);
    const result = await this.appliance.api.sendCommand(this.appliance, this.name, params, ancillaryParams, this.categoryName);
    if (!result) {
      throw new HonApiError("Can't send command", { command: this.name, params });
    }
    return result;
  }

  reset() {
    for (const parameter of Object.values(this.parameters)) {
      parameter.reset();
    }
  }
}

function isCommand(data) {
  return Boolean(data && typeof data === "object" && data.description !== undefined && data.protocolType !== undefined);
}

function cleanName(category) {
  if (category.includes("PROGRAM")) {
    return category.split(".").pop().toLowerCase();
  }
  return category;
}

class HonCommandLoader {
  constructor(api, appliance) {
    this.api = api;
    this.appliance = appliance;
    this.apiCommands = {};
    this.favourites = [];
    this.commandHistory = [];
    this.commands = {};
    this.applianceData = {};
    this.additionalData = {};
    this.rawCommands = {};
  }

  async loadCommands() {
    const [commands, favourites, history] = await Promise.all([
      this.api.loadCommands(this.appliance),
      this.api.loadFavourites(this.appliance),
      this.api.loadCommandHistory(this.appliance)
    ]);
    this.apiCommands = { ...(commands || {}) };
    this.rawCommands = { ...(commands || {}) };
    this.favourites = favourites || [];
    this.commandHistory = history || [];
    this.applianceData = this.apiCommands.applianceModel || {};
    delete this.apiCommands.applianceModel;
    this.getCommands();
    this.addFavourites();
    this.recoverLastCommandStates();
  }

  loadFromCache(cacheData) {
    this.apiCommands = { ...(cacheData.commands || {}) };
    this.rawCommands = { ...(cacheData.commands || {}) };
    this.favourites = [];
    this.commandHistory = [];
    this.applianceData = cacheData.applianceModel || {};
    this.additionalData = cacheData.additionalData || {};
    this.getCommands();
  }

  getCommands() {
    const commands = [];
    for (const [name, data] of Object.entries(this.apiCommands)) {
      const command = this.parseCommand(data, name);
      if (command) {
        commands.push(command);
      }
    }
    this.commands = Object.fromEntries(commands.map((command) => [command.name, command]));
  }

  parseCommand(data, commandName, categories = null, categoryName = "") {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      this.additionalData[commandName] = data;
      return null;
    }
    if (isCommand(data)) {
      return new HonCommand(commandName, data, this.appliance, categories, categoryName);
    }
    return this.parseCategories(data, commandName);
  }

  parseCategories(data, commandName) {
    const categories = {};
    for (const [category, value] of Object.entries(data)) {
      const command = this.parseCommand(value, commandName, categories, category);
      if (command) {
        categories[cleanName(category)] = command;
      }
    }
    if (!Object.keys(categories).length) {
      return null;
    }
    return categories.setParameters || Object.values(categories)[0];
  }

  recoverLastCommandStates() {
    for (const [name, baseCommand] of Object.entries(this.commands)) {
      const last = this.commandHistory.find((item) => item?.command?.commandName === name);
      if (!last) {
        continue;
      }
      const parameters = { ...(last.command.parameters || {}) };
      let command = baseCommand;
      const program = parameters.program;
      const category = parameters.category;
      delete parameters.program;
      delete parameters.category;
      if (program && command.categories) {
        command.category = cleanName(program);
        command = this.commands[name];
      } else if (category && command.categories) {
        command.category = category;
        command = this.commands[name];
      }
      for (const [key, value] of Object.entries(parameters)) {
        if (command.settings[key]) {
          try {
            command.settings[key].value = value;
          } catch {
            // keep discovered default
          }
        }
      }
    }
  }

  addFavourites() {
    for (const favourite of this.favourites) {
      const commandName = favourite?.command?.commandName || "";
      const programName = cleanName(favourite?.command?.programName || "");
      const base = this.commands[commandName]?.categories?.[programName];
      if (!base) {
        continue;
      }
      const clone = Object.create(Object.getPrototypeOf(base));
      Object.assign(clone, base, { parameters: { ...base.parameters } });
      for (const value of Object.values(favourite.command || {})) {
        if (!value || typeof value === "string") {
          continue;
        }
        for (const [key, paramValue] of Object.entries(value)) {
          if (clone.parameters[key]) {
            try {
              clone.parameters[key].value = paramValue;
            } catch {
              // keep default
            }
          }
        }
      }
      clone.parameters.favourite = new HonParameterFixed("favourite", { fixedValue: "1" }, "custom");
      if (clone.parameters.program && typeof clone.parameters.program.setValue === "function") {
        clone.parameters.program.setValue(favourite.favouriteName);
      }
      this.commands[commandName].categories[favourite.favouriteName] = clone;
    }
  }
}

module.exports = { HonCommand, HonCommandLoader, isCommand, cleanName };
