// YTD (texture dictionary, resource version 13) reader: names, sizes, formats and pixel data
// location. Used by the vehicle editor to check that every texture a YFT references exists.
import {decodeYtdResource, YTD_RESOURCE_VERSION} from './resource.js';
import {ResourceView} from './view.js';
import {readTextureDictionary} from './yft-read.js';

export {YTD_RESOURCE_VERSION};

export function readYtd(input, {limits} = {}) {
  return readYtdResource(decodeYtdResource(input, limits));
}

/** Read an already decoded YTD resource. Returns {textures:[{name,width,height,levels,format,formatCode,data}], view}. */
export function readYtdResource(res) {
  const v = new ResourceView(res);
  v.mark('system', 0, 0x40, 'TextureDictionary');
  return {textures: readTextureDictionary(v, 0), view: v};
}
