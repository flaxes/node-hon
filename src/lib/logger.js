class DebugLogger {
  /**
   * @param {{ enabled?: boolean, sink?: (line: string) => void, now?: () => Date }} [options]
   */
  constructor({ enabled = false, sink = console.log, now = () => new Date() } = {}) {
    this.enabled = Boolean(enabled);
    this.sink = sink;
    this.now = now;
  }

  log(message) {
    this.write(message, this.now());
  }

  write(message, date) {
    if (!this.enabled) {
      return;
    }
    this.sink(`${formatTimestamp(date)}: ${message}`);
  }

  start(message) {
    const startedAt = this.now();
    this.write(message, startedAt);
    return {
      success: (message) => {
        const endedAt = this.now();
        this.write(`${message} (${formatElapsed(startedAt, endedAt)})`, endedAt);
      },
      failure: (message) => {
        const endedAt = this.now();
        this.write(`${message} (${formatElapsed(startedAt, endedAt)})`, endedAt);
      }
    };
  }
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + " " + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join(":");
}

function formatElapsed(startedAt, endedAt) {
  const seconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  return `${seconds}secs`;
}

module.exports = { DebugLogger, formatTimestamp, formatElapsed };
