// Optional interoperability test: FBX files written by Blender (an independent FBX writer)
// against the poses Blender itself evaluated. The fixture is not in Git (.fbx files are not
// allowed in the repository); generate it once with
//   node scripts/animation-engine/fbx-interop.mjs --blender <blender.exe> --out <dir>
// and point RPFORGE_FBX_INTEROP_DIR at <dir>. Without the fixture the test is skipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {inspectFbx, convertFbxToYcd} from '../src/animation-engine/index.js';
import {compareWithOracle, bonePath} from '../scripts/animation-engine/fbx-interop-lib.mjs';

const dir = process.env.RPFORGE_FBX_INTEROP_DIR;
const available = Boolean(dir) && existsSync(join(dir, 'oracle.json')) && existsSync(join(dir, 'freemode-actions.fbx')) && existsSync(join(dir, 'freemode-zup.fbx'));
const skip = available ? false : 'set RPFORGE_FBX_INTEROP_DIR to a fixture made by scripts/animation-engine/fbx-interop.mjs';

test('interop: Blender-exported FBX converts to the poses Blender evaluated (Y up with bind pose, Z up without)', {skip}, () => {
  const oracle = JSON.parse(readFileSync(join(dir, 'oracle.json'), 'utf8'));
  for (const [file, up, restPose] of [['freemode-actions.fbx', 'Y', 'bindPose'], ['freemode-zup.fbx', 'Z', 'defaultPose']]) {
    const bytes = readFileSync(join(dir, file)), info = inspectFbx(bytes);
    assert.equal(info.ok, true); assert.equal(info.convertible, true); assert.equal(info.format, 'binary'); assert.equal(info.settings.upAxis, up);
    assert.equal(info.takes.length, 3); assert.equal(info.mapping.mapped, 128); assert.equal(info.settings.fps, 30);
    assert.equal(info.hasBindPose, restPose === 'bindPose');
    for (const take of info.takes) {
      const expected = oracle.takes.find(t => take.name.endsWith(t.name));
      assert.ok(expected, take.name);
      const r = convertFbxToYcd(bytes, {take: take.name, clipName: expected.name});
      assert.equal(r.ok, true, JSON.stringify(r.error));
      assert.equal(r.report.conversion.restPose, restPose);
      assert.equal(r.report.conversion.restAlignment.bones, 0, 'same rig as the target: nothing to align');
      assert.ok(Math.abs(r.report.conversion.scale - 0.01) < 1e-6, 'Blender writes centimetres');
      const check = compareWithOracle(r.ycd, oracle, expected);
      assert.equal(check.frames, expected.frames.length);
      assert.ok(check.maxPositionError < 1e-3, `${file} ${take.name}: ${check.maxPositionError} m`);
      assert.ok(check.maxAngleError < 0.1, `${file} ${take.name}: ${check.maxAngleError} degrees`);
    }
  }
});

test('interop: the three sample animations mean what their names say, in the game model space', {skip}, () => {
  const bytes = readFileSync(join(dir, 'freemode-actions.fbx'));
  const ycd = name => { const r = convertFbxToYcd(bytes, {take: `freemode|${name}`}); assert.equal(r.ok, true); return r.ycd; };
  // Model space: the ped faces +Y, its right side is +X, up is +Z.
  const arm = ycd('braco_direito_levanta'), right = bonePath(arm, 'SKEL_R_Hand'), left = bonePath(arm, 'SKEL_L_Hand'), head = bonePath(arm, 'SKEL_Head');
  assert.ok(right[0][0] > 0.3 && left[0][0] < -0.3, 'right hand on the +X side');
  assert.ok(right[37][2] > head[37][2] + 0.15, 'right hand ends above the head');
  assert.ok(Math.abs(left[37][2] - left[0][2]) < 1e-3, 'left hand does not move');
  assert.ok(Math.abs(right[75][2] - right[0][2]) < 1e-3, 'and comes back down');
  const twist = ycd('giro_tronco'), rs = bonePath(twist, 'SKEL_R_UpperArm'), ls = bonePath(twist, 'SKEL_L_UpperArm');
  assert.ok(rs[15][1] > rs[0][1] + 0.1 && ls[15][1] < ls[0][1] - 0.1, 'first the chest turns to the ped\'s left (right shoulder forward)');
  assert.ok(rs[45][1] < rs[0][1] - 0.1 && ls[45][1] > ls[0][1] + 0.1, 'then to its right');
  const march = ycd('passo_no_lugar'), lf = bonePath(march, 'SKEL_L_Foot'), rf = bonePath(march, 'SKEL_R_Foot'), root = bonePath(march, 'SKEL_ROOT');
  assert.ok(lf[15][2] > lf[0][2] + 0.15 && lf[15][1] > lf[0][1] + 0.1, 'left foot lifts forward first');
  assert.ok(rf[45][2] > rf[0][2] + 0.15 && Math.abs(rf[15][2] - rf[0][2]) < 0.08, 'then the right foot');
  assert.ok(root[15][2] > root[0][2] + 0.03 && Math.abs(root[30][2] - root[0][2]) < 1e-3, 'the body rises a little with each step');
});
