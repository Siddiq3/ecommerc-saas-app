import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = readFileSync(new URL('./run-ios.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\s*$/gm, '').replace('import.meta.url', '"file:///project/scripts/run-ios.mjs"');
const simulate = ({ platform = 'darwin', freeGB = 10, args = [], booted = false, buildFails = false } = {}) => {
  const calls = [], errors = [];
  const exit = Symbol('exit');
  let status;
  const require = () => ({ expo: { ios: { bundleIdentifier: 'site.storekit.owner' } } });
  require.resolve = () => '/project/node_modules/expo/bin/cli';
  const context = {
    path,
    createRequire: () => require,
    existsSync: file => file.includes('DeviceHub.app') || file.endsWith('/usr/bin/xcodebuild'),
    statfsSync: () => ({ bavail: freeGB * 1024 ** 3, bsize: 1 }),
    console: { log: () => {}, error: message => errors.push(message) },
    process: {
      platform, env: {}, execPath: '/node', argv: ['/node', '/project/scripts/run-ios.mjs', ...args], cwd: () => '/project',
      exit: code => { status = code; throw exit; },
    },
    spawnSync: (command, commandArgs, options) => {
      calls.push({ command, args: commandArgs, options });
      if (command === 'xcrun' && commandArgs[0] === '--find') return { status: 1 };
      if (command === 'xcrun' && commandArgs[0] === 'simctl' && commandArgs[1] === 'list') {
        return { status: 0, stdout: JSON.stringify({ devices: { runtime: [
          { udid: 'phone', name: 'iPhone Test', state: booted ? 'Booted' : 'Shutdown' },
          { udid: 'tablet', name: 'iPad Test', state: 'Shutdown' },
        ] } }) };
      }
      return { status: command === 'xcodebuild' && buildFails ? 65 : 0 };
    },
  };
  vm.createContext(context);
  try { vm.runInContext(source, context); } catch (error) { if (error !== exit) throw error; }
  return { calls, errors, status };
};

for (const options of [{ platform: 'linux' }, { freeGB: 1 }]) {
  const result = simulate(options);
  assert.equal(result.status, 1);
  assert.equal(result.calls.length, 0);
}
for (const args of [['--device', 'missing'], ['--device'], ['--configuration', 'Debug']]) {
  const result = simulate({ args });
  assert.equal(result.status, 1);
  assert(!result.calls.some(c => c.command === 'xcodebuild'));
}
const success = simulate({ args: ['--device', 'tablet', '--configuration', 'Release', '--no-bundler'] });
assert.equal(success.status, 0);
assert(success.calls.some(c => c.command === 'xcrun' && c.args.join(' ') === 'simctl boot tablet'));
assert(success.calls.some(c => c.command === 'xcrun' && c.args.join(' ') === 'simctl launch --terminate-running-process tablet site.storekit.owner'));
assert(success.calls.some(c => c.command === 'open' && c.args.includes('devices://device/open?id=tablet')));
assert(success.calls.every(c => c.command !== 'xcode-select'));
const booted = simulate({ booted: true });
assert.equal(booted.status, 0);
assert(!booted.calls.some(c => c.command === 'xcrun' && c.args[1] === 'boot'));
const failed = simulate({ buildFails: true });
assert.equal(failed.status, 65);
assert(!failed.calls.some(c => c.command === 'xcrun' && ['install', 'launch'].includes(c.args[1])));
console.log('✓ iOS launcher rejects unsupported hosts/low disk/invalid devices, selects Simulators, preserves Xcode settings, and stops on build failure.');
