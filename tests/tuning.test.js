import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { organizeTuning, cleanMissingTuning } from '../src/tuning.js';

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

test('removes missing visual options and linked models while preserving valid tuning, stats, liveries and kit ids', () => {
  const xml = '<CVehicleModelInfoVarGlobal><Kits><Item><kitName>123_car_modkit</kitName><id value="123"/><visibleMods><Item><modelName>absent</modelName><type>VMT_SPOILER</type></Item><Item><modelName>BUMPER</modelName><linkedModels><Item>missing_link</Item><Item>available_link</Item></linkedModels></Item></visibleMods><linkMods><Item><modelName>missing_extra</modelName></Item></linkMods><statMods><Item><type>VMT_ENGINE</type><modifier value="50"/></Item></statMods><liveryNames><Item>my_livery</Item></liveryNames></Item></Kits><Sirens><Item><id value="77"/></Item></Sirens></CVehicleModelInfoVarGlobal>';
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const files = new Map([
    ['data/carcols.meta', { destination: 'data/carcols.meta', data: Buffer.from(xml) }],
    ['stream/mods/bumper.yft', { destination: 'stream/mods/bumper.yft', data: Buffer.from('geometry') }],
    ['stream/available_link.ydr', { destination: 'stream/available_link.ydr', data: Buffer.from('geometry') }],
    // A dictionary or only an _hi model does not supply the missing base geometry.
    ['stream/absent.ytd', { destination: 'stream/absent.ytd', data: Buffer.from('texture') }],
    ['stream/absent_hi.yft', { destination: 'stream/absent_hi.yft', data: Buffer.from('hi geometry') }],
  ]);
  const metas = [{ basename: 'carcols.meta', destination: 'data/carcols.meta', doc }];
  const before = tag => new XMLSerializer().serializeToString(doc.getElementsByTagName(tag)[0]);
  const stats = before('statMods'); const liveries = before('liveryNames'); const sirens = before('Sirens');
  const result = cleanMissingTuning(files, metas);
  assert.deepEqual(result.removed.sort(), ['absent', 'missing_extra', 'missing_link']);
  assert.equal(doc.getElementsByTagName('visibleMods')[0].getElementsByTagName('modelName').length, 1);
  const output = result.files.get('data/carcols.meta').data.toString();
  assert.ok(!output.includes('absent'));
  assert.ok(output.includes('<modelName>BUMPER</modelName>'));
  assert.ok(output.includes('<Item>available_link</Item>'));
  assert.ok(output.includes('<kitName>123_car_modkit</kitName>'));
  assert.equal(before('statMods'), stats); assert.equal(before('liveryNames'), liveries); assert.equal(before('Sirens'), sirens);
  const preserved = result.files.get('data/carcols.meta').data;
  assert.deepEqual(cleanMissingTuning(result.files, metas).removed, []);
  assert.strictEqual(result.files.get('data/carcols.meta').data, preserved);
});
