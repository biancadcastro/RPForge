import path from 'node:path';
import {desktopProfile} from './desktop-profile.mjs';
// Run outside package identity before registering the Explorer extension.
if(process.platform==='win32')desktopProfile(path.join(process.env.APPDATA,'rpforge-desktop'),process.env.LOCALAPPDATA);
