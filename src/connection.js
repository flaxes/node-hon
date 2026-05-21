"use strict";

const constants = require("./constants");
const { HonAuthError } = require("./errors");

class HonConnection {
  constructor(auth, fetchImpl = globalThis.fetch) {
    this.auth = auth;
    this.fetch = fetchImpl;
  }

  async get(url, options = {}) {
    return this.request("GET", url, options);
  }

  async post(url, options = {}) {
    return this.request("POST", url, options);
  }

  async request(method, url, options = {}, loop = 0) {
    const headers = {
      "user-agent": constants.USER_AGENT,
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (this.auth.refreshToken && this.auth.tokenExpiresSoon() && loop === 0) {
      await this.auth.refresh();
    }
    if (!this.auth.sessionToken || !this.auth.idToken) {
      await this.auth.initialize();
    }
    headers["cognito-token"] = this.auth.sessionToken;
    headers["id-token"] = this.auth.idToken;

    const response = await this.fetch(url, { ...options, method, headers });
    if ((this.auth.tokenExpiresSoon() || response.status === 401 || response.status === 403) && loop === 0) {
      await this.auth.refresh();
      return this.request(method, url, options, loop + 1);
    }
    if ((this.auth.tokenIsExpired() || response.status === 401 || response.status === 403) && loop === 1) {
      await this.auth.authenticate();
      return this.request(method, url, options, loop + 1);
    }
    if (loop >= 2 && (response.status === 401 || response.status === 403)) {
      throw new HonAuthError("Login failure", { status: response.status, url });
    }
    return response;
  }
}

class HonAnonymousConnection {
  constructor(fetchImpl = globalThis.fetch) {
    this.fetch = fetchImpl;
  }

  async get(url, options = {}) {
    return this.request("GET", url, options);
  }

  async post(url, options = {}) {
    return this.request("POST", url, options);
  }

  async request(method, url, options = {}) {
    const headers = {
      "user-agent": constants.USER_AGENT,
      "Content-Type": "application/json",
      "x-api-key": constants.API_KEY,
      ...(options.headers || {})
    };
    return this.fetch(url, { ...options, method, headers });
  }
}

module.exports = { HonConnection, HonAnonymousConnection };
