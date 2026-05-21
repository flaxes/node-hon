class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  addFromResponse(headers) {
    const values =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : splitSetCookie(headers.get("set-cookie"));
    for (const value of values) {
      const cookie = value.split(";")[0];
      const index = cookie.indexOf("=");
      if (index > 0) {
        this.cookies.set(cookie.slice(0, index), cookie.slice(index + 1));
      }
    }
  }

  header() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  clear() {
    this.cookies.clear();
  }
}

function splitSetCookie(value) {
  if (!value) {
    return [];
  }
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g);
}

module.exports = { CookieJar };
