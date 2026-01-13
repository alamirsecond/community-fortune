// Role-based access control middleware
 const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions for this action",
      });
    }

    next();
  };
};

// Check if user is superadmin
 const isSuperAdmin = (req, res, next) => {
  if (req.user?.role !== "SUPERADMIN") {
    return res.status(403).json({
      success: false,
      error: "Superadmin access required",
    });
  }
  next();
};

// Check if user is admin or superadmin
 const isAdmin = (req, res, next) => {
  if (!["ADMIN", "SUPERADMIN"].includes(req.user?.role)) {
    return res.status(403).json({
      success: false,
      error: "Admin access required",
    });
  }
  next();
};

export {
   requireRole,
   isSuperAdmin, 
   isAdmin
  };
