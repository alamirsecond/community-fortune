import systemSettingsCache from "../src/Utils/systemSettingsCache.js";

const maintenanceGuard = async (req, res, next) => {
  try {
    if (req.headers.authorization) {
      return next();
    }

    if (req.method === "OPTIONS") {
      return next();
    }

    const access = await systemSettingsCache.evaluateMaintenanceAccess(req, null);
    if (!access.allowed) {
      return res.status(503).json({
        success: false,
        message: access.settings.maintenance_message,
        maintenance: {
          estimatedDuration: access.settings.estimated_duration,
          clientIp: access.clientIp,
        },
      });
    }

    next();
  } catch (error) {
    console.error("Maintenance guard error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export default maintenanceGuard;
