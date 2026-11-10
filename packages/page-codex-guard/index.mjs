// The host part: magpie's runtime loads this module and asks it for the
// page's service. The service runs inside that host, so it stops with magpie.
import { startServer } from "./lib/server.mjs";

let started = null;

export default {
  id: "magpie-codex-guard",
  server: async (_input, options) => {
    if (!started) {
      started = startServer({
        port: Number(options && options.port) || 4391,
        options: options || {}
      }).catch((error) => {
        started = null;
        throw error;
      });
    }
    await started;
    return {};
  }
};
