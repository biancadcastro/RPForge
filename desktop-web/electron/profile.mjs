const avatarHosts = new Set([
  "cdn.discordapp.com",
  "avatars.githubusercontent.com",
  "lh3.googleusercontent.com",
]);
// Return only the public identity needed by the navbar, never emails or sessions.
export function publicProfile(value) {
  if (
    !value ||
    typeof value.displayName !== "string" ||
    !value.displayName.trim()
  )
    return null;
  let avatarUrl = null;
  try {
    const url = new URL(value.avatarUrl);
    if (
      url.protocol === "https:" &&
      avatarHosts.has(url.hostname) &&
      !url.username &&
      !url.password
    )
      avatarUrl = url.href;
  } catch {
    /* The generic account avatar is used when no image is available. */
  }
  return { displayName: value.displayName.trim().slice(0, 80), avatarUrl };
}
