#!/usr/bin/env node
import { existsSync, statfsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Prefer the user's Xcode selection. If only Command Line Tools are selected,
// use the installed Xcode for this command without changing the Mac's settings.
if (process.platform !== 'darwin') {
  console.error('Local iOS builds require macOS and Xcode.');
  process.exit(1);
}

const disk = statfsSync(process.cwd());
if (disk.bavail * disk.bsize < 5 * 1024 ** 3) {
  console.error('The iOS build needs at least 5 GB of free disk space. Free some space, then rerun this command.');
  process.exit(1);
}

const env = { ...process.env };
const selected = spawnSync('xcrun', ['--find', 'simctl'], { env, encoding: 'utf8' });
if (selected.status !== 0 && !env.DEVELOPER_DIR) {
  const developer = '/Applications/Xcode.app/Contents/Developer';
  if (existsSync(`${developer}/usr/bin/xcodebuild`)) env.DEVELOPER_DIR = developer;
  else {
    console.error('Install Xcode and an iOS Simulator runtime, then run npm run ios again.');
    process.exit(1);
  }
}

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const developer = env.DEVELOPER_DIR ?? spawnSync('xcode-select', ['-p'], { encoding: 'utf8' }).stdout.trim();
const deviceHub = path.resolve(developer, '../Applications/DeviceHub.app');

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, { env, stdio: 'inherit', ...options });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result;
};

// Expo SDK 54's launcher requires Simulator.app. Xcode 27 replaced it with
// Device Hub, so build a standalone Simulator app using Apple's tools instead.
if (existsSync(deviceHub) && !existsSync(path.join(developer, 'Applications/Simulator.app'))) {
  let device;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--device') device = args[++i];
    else if (args[i] === '--configuration' && args[++i] === 'Release') { /* standalone */ }
    else if (args[i] !== '--no-bundler') {
      console.error('Device Hub builds support --device <UDID> and --configuration Release.');
      process.exit(1);
    }
  }
  if (args.includes('--device') && !device) {
    console.error('Pass a Simulator UDID or exact name after --device.');
    process.exit(1);
  }
  const listing = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { env, encoding: 'utf8' });
  if (listing.status !== 0) {
    console.error(listing.stderr || 'Unable to list iOS Simulators. Install an iOS runtime in Xcode.');
    process.exit(1);
  }
  const devices = Object.values(JSON.parse(listing.stdout).devices).flat();
  const target = device ? devices.find(d => d.udid === device || d.name === device)
    : devices.find(d => d.state === 'Booted' && d.name.startsWith('iPhone')) ?? devices.find(d => d.name.startsWith('iPhone'));
  if (!target) {
    console.error('No matching iOS Simulator. Install a runtime in Xcode or pass --device <UDID>.');
    process.exit(1);
  }
  console.log(`Building a standalone Release app for ${target.name} using Xcode Device Hub.`);
  const expo = require.resolve('expo/bin/cli');
  run(process.execPath, [expo, 'prebuild', '--platform', 'ios', '--no-install']);
  run('pod', ['install'], { cwd: path.resolve('ios') });
  const derived = path.resolve('.local-qa/ios-derived');
  run('xcodebuild', [
    '-workspace', 'ios/StoreKit.xcworkspace', '-scheme', 'StoreKit', '-configuration', 'Release',
    '-destination', `platform=iOS Simulator,id=${target.udid}`, '-derivedDataPath', derived, '-jobs', '4',
    // Simulator ad hoc signing supplies the application identity SecureStore
    // needs for Keychain access, without an Apple development certificate.
    'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-',
    'IPHONEOS_DEPLOYMENT_TARGET=15.1', 'ONLY_ACTIVE_ARCH=YES',
  ]);
  if (target.state !== 'Booted') run('xcrun', ['simctl', 'boot', target.udid]);
  run('xcrun', ['simctl', 'bootstatus', target.udid, '-b']);
  run('xcrun', ['simctl', 'install', target.udid, path.join(derived, 'Build/Products/Release-iphonesimulator/StoreKit.app')]);
  const { expo: config } = require('../app.json');
  run('xcrun', ['simctl', 'launch', '--terminate-running-process', target.udid, config.ios.bundleIdentifier]);
  run('open', ['-a', deviceHub, `devices://device/open?id=${target.udid}`]);
  process.exit(0);
}

const result = spawnSync(process.execPath, [require.resolve('expo/bin/cli'), 'run:ios', ...args], {
  env,
  stdio: 'inherit',
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
