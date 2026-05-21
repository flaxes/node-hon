const { HonCommandLoader } = require("./command");
const { HonParameter, HonParameterRange, HonParameterEnum } = require("./parameters");

class HonAppliance {
  constructor(api, info, zone = 0) {
    if (Array.isArray(info.attributes)) {
      info = {
        ...info,
        attributes: Object.fromEntries(info.attributes.map((value) => [value.parName, value.parValue]))
      };
    }
    this.api = api;
    this.info = info || {};
    this.zone = zone;
    this.applianceModel = {};
    this.commands = {};
    this.statistics = {};
    this.attributes = {};
    this.additionalData = {};
    this.rawCommands = {};
    this.lastUpdate = null;
    this.defaultSetting = new HonParameter("", {}, "");
    this.connection = this.attributes?.lastConnEvent?.category !== "DISCONNECTED";
  }

  get applianceModelId() {
    return String(this.info.applianceModelId || "");
  }

  get applianceType() {
    return String(this.info.applianceTypeName || "");
  }

  get macAddress() {
    return String(this.info.macAddress || "");
  }

  get uniqueId() {
    const defaultMac = "xx-xx-xx-xx-xx-xx";
    const importName = `${this.applianceType.toLowerCase()}_${this.applianceModelId}`;
    return this.checkNameZone("macAddress", false).replace(defaultMac, importName);
  }

  get modelName() {
    return this.checkNameZone("modelName");
  }

  get brand() {
    const brand = this.checkNameZone("brand");
    return brand ? brand[0].toUpperCase() + brand.slice(1) : "";
  }

  get nickName() {
    const result = this.checkNameZone("nickName");
    if (!result || /^[xX1\s-]+$/.test(result)) {
      return this.modelName;
    }
    return result;
  }

  get code() {
    if (this.info.code) {
      return this.info.code;
    }
    const serialNumber = String(this.info.serialNumber || "");
    return serialNumber.length < 18 ? serialNumber.slice(0, 8) : serialNumber.slice(0, 11);
  }

  get modelId() {
    return Number(this.info.applianceModelId || 0);
  }

  get options() {
    return { ...(this.applianceModel.options || {}) };
  }

  get commandParameters() {
    return Object.fromEntries(Object.entries(this.commands).map(([name, command]) => [name, command.parameterValue]));
  }

  get settings() {
    const result = {};
    for (const [name, command] of Object.entries(this.commands)) {
      for (const key of command.settingKeys) {
        result[`${name}.${key}`] = command.settings[key] || this.defaultSetting;
      }
    }
    return result;
  }

  get data() {
    return {
      attributes: this.attributes,
      appliance: this.info,
      statistics: this.statistics,
      additional_data: this.additionalData,
      ...this.commandParameters,
      ...this.attributes
    };
  }

  checkNameZone(name, frontend = true) {
    const zone = frontend ? " Z" : "_z";
    const attribute = String(this.info[name] || "");
    if (attribute && this.zone) {
      return `${attribute}${zone}${this.zone}`;
    }
    return attribute;
  }

  async loadCommands() {
    const loader = new HonCommandLoader(this.api, this);
    await loader.loadCommands();
    this.commands = loader.commands;
    this.additionalData = loader.additionalData;
    this.applianceModel = loader.applianceData;
    this.rawCommands = loader.rawCommands;
    this.syncParamsToCommand("settings");
  }

  loadCommandsFromCache(cacheData) {
    const loader = new HonCommandLoader(this.api, this);
    loader.loadFromCache(cacheData);
    this.commands = loader.commands;
    this.additionalData = loader.additionalData;
    this.applianceModel = loader.applianceData;
    this.rawCommands = loader.rawCommands;
  }

  toCacheRecord() {
    return {
      cachedAt: new Date().toISOString(),
      info: this.info,
      zone: this.zone,
      macAddress: this.macAddress,
      uniqueId: this.uniqueId,
      nickName: this.nickName,
      commandData: {
        commands: this.rawCommands || {},
        applianceModel: this.applianceModel,
        additionalData: this.additionalData
      }
    };
  }

  static fromCacheRecord(api, record) {
    const appliance = new HonAppliance(api, record.info, record.zone || 0);
    appliance.loadCommandsFromCache(record.commandData || {});
    return appliance;
  }

  async loadAttributes() {
    const attributes = await this.api.loadAttributes(this);
    const shadow = attributes?.shadow?.parameters || {};
    delete attributes.shadow;
    for (const [name, values] of Object.entries(shadow)) {
      if (this.attributes.parameters?.[name]) {
        Object.assign(this.attributes.parameters[name], values);
      } else {
        if (!this.attributes.parameters) {
          this.attributes.parameters = {};
        }
        this.attributes.parameters[name] = values;
      }
    }
    Object.assign(this.attributes, attributes || {});
  }

  async loadStatistics() {
    this.statistics = {
      ...(await this.api.loadStatistics(this)),
      ...(await this.api.loadMaintenance(this))
    };
  }

  async update(force = false) {
    const now = Date.now();
    if (force || !this.lastUpdate || this.lastUpdate + 5000 < now) {
      this.lastUpdate = now;
      await this.loadAttributes();
      this.syncParamsToCommand("settings");
    }
  }

  syncCommandToParams(commandName) {
    const command = this.commands[commandName];
    if (!command || !this.attributes.parameters) {
      return;
    }
    for (const key of Object.keys(this.attributes.parameters)) {
      const next = command.parameters[key];
      if (next) {
        this.attributes.parameters[key].value = String(next.internValue);
      }
    }
  }

  syncParamsToCommand(commandName) {
    const command = this.commands[commandName];
    if (!command || !this.attributes.parameters) {
      return;
    }
    for (const key of command.settingKeys) {
      const next = this.attributes.parameters[key];
      if (!next || next.value === "") {
        continue;
      }
      const setting = command.settings[key];
      if (!setting) {
        continue;
      }
      try {
        setting.value = setting instanceof HonParameterRange ? Number(next.value) : String(next.value);
      } catch {
        // Keep server-provided default if current attribute is outside command constraints.
      }
    }
  }

  /**
   * @param {string} main
   * @param {string | string[] | null} [target]
   * @param {string | string[] | null} [toSync]
   */
  syncCommand(main, target = null, toSync = null) {
    const base = this.commands[main];
    if (!base) {
      return;
    }
    const targets = Array.isArray(target) ? target : target ? [target] : null;
    for (const [name, command] of Object.entries(this.commands)) {
      if (name === main || (targets && !targets.includes(name))) {
        continue;
      }
      for (const [paramName, targetParam] of Object.entries(command.parameters)) {
        const baseParam = base.parameters[paramName];
        if (!baseParam) {
          continue;
        }
        if (toSync && ((Array.isArray(toSync) && !toSync.includes(paramName)) || !baseParam.mandatory)) {
          continue;
        }
        this.syncParameter(baseParam, targetParam);
      }
    }
  }

  syncParameter(main, target) {
    if (main instanceof HonParameterRange && target instanceof HonParameterRange) {
      target.max = main.max;
      target.min = main.min;
      target.step = main.step;
    } else if (target instanceof HonParameterRange) {
      target.max = Number(main.value);
      target.min = Number(main.value);
      target.step = 1;
    } else if (target instanceof HonParameterEnum) {
      target.values = main.values;
    }
    target.value = main.value;
  }
}

function isAirConditioner(appliance) {
  const values = [
    appliance.applianceType,
    appliance.nickName,
    appliance.modelName,
    appliance.info.applianceType,
    appliance.info.applianceTypeCode
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return values.some((value) => value === "ac" || value.includes("air condition") || value.includes("conditioner"));
}

module.exports = { HonAppliance, isAirConditioner };
