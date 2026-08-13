/**
 * BALTER BREWING — LOGISTICS DAILY HANDOVER
 * Client-side site configuration.
 *
 * ---------------------------------------------------------------
 * MULTI-DEVICE SYNC
 * ---------------------------------------------------------------
 * Cloud sync now runs through this site's own Cloudflare Worker at
 * /api/sync — the real JSONBin.io Bin ID and API key live ONLY as Worker
 * secrets (Settings → Variables and Secrets → JSONBIN_BIN_ID /
 * JSONBIN_API_KEY in the Cloudflare dashboard). Nothing sensitive belongs
 * in this file anymore; it's shipped to every visitor's browser as plain
 * text, so anything written here is effectively public.
 *
 * The site figures out on its own whether sync is turned on (by asking
 * the Worker), so there's nothing to flip here — just set the two secrets
 * in Cloudflare and it starts working. See README.md for the full setup.
 */
window.HANDOVER_CONFIG = {
  cloudSync: {
    pollSeconds: 20        // how often other devices are checked for updates
  },

  /**
   * ---------------------------------------------------------------
   * WEATHER AUTO-FILL
   * ---------------------------------------------------------------
   * Free, no-key weather via Open-Meteo (open-meteo.com) — fetched
   * straight from the browser, no backend required. Temp, UV, humidity
   * and rain fill in automatically for whichever date is open, and can
   * be edited by hand afterwards (auto-fill won't overwrite an edit).
   * Coordinates default to Currumbin, Gold Coast QLD — change them if
   * the sheet should reflect a different site. This is not sensitive
   * data, so it's fine to keep here.
   */
  weather: {
    enabled: true,
    latitude: -28.1355,
    longitude: 153.485,
    label: "Currumbin, QLD",
    timezone: "Australia/Brisbane"
  }
};
