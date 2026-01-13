import SystemAlertService from "../src/api/SuperAdmin/SystemAlertService.js";


const REQUEST_THRESHOLD = 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
let requestCount = 0;
let lastAlertCreatedAt = null;

setInterval(async () => {
  try {
    if (requestCount > REQUEST_THRESHOLD) {
      const now = Date.now();
      if (
        !lastAlertCreatedAt ||
        now - lastAlertCreatedAt > 10 * 60 * 1000
      ) {
        const created = await SystemAlertService.createAlert({
          type: "warning",
          title: "High Traffic Detected",
          message: `Server received ${requestCount} requests in the last minute.`,
        });

        if (created) {
          lastAlertCreatedAt = now;
          console.warn(
            `[ALERT] High traffic detected: ${requestCount} requests/min`
          );
        }
      }
    }
  } catch (err) {
    console.error("Traffic monitor alert error:", err);
  } finally {
    requestCount = 0;
  }
}, CHECK_INTERVAL_MS);

export default function trafficMonitor(req, res, next) {
  requestCount++;
  next();
}

