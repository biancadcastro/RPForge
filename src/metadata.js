import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export const META = {
  'handling.meta': ['HANDLING_FILE', 'CHandlingDataMgr'],
  'vehicles.meta': ['VEHICLE_METADATA_FILE', 'CVehicleModelInfo__InitDataList'],
  'carcols.meta': ['CARCOLS_FILE', 'CVehicleModelInfoVarGlobal'],
  'carvariations.meta': ['VEHICLE_VARIATION_FILE', 'CVehicleModelInfoVariation'],
  'vehiclelayouts.meta': ['VEHICLE_LAYOUTS_FILE', 'CVehicleMetadataMgr'],
  'caraddoncontentunlocks.meta': ['CONTENT_UNLOCKING_META_FILE', 'SContentUnlocks'],
};
export const children = node => Array.from(node?.childNodes ?? []).filter(n => n.nodeType === 1);
export const child = (node, name) => children(node).find(n => n.tagName === name);
export const value = node => node?.textContent.trim() ?? '';
export const normalized = node => value(node).toLowerCase();
export const serializeXml = doc => Buffer.from(new XMLSerializer().serializeToString(doc));

export function parseMeta(data, basename) {
  const messages = [];
  const source = data.toString('utf8').replace(/^\uFEFF/, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error(`Declaração XML externa não suportada: ${basename}`);
  let doc;
  try { doc = new DOMParser({ onError: (level, message) => messages.push(message) }).parseFromString(source, 'text/xml'); }
  catch { throw new Error(`XML inválido: ${basename}`); }
  if (messages.length || doc.documentElement?.tagName !== META[basename]?.[1]) throw new Error(`XML inválido ou raiz inesperada: ${basename}`);
  return doc;
}

function canonical(node) {
  if (node.nodeType !== 1) return node.nodeType === 3 && node.nodeValue.trim() ? node.nodeValue.trim() : '';
  const attrs = Array.from(node.attributes).map(a => [a.name, a.value]).sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify([node.tagName, attrs, Array.from(node.childNodes).map(canonical).filter(Boolean)]);
}
function itemKey(node) {
  const parent = child(node, 'parent'); const nested = child(node, 'child');
  if (parent && nested) return `txd:${normalized(parent)}:${normalized(nested)}`;
  for (const tag of ['modelName', 'handlingName', 'kitName', 'Name', 'name', 'id']) {
    const field = child(node, tag);
    if (field) return `${tag}:${(field.getAttribute('value') || value(field)).toLowerCase()}`;
  }
  return children(node).length ? `xml:${canonical(node)}` : `text:${normalized(node)}`;
}

/** Merge lists by semantic identity. Conflicting definitions are never silently overwritten. */
export function mergeMetadata(target, incoming, basename) {
  function merge(left, right, location) {
    if (canonical(left) === canonical(right)) return;
    const a = children(left), b = children(right);
    const attrsA = Array.from(left.attributes).map(x => `${x.name}=${x.value}`).sort().join('|');
    const attrsB = Array.from(right.attributes).map(x => `${x.name}=${x.value}`).sort().join('|');
    if (attrsA !== attrsB || (!a.length && !b.length)) throw new Error(`Metas conflitantes em ${basename}: ${location}`);
    // An empty list can receive items; an existing scalar cannot become a list.
    if ((!a.length && value(left)) || (!b.length && value(right))) throw new Error(`Metas conflitantes em ${basename}: ${location}`);
    for (const entry of b) {
      const list = children(left).filter(n => n.tagName === entry.tagName);
      if (entry.tagName === 'Item') {
        const key = itemKey(entry);
        const same = list.find(n => itemKey(n) === key);
        if (same) {
          if (canonical(same) !== canonical(entry)) throw new Error(`Definições conflitantes em ${basename}: ${location}/${key}`);
        } else left.appendChild(target.importNode(entry, true));
      } else {
        const same = list[0];
        if (same) merge(same, entry, `${location}/${entry.tagName}`);
        else left.appendChild(target.importNode(entry, true));
      }
    }
  }
  merge(target.documentElement, incoming.documentElement, target.documentElement.tagName);
  return target;
}

export function records(doc, container) {
  return Array.from(doc?.getElementsByTagName(container) ?? []).flatMap(node => children(node).filter(n => n.tagName === 'Item'));
}
