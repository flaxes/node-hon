const fs = require("node:fs/promises");
const path = require("node:path");

class SessionStore {
  constructor(filePath) {
    this.filePath = filePath ? path.resolve(filePath) : "";
  }

  async read() {
    if (!this.filePath) {
      return null;
    }
    try {
      const text = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(text);
    } catch (error) {
      const fileError = /** @type {NodeJS.ErrnoException} */ (error);
      if (fileError && fileError.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async write(data) {
    if (!this.filePath) {
      return;
    }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await fs.rename(tmp, this.filePath);
  }
}

function isExpired(expiresAt, warningMs = 0) {
  if (!expiresAt) {
    return true;
  }
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) {
    return true;
  }
  return Date.now() + warningMs >= timestamp;
}

module.exports = { SessionStore, isExpired };
