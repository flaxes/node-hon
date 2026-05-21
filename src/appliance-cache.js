"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const CACHE_VERSION = 1;

class ApplianceCache {
  constructor(filePath) {
    this.filePath = path.resolve(filePath || "./.hon-appliance-cache.json");
  }

  async read() {
    try {
      const text = await fs.readFile(this.filePath, "utf8");
      const data = JSON.parse(text);
      if (data.version !== CACHE_VERSION || !Array.isArray(data.appliances)) {
        return emptyCache();
      }
      return data;
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return emptyCache();
      }
      throw error;
    }
  }

  async find(id) {
    const cache = await this.read();
    return cache.appliances.find((record) => recordMatches(record, id)) || null;
  }

  async upsert(record) {
    let cache;
    try {
      cache = await this.read();
    } catch {
      cache = emptyCache();
    }
    const next = cache.appliances.filter((item) => !recordMatches(item, record.uniqueId) && !recordMatches(item, record.macAddress));
    next.push(record);
    await this.write({ version: CACHE_VERSION, appliances: next });
  }

  async write(data) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await fs.rename(tmp, this.filePath);
  }
}

function emptyCache() {
  return { version: CACHE_VERSION, appliances: [] };
}

function recordMatches(record, id) {
  if (!record || !id) {
    return false;
  }
  return [record.macAddress, record.uniqueId, record.nickName].includes(id);
}

module.exports = { ApplianceCache, CACHE_VERSION, recordMatches };
