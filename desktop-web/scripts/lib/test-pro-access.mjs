import path from 'node:path';
// UI fixtures only. This module is never imported by the production application.
export async function testProAccess(application,project){
 await application.evaluate(({app},modulePath)=>{
  const os=process.getBuiltinModule('node:os'),path=process.getBuiltinModule('node:path');
  if(!process.argv.includes('--test-mode')||!app.getPath('userData').startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Pro fixture requires an isolated test process.');
  const {NativeAuth}=process.getBuiltinModule('node:module').createRequire(modulePath)(modulePath);
  NativeAuth.prototype.license=async()=>({plan:'pro',capabilities:['clothing.obj','clothing.neon','clothing.skin']});
 },path.join(project,'electron/native-auth.mjs'));
}
