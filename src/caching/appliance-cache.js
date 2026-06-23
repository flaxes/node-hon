const fs = require("node:fs/promises");
const path = require("node:path");
const { findApplianceIdentifierMatches } = require("../appliance-identity");

const CACHE_VERSION = 1;

class ApplianceCache {
  constructor(filePath, isDebug) {
    this.filePath = path.resolve(filePath || "./.hon-appliance-cache.json");
    this.isDebug = isDebug;
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
      const fileError = /** @type {NodeJS.ErrnoException} */ (error);
      if (fileError && fileError.code === "ENOENT") {
        return emptyCache();
      }
      throw error;
    }
  }

  async find(id) {
    const matches = await this.findAll(id);
    return matches[0] || null;
  }

  async findAll(id) {
    const cache = await this.read();
    return findApplianceIdentifierMatches(cache.appliances, id).map((match) => match.item);
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

  async replaceAll(records) {
    await this.write({ version: CACHE_VERSION, appliances: records });
  }

  async write(data) {
    const spaces = this.isDebug ? 2 : 0;

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(data, null, spaces)}\n`, "utf8");
    await fs.rename(tmp, this.filePath);
  }
}

function emptyCache() {
  return { version: CACHE_VERSION, appliances: [] };
}

/**
 * @param {{ macAddress?: string, uniqueId?: string, nickName?: string } | null | undefined} record
 * @param {string} id
 */
function recordMatches(record, id) {
  return findApplianceIdentifierMatches(record ? [record] : [], id).length > 0;
}

module.exports = { ApplianceCache, CACHE_VERSION, recordMatches };
