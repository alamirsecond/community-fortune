import pool from "../../../database.js";
import PartnersService from "./partners_service.js";
import {
  ApplicationSchema,
  ApplicationStatusSchema,
} from "./partners_validator.js";

const partnersController = {
  submitApplication: async (req, res) => {
    try {
      const applicationData = ApplicationSchema.parse(req.body);
      const application = await PartnersService.submitApplication(
        applicationData
      );

      res.status(201).json({
        success: true,
        message: "Application submitted successfully",
        data: { application_id: application.id },
      });
    } catch (err) {
      console.error("Submit application error:", err);
      res.status(400).json({ success: false, error: err.message });
    }
  },

  getApplications: async (req, res) => {
    try {
      const { page = 1, limit = 20, status, platform } = req.query;
      const applications = await PartnersService.getApplications({
        page,
        limit,
        status,
        platform,
      });

      res.status(200).json({ success: true, data: applications });
    } catch (err) {
      console.error("Get applications error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  getApplication: async (req, res) => {
    try {
      const { id } = req.params;
      const application = await PartnersService.getApplication(id);

      if (!application) {
        return res
          .status(404)
          .json({ success: false, message: "Application not found" });
      }

      res.status(200).json({ success: true, data: application });
    } catch (err) {
      console.error("Get application error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  updateApplicationStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, admin_notes } = ApplicationStatusSchema.parse(req.body);

      await PartnersService.updateApplicationStatus(
        id,
        status,
        admin_notes,
        req.user.id
      );
      res
        .status(200)
        .json({ success: true, message: "Application status updated" });
    } catch (err) {
      console.error("Update application status error:", err);
      res.status(400).json({ success: false, error: err.message });
    }
  },

  assignApplication: async (req, res) => {
    try {
      const { id } = req.params;
      const { admin_id } = req.body;

      await PartnersService.assignApplication(id, admin_id, req.user.id);
      res.status(200).json({ success: true, message: "Application assigned" });
    } catch (err) {
      console.error("Assign application error:", err);
      res.status(400).json({ success: false, error: err.message });
    }
  },

  getPartnershipAnalytics: async (req, res) => {
    try {
      const { period = "30d" } = req.query;
      const analytics = await PartnersService.getPartnershipAnalytics(period);
      res.status(200).json({ success: true, data: analytics });
    } catch (err) {
      console.error("Get partnership analytics error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },
};

export default partnersController;
