/**
 * Host half of the frosted-glass theme plugin.
 *
 * Pure browser-surface plugin: the host side has no behavior. The empty
 * `apply` exists so the package appears as a host Loader entry — the
 * criterion the client-modules node half scans for to discover the browser
 * bundle (lib/client.js) declared through `dsh.client`.
 *
 * The transition/schedule preferences ride the existing, Web-exposed
 * `ui-theme` settings section (prefixed with `frosted*`) instead of a private
 * settings namespace: the API proxy serves an explicit namespace allowlist,
 * so a private section would never reach the browser settings transport.
 */
export function apply() {}
