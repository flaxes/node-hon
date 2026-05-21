"use strict";

class HonAuthError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "HonAuthError";
    this.details = details;
  }
}

class HonApiError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "HonApiError";
    this.details = details;
  }
}

class UnsupportedControlError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "UnsupportedControlError";
    this.details = details;
  }
}

class ApplianceNotFoundError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "ApplianceNotFoundError";
    this.details = details;
  }
}

module.exports = {
  HonAuthError,
  HonApiError,
  UnsupportedControlError,
  ApplianceNotFoundError
};
