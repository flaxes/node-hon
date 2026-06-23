const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { HonClient } = require("../src/client");
const { DebugLogger } = require("../src/lib/logger");

test("cache miss falls back to live setup and writes cache", async () => {
  const { client, cacheFile, calls } = makeClient();

  const ac = await client.getAirConditionerByIdCached("aa");
  const cache = JSON.parse(await fs.readFile(cacheFile, "utf8"));

  assert.equal(ac.macAddress, "aa");
  assert.equal(cache.appliances.length, 1);
  assert.equal(cache.appliances[0].macAddress, "aa");
  assert.equal(calls.loadAppliances, 1);
  assert.equal(calls.loadCommands, 1);
  assert.equal(calls.loadAttributes, 1);
  assert.equal(calls.loadStatistics, 1);
  assert.equal(calls.loadMaintenance, 1);
});

test("cache hit skips live setup calls and can apply a preset", async () => {
  const { client, cacheFile, calls, sent } = makeClient();
  await fs.writeFile(cacheFile, JSON.stringify(cacheWithAc(), null, 2), "utf8");

  const ac = await client.getAirConditionerByIdCached("aa");
  await ac.applyPreset({
    mode: "iot_uv_and_fan",
    tempSel: "24",
    windSpeed: "2",
    windDirectionVertical: "2",
    windDirectionHorizontal: "0",
    healthMode: "1"
  }, "preset_fan");

  assert.equal(calls.loadAppliances, 0);
  assert.equal(calls.loadCommands, 0);
  assert.deepEqual(sent[0], {
    command: "startProgram",
    params: {
      tempSel: 24,
      windSpeed: "2",
      windDirectionVertical: "2",
      windDirectionHorizontal: "0",
      healthMode: 1
    },
    programName: "PROGRAMS.AC.IOT_UV_AND_FAN"
  });
});

test("getAppliances loads all appliances from applianceCacheFile", async () => {
  const { client, cacheFile, calls } = makeClient();
  const cache = cacheWithAc();
  cache.appliances.push({
    ...cache.appliances[0],
    info: { ...cache.appliances[0].info, macAddress: "bb", nickName: "Bedroom" },
    macAddress: "bb",
    uniqueId: "bb",
    nickName: "Bedroom"
  });
  await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), "utf8");

  const appliances = await client.getAppliances();

  assert.deepEqual(appliances.map((appliance) => appliance.macAddress), ["aa", "bb"]);
  assert.equal(appliances[0].commands.startProgram.name, "startProgram");
  assert.equal(calls.loadAppliances, 0);
  assert.equal(calls.loadCommands, 0);
  assert.equal(calls.loadAttributes, 0);
  assert.equal(calls.loadStatistics, 0);
  assert.equal(calls.loadMaintenance, 0);
});

test("getAppliances cache miss falls back to live setup and writes applianceCacheFile", async () => {
  const { client, cacheFile, calls } = makeClient();
  client.api.loadAppliances = async () => {
    calls.loadAppliances += 1;
    return [
      applianceInfo(),
      { ...applianceInfo(), macAddress: "bb", nickName: "Bedroom" }
    ];
  };

  const appliances = await client.getAppliances();
  const cache = JSON.parse(await fs.readFile(cacheFile, "utf8"));

  assert.deepEqual(appliances.map((appliance) => appliance.macAddress), ["aa", "bb"]);
  assert.deepEqual(cache.appliances.map((appliance) => appliance.macAddress), ["aa", "bb"]);
  assert.equal(calls.loadAppliances, 1);
  assert.equal(calls.loadCommands, 2);
  assert.equal(calls.loadAttributes, 2);
  assert.equal(calls.loadStatistics, 2);
  assert.equal(calls.loadMaintenance, 2);
});

test("getAppliances forceApplianceCacheRefresh bypasses applianceCacheFile", async () => {
  const { client, cacheFile, calls } = makeClient({ forceApplianceCacheRefresh: true });
  await fs.writeFile(cacheFile, JSON.stringify(cacheWithAc(), null, 2), "utf8");

  const appliances = await client.getAppliances();

  assert.deepEqual(appliances.map((appliance) => appliance.macAddress), ["aa"]);
  assert.equal(calls.loadAppliances, 1);
  assert.equal(calls.loadCommands, 1);
});

test("getAppliances corrupt applianceCacheFile falls back to live setup", async () => {
  const { client, cacheFile, calls } = makeClient();
  await fs.writeFile(cacheFile, "{not-json", "utf8");

  const appliances = await client.getAppliances();

  assert.deepEqual(appliances.map((appliance) => appliance.macAddress), ["aa"]);
  assert.equal(calls.loadAppliances, 1);
  assert.equal(calls.loadCommands, 1);
});

test("cache hit can find AC by exact nickname", async () => {
  const { client, cacheFile, calls } = makeClient();
  await fs.writeFile(cacheFile, JSON.stringify(cacheWithAc(), null, 2), "utf8");

  const ac = await client.getAirConditionerByIdCached("Living");

  assert.equal(ac.macAddress, "aa");
  assert.equal(calls.loadAppliances, 0);
});

test("cache hit can find AC by case-insensitive nickname", async () => {
  const { client, cacheFile, calls } = makeClient();
  await fs.writeFile(cacheFile, JSON.stringify(cacheWithAc(), null, 2), "utf8");

  const ac = await client.getAirConditionerByIdCached("living");

  assert.equal(ac.macAddress, "aa");
  assert.equal(calls.loadAppliances, 0);
});

test("cache hit reports ambiguous case-insensitive nicknames", async () => {
  const { client, cacheFile, calls } = makeClient();
  const cache = cacheWithAc();
  cache.appliances.push({
    ...cache.appliances[0],
    info: { ...cache.appliances[0].info, macAddress: "bb", nickName: "living" },
    macAddress: "bb",
    uniqueId: "bb",
    nickName: "living"
  });
  await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), "utf8");

  await assert.rejects(() => client.getAirConditionerByIdCached("LIVING"));

  assert.equal(calls.loadAppliances, 0);
});

test("cache miss can refresh AC by case-insensitive nickname", async () => {
  const { client, calls } = makeClient();

  const ac = await client.getAirConditionerByIdCached("living");

  assert.equal(ac.macAddress, "aa");
  assert.equal(calls.loadAppliances, 1);
});

test("cache miss can refresh AC by applianceName alias", async () => {
  const { client, calls } = makeClient();
  const { nickName: _nickName, ...info } = /** @type {any} */ (applianceInfo());
  info.applianceName = "BedRoom";
  client.api.loadAppliances = async () => {
    calls.loadAppliances += 1;
    return [info];
  };

  const ac = await client.getAirConditionerByIdCached("bedroom");

  assert.equal(ac.macAddress, "aa");
  assert.equal(ac.nickName, "BedRoom");
  assert.equal(calls.loadAppliances, 1);
});

test("cache hit can find AC by applianceName alias inside cached info", async () => {
  const { client, cacheFile, calls } = makeClient();
  const cache = cacheWithAc();
  cache.appliances[0].nickName = "Air Conditioner";
  const { nickName: _cachedNickName, ...info } = /** @type {any} */ (cache.appliances[0].info);
  cache.appliances[0].info = /** @type {any} */ ({ ...info, applianceName: "BedRoom" });
  await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), "utf8");

  const ac = await client.getAirConditionerByIdCached("bedroom");

  assert.equal(ac.macAddress, "aa");
  assert.equal(ac.nickName, "BedRoom");
  assert.equal(calls.loadAppliances, 0);
});

test("cache miss reports ambiguous live case-insensitive nicknames", async () => {
  const { client, calls } = makeClient();
  client.api.loadAppliances = async () => {
    calls.loadAppliances += 1;
    return [
      applianceInfo(),
      { ...applianceInfo(), macAddress: "bb", nickName: "living" }
    ];
  };

  await assert.rejects(() => client.getAirConditionerByIdCached("LIVING"));

  assert.equal(calls.loadAppliances, 1);
});

test("forceApplianceCacheRefresh bypasses existing cache", async () => {
  const { client, cacheFile, calls } = makeClient({ forceApplianceCacheRefresh: true });
  await fs.writeFile(cacheFile, JSON.stringify(cacheWithAc(), null, 2), "utf8");

  await client.getAirConditionerByIdCached("aa");

  assert.equal(calls.loadAppliances, 1);
  assert.equal(calls.loadCommands, 1);
});

test("corrupt cache falls back to live setup", async () => {
  const { client, cacheFile, calls } = makeClient();
  await fs.writeFile(cacheFile, "{not-json", "utf8");

  const ac = await client.getAirConditionerByIdCached("aa");

  assert.equal(ac.macAddress, "aa");
  assert.equal(calls.loadAppliances, 1);
  assert.equal(calls.loadCommands, 1);
});

test("cache debug logs include elapsed time and no secrets", async () => {
  const lines = [];
  const times = [
    new Date("2026-01-30T15:30:10"),
    new Date("2026-01-30T15:30:11"),
    new Date("2026-01-30T15:30:12"),
    new Date("2026-01-30T15:30:17")
  ];
  const { client } = makeClient({
    logger: new DebugLogger({
      enabled: true,
      sink: (line) => lines.push(line),
      now: () => times.shift() || new Date("2026-01-30T15:30:17")
    })
  });

  await client.getAirConditionerByIdCached("aa");

  assert.equal(lines.some((line) => line.includes('Loading AC from cache: "aa"...')), true);
  assert.equal(lines.some((line) => line.includes('AC cache refreshed: "aa" (5secs)')), true);
  assert.equal(lines.join("\n").includes("password"), false);
  assert.equal(lines.join("\n").includes("session"), false);
});

function makeClient(overrides = {}) {
  const cacheFile = path.join(os.tmpdir(), `hon-cache-${Date.now()}-${Math.random()}.json`);
  const calls = {
    loadAppliances: 0,
    loadCommands: 0,
    loadFavourites: 0,
    loadCommandHistory: 0,
    loadAttributes: 0,
    loadStatistics: 0,
    loadMaintenance: 0
  };
  const sent = [];
  const client = new HonClient({
    email: "u",
    password: "p",
    sessionFile: path.join(os.tmpdir(), "unused-session.json"),
    applianceCacheFile: cacheFile,
    fetch: async () => jsonResponse({}),
    ...overrides
  });
  client.api = /** @type {any} */ ({
    loadAppliances: async () => {
      calls.loadAppliances += 1;
      return [applianceInfo()];
    },
    loadCommands: async () => {
      calls.loadCommands += 1;
      return liveCommandPayload();
    },
    loadFavourites: async () => {
      calls.loadFavourites += 1;
      return [];
    },
    loadCommandHistory: async () => {
      calls.loadCommandHistory += 1;
      return [];
    },
    loadAttributes: async () => {
      calls.loadAttributes += 1;
      return {};
    },
    loadStatistics: async () => {
      calls.loadStatistics += 1;
      return {};
    },
    loadMaintenance: async () => {
      calls.loadMaintenance += 1;
      return {};
    },
    sendCommand: async (_appliance, command, params, _ancillary, programName) => {
      sent.push({ command, params, programName });
      return true;
    }
  });
  return { client, cacheFile, calls, sent };
}

function applianceInfo() {
  return {
    macAddress: "aa",
    applianceTypeName: "AC",
    applianceModelId: "123",
    modelName: "Air Conditioner",
    nickName: "Living"
  };
}

function cacheWithAc() {
  return {
    version: 1,
    appliances: [
      {
        cachedAt: "2026-01-30T15:30:10.000Z",
        info: applianceInfo(),
        zone: 0,
        macAddress: "aa",
        uniqueId: "aa",
        nickName: "Living",
        commandData: {
          commands: liveCommandPayload(),
          applianceModel: {},
          additionalData: {}
        }
      }
    ]
  };
}

function liveCommandPayload() {
  return {
    applianceModel: {},
    startProgram: {
      "PROGRAMS.AC.IOT_SIMPLE_START": commandAttributes("iot_simple_start"),
      "PROGRAMS.AC.IOT_UV_AND_FAN": commandAttributes("iot_uv_and_fan")
    }
  };
}

function commandAttributes(defaultProgram) {
  return {
    description: "start",
    protocolType: "iot",
    parameters: {
      tempSel: { typology: "range", minimumValue: 16, maximumValue: 30, incrementValue: 1, defaultValue: 22 },
      windSpeed: { typology: "enum", enumValues: ["1", "2", "3", "5"], defaultValue: "5" },
      windDirectionVertical: { typology: "enum", enumValues: ["2", "4", "5", "6", "7", "8"], defaultValue: "5" },
      windDirectionHorizontal: { typology: "enum", enumValues: ["0", "1", "2"], defaultValue: "0" },
      healthMode: { typology: "range", minimumValue: 0, maximumValue: 1, incrementValue: 1, defaultValue: 0 },
      program: { typology: "enum", enumValues: ["iot_simple_start", "iot_uv_and_fan"], defaultValue: defaultProgram }
    }
  };
}

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}
