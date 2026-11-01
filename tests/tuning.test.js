import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { organizeTuning } from '../src/tuning.js';

test('places tuning geometry and dedicated textures in mods, preserving multiple base vehicles and shared assets', () => {
  const names = ['CAR.yft', 'CAR_hi.yft', 'CAR.ytd', 'taxi.yft', 'taxi_hi.yft', 'CAR_bumper.yft', 'CAR_bumper_hi.yft', 'CAR_bumper.ytd', 'CAR_bumper+hi.ytd', 'spoiler.ydr', 'spoiler.ytd', 'unrelated.ydr', 'CAR_bumper.ycd'];
  const files = new Map(names.map(name => [`stream/${name.toLowerCase()}`, { destination: `stream/${name}`, data: Buffer.from(name) }]));
  const metas = [{ basename: 'carcols.meta', doc: new DOMParser().parseFromString('<CVehicleModelInfoVarGlobal><Kits><Item><visibleMods><Item><modelName>spoiler</modelName></Item></visibleMods></Item></Kits></CVehicleModelInfoVarGlobal>', 'text/xml') }];
  const result = organizeTuning(files, metas, ['CAR', 'taxi']);
  for (const name of ['CAR_bumper.yft', 'CAR_bumper_hi.yft', 'CAR_bumper.ytd', 'CAR_bumper+hi.ytd', 'spoiler.ydr', 'spoiler.ytd']) {
    const file = result.get(`stream/mods/${name.toLowerCase()}`);
    assert.equal(file?.destination, `stream/mods/${name}`);
    assert.equal(file.data.toString(), name);
  }
  for (const name of ['CAR.yft', 'CAR_hi.yft', 'CAR.ytd', 'taxi.yft', 'taxi_hi.yft', 'unrelated.ydr', 'CAR_bumper.ycd']) {
    assert.equal(result.get(`stream/${name.toLowerCase()}`)?.destination, `stream/${name}`);
  }
  assert.equal(result.size, files.size);
});
