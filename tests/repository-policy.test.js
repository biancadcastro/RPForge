import test from 'node:test';
import assert from 'node:assert/strict';
import { isForbiddenTrackedPath } from '../scripts/repository-policy.mjs';

test('publication policy rejects credentials, raw game content and generated distributions', () => {
  for (const name of ['secret.PFX','keys/id_ed25519','config/credentials.json','.env','sub/.env.local',
    'archive/dlc.rpf','stream/car.YFT','stream/cloth.ydd','stream/map.ymap','stream/props.ytyp',
    'stream/collection.ymt','stream/_manifest.ymf','audio/custom.awc','audio/custom.dat54.rel',
    'private/model.blend','release/setup.exe','shell/identity.msix','source.zip','.tools/report.json',
    'node_modules/module/index.js','packaging-stage/LICENSE','output/pdf/manual.pdf','stream\\map.YMAP',
    'desktop-web/node_modules/package/index.js','desktop-web/.next/server/page.js','desktop-web/out/index.html','desktop-web/tsconfig.tsbuildinfo']) {
    assert.equal(isForbiddenTrackedPath(name), true, name);
  }
});

test('publication policy preserves synthetic fixture generators, documentation and licensed UI assets', () => {
  for (const name of ['LICENSE','NOTICE','tests/fixture.js','src/ytyp-template.json','shell/ForgeShell.cpp',
    'docs/guia-usuario/Manual-RPForge-0.3.1.pdf','desktop/assets/rpforge.png','desktop/assets/rpforge.ico',
    'desktop/fonts/PixelifySans-Regular.ttf','signpath/identity.template.xml','.github/workflows/test.yml']) {
    assert.equal(isForbiddenTrackedPath(name), false, name);
  }
});
