"use strict";

const path = require("node:path");
const { HonDevice } = require("./device");
const { SessionStore } = require("./session-store");
const { HonAuth } = require("./auth");
const { HonAPI } = require("./api");
const { HonAppliance, isAirConditioner } = require("./appliance");
const { HonAirConditioner } = require("./ac");
const { ApplianceNotFoundError } = require("./errors");

class HonClient {
  constructor(config = {}) {
    this.config = config;
    this.fetch = config.fetch || globalThis.fetch;
    this.device = new HonDevice(config.mobileId);
    const sessionFile = config.sessionFile ? path.resolve(config.sessionFile) : "";
    this.sessionStore = sessionFile ? new SessionStore(sessionFile) : null;
    this.auth = new HonAuth({
      email: config.email,
      password: config.password,
      device: this.device,
      fetchImpl: this.fetch,
      sessionStore: this.sessionStore,
      debug: Boolean(config.debug)
    });
    this.api = new HonAPI(this.auth, this.device, this.fetch);
    this.appliances = [];
  }

  async create() {
    await this.login();
    await this.setup();
    return this;
  }

  async login() {
    await this.auth.initialize();
    return this;
  }

  async refresh() {
    return this.auth.refresh();
  }

  async setup() {
    this.appliances = [];
    const appliances = await this.api.loadAppliances();
    for (const applianceData of appliances) {
      const zones = Number(applianceData.zone || 0);
      if (zones > 1) {
        for (let zone = 1; zone <= zones; zone += 1) {
          await this.createAppliance({ ...applianceData }, zone);
        }
      }
      await this.createAppliance(applianceData);
    }
  }

  async createAppliance(applianceData, zone = 0) {
    const appliance = new HonAppliance(this.api, applianceData, zone);
    if (!appliance.macAddress) {
      return;
    }
    await appliance.loadCommands();
    await appliance.loadAttributes();
    await appliance.loadStatistics();
    this.appliances.push(appliance);
  }

  async getAppliances() {
    if (!this.appliances.length) {
      await this.setup();
    }
    return this.appliances;
  }

  async getAirConditioners() {
    const appliances = await this.getAppliances();
    return appliances.filter(isAirConditioner).map((appliance) => new HonAirConditioner(appliance));
  }

  async getAirConditionerById(id) {
    const airConditioners = await this.getAirConditioners();
    if (!id) {
      throw new ApplianceNotFoundError("AC_ID is required", { available: airConditioners.map((ac) => ac.identifiers) });
    }
    const fields = ["macAddress", "uniqueId", "nickName"];
    for (const field of fields) {
      const matches = airConditioners.filter((ac) => ac[field] === id);
      if (matches.length === 1) {
        return matches[0];
      }
      if (matches.length > 1) {
        throw new ApplianceNotFoundError(`AC_ID matches multiple air conditioners by ${field}`, {
          id,
          field,
          matches: matches.map((ac) => ac.identifiers)
        });
      }
    }
    throw new ApplianceNotFoundError(`No air conditioner found for AC_ID: ${id}`, {
      id,
      available: airConditioners.map((ac) => ac.identifiers)
    });
  }

  async close() {
    return undefined;
  }
}

module.exports = { HonClient };
