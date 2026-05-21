# hOn Node.js AC Controls

A CommonJS Node.js module for hOn authentication and air conditioner controls.

## Advantages

- Speed: cached AC preset runs take about 1 second.
- CLI: easy to set up and use.
- Module: easy to reuse in other projects.

## About This Project

This project is a **Node.js port** of [Andre0512/pyhOn](https://github.com/Andre0512/pyhOn), which was originally developed by Andre0512 under the MIT License.

All credit for the original implementation goes to Andre0512. This version reimplements the library in Node.js and may differ in API and functionality to better suit the JavaScript ecosystem.

## Install From NPM

After this package is published, install it globally:

```bash
npm install -g node-hon
```

Then create a working config in the installed package folder or run from a checkout that has `config.js`, presets, and cache files available.

## Global CLI Setup From This Repo

1. Clone or download this repository.

2. Install dependencies:

```bash
npm install
```

3. Create your local config:

```bash
cp config_example.js config.js
```

4. Edit `config.js` and set your hOn account values.

5. Install this checkout as a global npm command:

```bash
npm install -g .
```

6. Confirm the CLI is available:

```bash
node-hon list
```

## CLI Usage

List available air conditioners:

```bash
node-hon list
```

Apply a preset by MAC address:

```bash
node-hon apply xx-xx-xx-xx-xx-xx preset_fan
```

Apply a preset by AC name:

```bash
node-hon apply Bedroom preset_fan
```

Turn an AC off:

```bash
node-hon apply bedroom off
```

Generate a preset interactively from live hOn capabilities:

```bash
node-hon generate-preset
```

Purge cached session and appliance command data:

```bash
node-hon purge-cache
```

The AC identifier can be a MAC address, unique ID, or nickname. Nickname lookup is case-insensitive, so `Bedroom` and `bedroom` can both match the same AC.

Generated and bundled presets live in `presets/`. Preset names are passed without `.json`, for example `preset_fan` loads `presets/preset_fan.json`.

Runtime cache files live under `cache/` by default, including session and appliance command cache data. Run `node-hon purge-cache`, or set `forceApplianceCacheRefresh: true` in `config.js`, when the appliance command model changes or a preset cannot find a parameter that exists in the app.

## Development CLI

You can also run the CLI scripts directly from the repository:

```bash
node cli/show_my_ac_devices.js
node cli/ac_generate_preset.js
```

`ac_generate_preset.js` loads the latest AC capabilities from the hOn API. You can set `AC_ID` or `PRESET_NAME` to preselect the air conditioner or output preset name.

## Tests

```bash
npm test
```

## Publishing

Before publishing, make sure you are logged in:

```bash
npm login
npm whoami
```

Verify the package:

```bash
npm test
npm run typecheck
npm pack --dry-run
```

Publish:

```bash
npm publish --access public
```

### License

This project is released under the MIT License.  
The original Python library is also MIT-licensed. See the `LICENSE` file for details and attribution.
