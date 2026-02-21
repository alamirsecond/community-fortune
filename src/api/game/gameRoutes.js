// src/api/game/gameRoutes.js
import { Router } from "express";
import {
  uploadGame,
  getGameDetails,
  getGames,
  updateGame,
  deleteGameById,
  recordGamePlay,
  getGameLeaderboard,
  getAdminGamesList,
  getAdminGameLeaderboard,
  exportAdminGameLeaderboard,
  getGameFileList,
  getGameCategories,
  updateGameFiles,
} from "./gameController.js";

import {
  gameZipUpload,
  validateUploadedFiles,
  handleUploadError,
} from "../../../middleware/upload.js"; 

import authenticate from "../../../middleware/auth.js";

const router = Router();

//aklilu:Admin leaderboard management
router.get("/admin/list", authenticate(["ADMIN"]), getAdminGamesList);

router.get(
  "/admin/:id/leaderboard",
  authenticate(["ADMIN"]),
  getAdminGameLeaderboard
);

router.get(
  "/admin/:id/export",
  authenticate(["ADMIN"]),
  exportAdminGameLeaderboard
);

//Public routes
router.get("/", getGames);
router.get("/categories", getGameCategories);
router.get("/:id", getGameDetails);
router.get("/:id/leaderboard", getGameLeaderboard);
router.get("/:id/files", getGameFileList);

//Protected routes (authenticated users)
router.post("/record", authenticate(), recordGamePlay);

//Admin/creator routes
router.post(
  "/upload",
  authenticate(["SUPERADMIN","ADMIN"]),
  gameZipUpload,
  validateUploadedFiles,
  handleUploadError,
  uploadGame
);

router.put("/:id", authenticate(["SUPERADMIN","ADMIN"]), updateGame);

router.put(
  "/:id/files",
  authenticate(["SUPERADMIN","ADMIN"]),
  gameZipUpload,
  validateUploadedFiles,
  handleUploadError,
  updateGameFiles
);

router.delete("/:id", authenticate(["SUPERADMIN","ADMIN"]), deleteGameById);

export default router;
