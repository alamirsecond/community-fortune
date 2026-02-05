import { Router } from "express";
import authenticate from "../../../middleware/auth.js";
import voucherController from "./voucher_controller.js";

const voucherRouter = Router();

// Admin endpoints
voucherRouter.post(
  "/admin/create",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.createVoucher
);

voucherRouter.get(
  "/admin/overview",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.getOverview
);

voucherRouter.get(
  "/admin/export",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.exportVouchers
);

voucherRouter.get(
  "/admin/export/active",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.exportActiveVouchers
);

voucherRouter.get(
  "/admin/export/expired",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.exportExpiredVouchers
);

voucherRouter.get(
  "/admin/export/scheduled",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.exportScheduledVouchers
);

voucherRouter.get(
  "/admin/export/inactive",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.exportInactiveVouchers
);

voucherRouter.get(
  "/admin/export/type/single-use",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.exportSingleUseVouchers
);

voucherRouter.get(
  "/admin/export/type/multi-use",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.exportMultiUseVouchers
);

voucherRouter.get(
  "/admin/export/type/bulk-codes",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.exportBulkCodesVouchers
);

voucherRouter.get(
  "/admin/list",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.listVouchers
);

voucherRouter.get(
  "/admin/:id",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.getVoucher
);

voucherRouter.put(
  "/admin/:id",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.updateVoucher
);

voucherRouter.patch(
  "/admin/:id/toggle",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.toggleVoucher
);

voucherRouter.delete(
  "/admin/:id",
  authenticate(["ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.deleteVoucher
);

// User endpoints
voucherRouter.post(
  "/validate",
  authenticate(["USER", "user", "ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.validateVoucher
);

voucherRouter.post(
  "/redeem",
  authenticate(["USER", "user", "ADMIN", "admin", "SUPERADMIN", "superadmin"]),
  voucherController.redeemVoucher
);

export default voucherRouter;
