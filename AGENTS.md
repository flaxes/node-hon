# Codex Context

## Project Summary

`node-hon` is a CommonJS Node.js >= 23 port inspired by `pyhOn`, focused on hOn authentication and air conditioner controls.

The main manual flow is applying an AC preset:

```powershell
$env:AC_ID="<mac-address>"; node examples/ac_apply_preset.js
```

`PRESET_NAME` is optional and defaults to `preset_fan`.

## Do Not Commit

These files are intentionally local runtime files and must stay untracked:

- `/config.js` - real hOn credentials and local config
- `/.hon-session.json` - auth/session tokens
- `/.hon-appliance-cache.json` - local AC command cache
- `/.hon-devices.json` - local device identifiers
- `/hon-devices-capabilities.json` - local device capabilities and identifiers
- `/test.js` - local manual test script

If any of these files are accidentally tracked, remove them from Git without deleting the local file:

```powershell
git rm --cached <file>
```

## Safe To Commit

These files are intended to be committed:

- `AGENTS.md`
- `README.md`
- `package.json`
- `config_example.js`
- `src/**/*.js`
- `examples/*.js`
- `presets/*.json`
- `test/*.test.js`
- `types/*.ts`

## Runtime And Tests

- Runtime: Node.js >= 23
- Module format: CommonJS
- Test runner: Node built-in test runner

Run tests with:

```powershell
npm.cmd test
```

## Cache Behavior

Preset execution should use:

```js
HonClient.getAirConditionerByIdCached(id);
```

This hydrates AC command data from `/.hon-appliance-cache.json` when possible and avoids slow setup calls.

To refresh cached command data:

- delete `/.hon-appliance-cache.json`, or
- set `forceApplianceCacheRefresh: true` in `config.js`

Discovery and diagnostics examples may still use live API data.

## Presets

Presets live in `presets/`.

Preset fields should use real hOn command parameter keys, not friendly aliases.

Example:

```json
{
  "mode": "iot_uv_and_fan",
  "tempSel": "24",
  "windSpeed": "2",
  "windDirectionVertical": "2",
  "windDirectionHorizontal": "0",
  "healthMode": "1"
}
```

`mode` selects the command category. Other fields must match discovered hOn command parameters.

## Debug Logging

`config.debug = true` enables operation timing logs for:

- login/session reuse
- appliance cache load/refresh
- preset apply
- command send

Logs must not include passwords, tokens, session contents, or full secret-bearing URLs.

## Useful Commands

```powershell
node examples/show_my_ac_devices.js
node examples/show_my_ac_capabilities.js
$env:AC_ID="<mac-address>"; node examples/ac_apply_preset.js
$env:AC_ID="<mac-address>"; $env:PRESET_NAME="preset_fan"; node examples/ac_apply_preset.js
```
