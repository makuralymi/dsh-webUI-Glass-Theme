/**
 * Host half of the frosted-glass theme plugin.
 *
 * Pure browser-surface plugin: the host side has no behavior. The empty
 * `apply` exists so the package appears as a host Loader entry — the
 * criterion the client-modules node half scans for to discover the browser
 * bundle (lib/client.js) declared through `dsh.client`. The browser half
 * registers into the client composition via the `cordis.patch.yml` row
 * whose `name` points back at this package.
 */
export function apply() {}
