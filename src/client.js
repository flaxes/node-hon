"use strict";

const path = require("node:path");
const { HonDevice } = require("./device");
const { SessionStore } = require("./session-store");
const { HonAuth } = require("./auth");
const { HonAPI } = require("./api");
const { HonAppliance, isAirConditioner } = require("./appliance");
const { HonAirConditioner } = require("./ac");
const { ApplianceNotFoundError } = require("./errors");
const { DebugLogger } = require("./logger");
const { ApplianceCache } = require("./appliance-cache");

class HonClient {
  constructor(config = {}) {
    this.config = config;
    this.fetch = config.fetch || globalThis.fetch;
    this.logger =
      config.logger || new DebugLogger({ enabled: Boolean(config.debug) });
    this.device = new HonDevice(config.mobileId);
    const sessionFile = config.sessionFile
      ? path.resolve(config.sessionFile)
      : "";

    /** @type {SessionStore | null} */
    this.sessionStore = sessionFile ? new SessionStore(sessionFile) : null;
    this.applianceCache = new ApplianceCache(config.applianceCacheFile || "./.hon-appliance-cache.json");
    this.forceApplianceCacheRefresh = Boolean(config.forceApplianceCacheRefresh);
    this.auth = new HonAuth({
      email: config.email,
      password: config.password,
      device: this.device,
      fetchImpl: this.fetch,
      sessionStore: this.sessionStore,
      debug: Boolean(config.debug),
      logger: this.logger,
    });
    this.api = new HonAPI(this.auth, this.device, this.fetch, this.logger);
    this.appliances = [];
  }

  async create() {
    const operation = this.logger.start("Creating hOn client...");
    try {
      await this.login();
      // await this.setup();
      operation.success("hOn client ready");
    } catch (error) {
      operation.failure("hOn client setup failed");
      throw error;
    }
    return this;
  }

  async login() {
    const operation = this.logger.start("Trying to login...");
    try {
      await this.auth.initialize();
      operation.success("Login success");
    } catch (error) {
      operation.failure("Login failed");
      throw error;
    }
    return this;
  }

  async refresh() {
    const operation = this.logger.start("Refreshing login...");
    try {
      const result = await this.auth.refresh();
      operation.success(result ? "Refresh success" : "Refresh skipped");
      return result;
    } catch (error) {
      operation.failure("Refresh failed");
      throw error;
    }
  }

  async setupOne(id) {
    const appliances = await this.api.loadAppliances();
    for (const applianceData of appliances) {
      const appliance = new HonAppliance(this.api, applianceData);
      if ([appliance.macAddress, appliance.uniqueId, appliance.nickName].includes(id)) {
        return this.#createApplianceSetup(appliance);
      }
    }
  }

  async getAirConditionerByIdCached(id) {
    if (!id) {
      throw new ApplianceNotFoundError("AC_ID is required", { available: [] });
    }
    if (!this.forceApplianceCacheRefresh) {
      const operation = this.logger.start(`Loading AC from cache: "${id}"...`);
      try {
        const record = await this.applianceCache.find(id);
        if (record) {
          const appliance = HonAppliance.fromCacheRecord(this.api, record);
          operation.success(`Loaded AC from cache: "${id}"`);
          return new HonAirConditioner(appliance, this.logger);
        }
        operation.failure(`AC cache miss: "${id}"`);
      } catch (error) {
        operation.failure(`AC cache failed: "${id}"`);
      }
    }

    const refresh = this.logger.start(`Refreshing AC cache: "${id}"...`);
    const appliance = await this.setupOne(id);
    if (!appliance) {
      refresh.failure(`AC cache refresh failed: "${id}"`);
      throw new ApplianceNotFoundError(`No air conditioner found for AC_ID: ${id}`, { id, available: [] });
    }
    await this.applianceCache.upsert(appliance.toCacheRecord());
    refresh.success(`AC cache refreshed: "${id}"`);
    return new HonAirConditioner(appliance, this.logger);
  }

  async setup() {
    const operation = this.logger.start("Loading appliances...");

    try {
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
      operation.success(`Loaded ${this.appliances.length} appliance(s)`);
    } catch (error) {
      operation.failure("Loading appliances failed");
      throw error;
    }
  }

  /**
   * @param {HonAppliance} appliance
   */
  async #createApplianceSetup(appliance) {
    const label = appliance.nickName || appliance.macAddress;
    if (!this.appliances) this.appliances = [];
    const operation = this.logger.start(`Loading appliance: "${label}"...`);

    try {
      const promises = [
        appliance.loadCommands(),
        appliance.loadAttributes(),
        appliance.loadStatistics(),
      ];
      await Promise.all(promises);

      this.appliances.push(appliance);
      operation.success(`Loaded appliance: "${label}"`);

      return appliance;
    } catch (error) {
      operation.failure(`Loading appliance failed: "${label}"`);
      throw error;
    }
  }

  async createAppliance(applianceData, zone = 0) {
    const appliance = new HonAppliance(this.api, applianceData, zone);
    if (!appliance.macAddress) {
      return;
    }

    return this.#createApplianceSetup(appliance);
  }

  async getAppliances() {
    if (!this.appliances.length) {
      await this.setup();
    }
    return this.appliances;
  }

  async getAirConditioners() {
    const appliances = await this.getAppliances();
    return appliances
      .filter(isAirConditioner)
      .map((appliance) => new HonAirConditioner(appliance, this.logger));
  }

  async getAirConditionerByIdFast(id) {
    const appliance = await this.setupOne(id);
    if (!appliance) return;

    return new HonAirConditioner(appliance, this.logger);
  }

  async getAirConditionerById(id) {
    const airConditioners = await this.getAirConditioners();
    if (!id) {
      throw new ApplianceNotFoundError("AC_ID is required", {
        available: airConditioners.map((ac) => ac.identifiers),
      });
    }
    const fields = ["macAddress", "uniqueId", "nickName"];
    for (const field of fields) {
      const matches = airConditioners.filter((ac) => ac[field] === id);
      if (matches.length === 1) {
        return matches[0];
      }
      if (matches.length > 1) {
        throw new ApplianceNotFoundError(
          `AC_ID matches multiple air conditioners by ${field}`,
          {
            id,
            field,
            matches: matches.map((ac) => ac.identifiers),
          },
        );
      }
    }
    throw new ApplianceNotFoundError(
      `No air conditioner found for AC_ID: ${id}`,
      {
        id,
        available: airConditioners.map((ac) => ac.identifiers),
      },
    );
  }

  async close() {
    return undefined;
  }
}

module.exports = { HonClient };
