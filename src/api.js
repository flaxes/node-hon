"use strict";

const constants = require("./constants");
const { HonConnection, HonAnonymousConnection } = require("./connection");
const { HonApiError } = require("./errors");

class HonAPI {
  constructor(auth, device, fetchImpl = globalThis.fetch, logger = null) {
    this.auth = auth;
    this.device = device;
    this.logger = logger;
    this.hon = new HonConnection(auth, fetchImpl);
    this.anonymous = new HonAnonymousConnection(fetchImpl);
  }

  async loadAppliances() {
    const response = await this.hon.get(`${constants.API_URL}/commands/v1/appliance`);
    const result = await response.json();
    return result?.payload?.appliances || [];
  }

  async loadCommands(appliance) {
    const params = new URLSearchParams({
      applianceType: appliance.applianceType,
      applianceModelId: appliance.applianceModelId,
      macAddress: appliance.macAddress,
      os: constants.OS,
      appVersion: constants.APP_VERSION,
      code: appliance.code
    });
    if (appliance.info.eepromId) {
      params.set("firmwareId", appliance.info.eepromId);
    }
    if (appliance.info.fwVersion) {
      params.set("fwVersion", appliance.info.fwVersion);
    }
    if (appliance.info.series) {
      params.set("series", appliance.info.series);
    }
    const response = await this.hon.get(`${constants.API_URL}/commands/v1/retrieve?${params}`);
    const payload = (await response.json())?.payload || {};
    if (!payload || payload.resultCode !== "0") {
      return {};
    }
    delete payload.resultCode;
    return payload;
  }

  async loadCommandHistory(appliance) {
    const response = await this.hon.get(`${constants.API_URL}/commands/v1/appliance/${appliance.macAddress}/history`);
    return (await response.json())?.payload?.history || [];
  }

  async loadFavourites(appliance) {
    const response = await this.hon.get(`${constants.API_URL}/commands/v1/appliance/${appliance.macAddress}/favourite`);
    return (await response.json())?.payload?.favourites || [];
  }

  async loadAttributes(appliance) {
    const params = new URLSearchParams({
      macAddress: appliance.macAddress,
      applianceType: appliance.applianceType,
      category: "CYCLE"
    });
    const response = await this.hon.get(`${constants.API_URL}/commands/v1/context?${params}`);
    return (await response.json())?.payload || {};
  }

  async loadStatistics(appliance) {
    const params = new URLSearchParams({
      macAddress: appliance.macAddress,
      applianceType: appliance.applianceType
    });
    const response = await this.hon.get(`${constants.API_URL}/commands/v1/statistics?${params}`);
    return (await response.json())?.payload || {};
  }

  async loadMaintenance(appliance) {
    const params = new URLSearchParams({ macAddress: appliance.macAddress });
    const response = await this.hon.get(`${constants.API_URL}/commands/v1/maintenance-cycle?${params}`);
    return (await response.json())?.payload || {};
  }

  async sendCommand(appliance, command, parameters, ancillaryParameters = {}, programName = "") {
    const label = appliance.nickName || appliance.macAddress;
    const operation = this.logger?.start(`Sending command: "${command}" to "${label}"...`);
    const now = new Date();
    const timestamp = now.toISOString().replace(/\.\d{3}Z$/, `.${String(now.getMilliseconds()).padStart(3, "0")}Z`);
    const data = {
      macAddress: appliance.macAddress,
      timestamp,
      commandName: command,
      transactionId: `${appliance.macAddress}_${timestamp}`,
      applianceOptions: appliance.options,
      device: this.device.get(true),
      attributes: {
        channel: "mobileApp",
        origin: "standardProgram",
        energyLabel: "0"
      },
      ancillaryParameters,
      parameters,
      applianceType: appliance.applianceType
    };
    if (command === "startProgram" && programName) {
      data.programName = programName.toUpperCase();
    }
    try {
      const response = await this.hon.post(`${constants.API_URL}/commands/v1/send`, {
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result?.payload?.resultCode === "0") {
        operation?.success(`Command sent: "${command}" to "${label}"`);
        return true;
      }
      throw new HonApiError("Can't send command", { payload: result, request: data });
    } catch (error) {
      operation?.failure(`Command failed: "${command}" to "${label}"`);
      throw error;
    }
  }
}

module.exports = { HonAPI };
