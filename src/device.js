const constants = require("./constants");

class HonDevice {
  constructor(mobileId = "") {
    this.appVersion = constants.APP_VERSION;
    this.osVersion = constants.OS_VERSION;
    this.os = constants.OS;
    this.deviceModel = constants.DEVICE_MODEL;
    this.mobileId = mobileId || constants.MOBILE_ID;
  }

  get(mobile = false) {
    /** @type {{ appVersion: string | number, mobileId: string, os?: string, osVersion: string | number, deviceModel: string, mobileOs?: string }} */
    const result = {
      appVersion: this.appVersion,
      mobileId: this.mobileId,
      os: this.os,
      osVersion: this.osVersion,
      deviceModel: this.deviceModel
    };
    if (mobile) {
      result.mobileOs = result.os;
      delete result.os;
    }
    return result;
  }
}

module.exports = { HonDevice };
