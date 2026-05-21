const crypto = require("node:crypto");
const { URLSearchParams } = require("node:url");
const constants = require("./constants");
const { CookieJar } = require("./cookie-jar");
const { HonAuthError } = require("./errors");
const { isExpired } = require("./session-store");

const TOKEN_EXPIRES_AFTER_MS = 8 * 60 * 60 * 1000;
const TOKEN_EXPIRE_WARNING_MS = 60 * 60 * 1000;

class HonAuth {
  constructor({ email, password, device, fetchImpl = globalThis.fetch, sessionStore = null, debug = false, logger = null }) {
    if (!fetchImpl) {
      throw new HonAuthError("A fetch implementation is required");
    }
    this.email = email || "";
    this.password = password || "";
    this.device = device;
    this.fetch = fetchImpl;
    this.sessionStore = sessionStore;
    this.debug = debug;
    this.logger = logger;
    this.cookieJar = new CookieJar();
    this.calledUrls = [];
    this.auth = {
      accessToken: "",
      refreshToken: "",
      sessionToken: "",
      cognitoToken: "",
      idToken: "",
      expiresAt: ""
    };
  }

  get accessToken() {
    return this.auth.accessToken;
  }

  get refreshToken() {
    return this.auth.refreshToken;
  }

  get sessionToken() {
    return this.auth.sessionToken || this.auth.cognitoToken;
  }

  get cognitoToken() {
    return this.sessionToken;
  }

  get idToken() {
    return this.auth.idToken;
  }

  tokenExpiresSoon() {
    return isExpired(this.auth.expiresAt, TOKEN_EXPIRE_WARNING_MS);
  }

  tokenIsExpired() {
    return isExpired(this.auth.expiresAt);
  }

  async initialize() {
    this.logger?.log("Trying to reuse saved session...");
    if (await this.tryLoadSession()) {
      this.logger?.log("Saved session reused");
      return;
    }
    this.logger?.log("Saved session unavailable, using full login");
    await this.authenticate();
  }

  async tryLoadSession() {
    if (!this.sessionStore) {
      return false;
    }
    const session = await this.sessionStore.read();
    if (!session || !session.refreshToken) {
      return false;
    }
    this.auth.refreshToken = session.refreshToken || "";
    this.auth.sessionToken = session.sessionToken || session.cognitoToken || "";
    this.auth.cognitoToken = this.auth.sessionToken;
    this.auth.idToken = session.idToken || "";
    this.auth.accessToken = session.accessToken || "";
    this.auth.expiresAt = session.expiresAt || "";

    if (this.auth.sessionToken && this.auth.idToken && !this.tokenExpiresSoon()) {
      return true;
    }
    return this.refresh();
  }

  async authenticate() {
    this.clear(false);
    if (!this.email) {
      throw new HonAuthError("An email address must be specified");
    }
    if (!this.password) {
      throw new HonAuthError("A password must be specified");
    }
    try {
      const loginUrl = await this.loadLogin();
      const tokenUrl = await this.login(loginUrl);
      await this.getToken(tokenUrl);
      await this.apiAuth();
      await this.saveSession();
    } catch (error) {
      if (error instanceof NoLoginNeeded) {
        return;
      }
      throw error;
    }
  }

  async refresh(refreshToken = "") {
    const operation = this.logger?.start("Refreshing auth tokens...");
    if (refreshToken) {
      this.auth.refreshToken = refreshToken;
    }
    if (!this.auth.refreshToken) {
      operation?.success("Refresh skipped");
      return false;
    }
    const params = new URLSearchParams({
      client_id: constants.CLIENT_ID,
      refresh_token: this.auth.refreshToken,
      grant_type: "refresh_token"
    });
    const response = await this.request(`${constants.AUTH_API}/services/oauth2/token?${params}`, {
      method: "POST"
    });
    if (response.status >= 400) {
      if (this.debug) {
        await this.logAuthError(response, false);
      }
      operation?.failure("Refresh failed");
      return false;
    }
    const data = await response.json();
    this.auth.idToken = data.id_token || "";
    this.auth.accessToken = data.access_token || "";
    this.auth.expiresAt = new Date(Date.now() + TOKEN_EXPIRES_AFTER_MS).toISOString();
    await this.apiAuth();
    await this.saveSession();
    operation?.success("Refresh success");
    return true;
  }

  async loadLogin() {
    const loginUrl = await this.introduce();
    const redirected = await this.handleRedirects(loginUrl);
    return this.loginUrl(redirected);
  }

  async introduce() {
    const redirectUri = encodeURIComponent(`${constants.APP}://mobilesdk/detect/oauth/done`);
    const params = {
      response_type: "token+id_token",
      client_id: constants.CLIENT_ID,
      redirect_uri: redirectUri,
      display: "touch",
      scope: "api openid refresh_token web",
      nonce: generateNonce()
    };
    const paramsText = Object.entries(params).map(([key, value]) => `${key}=${value}`).join("&");
    const response = await this.request(`${constants.AUTH_API}/services/oauth2/authorize/expid_Login?${paramsText}`);
    const text = await response.text();
    this.auth.expiresAt = new Date(Date.now() + TOKEN_EXPIRES_AFTER_MS).toISOString();
    const loginUrl = text.match(/(?:url|href) ?= ?'(.+?)'/);
    if (!loginUrl) {
      if (text.includes("oauth/done#access_token=") && this.parseTokenData(text)) {
        await this.apiAuth();
        await this.saveSession();
        throw new NoLoginNeeded();
      }
      await this.logAuthError(response);
    }
    if (loginUrl[1].startsWith("/NewhOnLogin")) {
      return `${constants.AUTH_API}/s/login${loginUrl[1]}`;
    }
    return loginUrl[1];
  }

  async manualRedirect(url) {
    const response = await this.request(url, { redirect: "manual" });
    return response.headers.get("location") || url;
  }

  async handleRedirects(loginUrl) {
    const redirect1 = await this.manualRedirect(loginUrl);
    const redirect2 = await this.manualRedirect(redirect1);
    return `${redirect2}&System=IoT_Mobile_App&RegistrationSubChannel=hOn`;
  }

  async loginUrl(loginUrl) {
    try {
      const response = await this.request(loginUrl, { headers: { "user-agent": constants.USER_AGENT } });
      const text = await response.text();
      const context = text.match(/"fwuid":"(.*?)","loaded":(\{.*?\})/);
      if (!context) {
        await this.logAuthError(response);
      }
      return {
        loginUrl,
        urlPath: loginUrl.replace(constants.AUTH_API, ""),
        fwUid: context[1],
        loaded: JSON.parse(context[2])
      };
    } catch (error) {
      if (error instanceof NoLoginNeeded) {
        return null;
      }
      throw error;
    }
  }

  async login(loginData) {
    if (!loginData) {
      throw new NoLoginNeeded();
    }
    const startUrl = decodeURIComponent(loginData.urlPath.split("startURL=").pop()).split("%3D")[0];
    const action = {
      id: "79;a",
      descriptor: "apex://LightningLoginCustomController/ACTION$login",
      callingDescriptor: "markup://c:loginForm",
      params: {
        username: this.email,
        password: this.password,
        startUrl
      }
    };
    const data = {
      message: { actions: [action] },
      "aura.context": {
        mode: "PROD",
        fwuid: loginData.fwUid,
        app: "siteforce:loginApp2",
        loaded: loginData.loaded,
        dn: [],
        globals: {},
        uad: false
      },
      "aura.pageURI": loginData.urlPath,
      "aura.token": null
    };
    const body = Object.entries(data)
      .map(([key, value]) => `${key}=${encodeURIComponent(JSON.stringify(value))}`)
      .join("&");
    const params = new URLSearchParams({ r: "3", "other.LightningLoginCustom.login": "1" });
    const response = await this.request(`${constants.AUTH_API}/s/sfsites/aura?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (response.status === 200) {
      try {
        const result = await response.json();
        const url = result.events[0].attributes.values.url;
        if (url) {
          return url;
        }
      } catch {
        // handled below
      }
    }
    await this.logAuthError(response);
  }

  async getToken(url) {
    let response = await this.request(url);
    if (response.status !== 200) {
      await this.logAuthError(response);
    }
    let text = await response.text();
    let href = firstHref(text);
    if (!href) {
      await this.logAuthError(response);
    }
    if (href.includes("ProgressiveLogin")) {
      response = await this.request(href.startsWith("http") ? href : constants.AUTH_API + href);
      if (response.status !== 200) {
        await this.logAuthError(response);
      }
      text = await response.text();
      href = firstHref(text);
    }
    const finalUrl = href.startsWith("http") ? href : constants.AUTH_API + href;
    response = await this.request(finalUrl);
    if (response.status !== 200 || !this.parseTokenData(await response.text())) {
      await this.logAuthError(response);
    }
  }

  parseTokenData(text) {
    const accessToken = text.match(/access_token=(.*?)&/);
    const refreshToken = text.match(/refresh_token=(.*?)&/);
    const idToken = text.match(/id_token=(.*?)&/);
    if (accessToken) {
      this.auth.accessToken = accessToken[1];
    }
    if (refreshToken) {
      this.auth.refreshToken = decodeURIComponent(refreshToken[1]);
    }
    if (idToken) {
      this.auth.idToken = idToken[1];
    }
    return Boolean(accessToken && refreshToken && idToken);
  }

  async apiAuth() {
    if (!this.auth.idToken) {
      throw new HonAuthError("Missing id token");
    }
    const response = await this.request(`${constants.API_URL}/auth/v1/login`, {
      method: "POST",
      headers: { "id-token": this.auth.idToken, "Content-Type": "application/json" },
      body: JSON.stringify(this.device.get())
    });
    let data;
    try {
      data = await response.json();
    } catch (error) {
      await this.logAuthError(response);
    }
    this.auth.sessionToken = data?.cognitoUser?.Token || "";
    this.auth.cognitoToken = this.auth.sessionToken;
    if (!this.auth.sessionToken) {
      throw new HonAuthError("Can't get API session token", data);
    }
    this.auth.expiresAt = new Date(Date.now() + TOKEN_EXPIRES_AFTER_MS).toISOString();
    return true;
  }

  async request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has("user-agent")) {
      headers.set("user-agent", constants.USER_AGENT);
    }
    const cookie = this.cookieJar.header();
    if (cookie && !headers.has("cookie")) {
      headers.set("cookie", cookie);
    }
    const response = await this.fetch(url, { ...options, headers });
    this.cookieJar.addFromResponse(response.headers);
    this.calledUrls.push([response.status, response.url || String(url)]);
    return response;
  }

  async logAuthError(response, fail = true) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      body = "";
    }
    const details = {
      calledUrls: this.calledUrls,
      status: response.status,
      url: response.url,
      body
    };
    if (fail) {
      throw new HonAuthError("hOn authentication failed", details);
    }
    return details;
  }

  async saveSession() {
    if (!this.sessionStore) {
      return;
    }
    await this.sessionStore.write({
      refreshToken: this.auth.refreshToken,
      sessionToken: this.auth.sessionToken,
      idToken: this.auth.idToken,
      accessToken: this.auth.accessToken,
      expiresAt: this.auth.expiresAt,
      updatedAt: new Date().toISOString()
    });
  }

  clear(clearSession = true) {
    this.cookieJar.clear();
    this.calledUrls = [];
    this.auth.accessToken = "";
    this.auth.idToken = "";
    this.auth.sessionToken = "";
    this.auth.cognitoToken = "";
    if (clearSession) {
      this.auth.refreshToken = "";
      this.auth.expiresAt = "";
    }
  }
}

class NoLoginNeeded extends Error {}

function generateNonce() {
  const nonce = crypto.randomBytes(16).toString("hex");
  return `${nonce.slice(0, 8)}-${nonce.slice(8, 12)}-${nonce.slice(12, 16)}-${nonce.slice(16, 20)}-${nonce.slice(20)}`;
}

function firstHref(text) {
  const match = text.match(/href\s*=\s*["'](.+?)["']/);
  return match ? match[1] : "";
}

module.exports = { HonAuth, TOKEN_EXPIRES_AFTER_MS, TOKEN_EXPIRE_WARNING_MS };
