/** Keep source, documentation and approved UI assets; exclude payloads, keys and game files. */
export function isForbiddenTrackedPath(filename) {
  const name = filename.replaceAll('\\', '/');
  return /\.(?:pfx|p12|key|pem|ppk|cer|crt|exe|dll|msi|msix|appx|zip|rpf|yft|ytd|ydd|ydr|ybn|ymap|ytyp|ymt|ymf|ycd|yld|awc|rel|blend|blend1|psd|fbx|obj)$/i.test(name)
    || /(?:^|\/)\.env(?:\.|$)/i.test(name)
    || /(?:^|\/)(?:id_rsa|id_ed25519|credentials\.json)$/i.test(name)
    || /^(?:\.tools|node_modules|release|packaging-stage|output)\//i.test(name);
}
