import {
  faqCreateSchema,
  faqPublishSchema,
  faqReorderSchema,
  faqScopeSchema,
  faqUpdateSchema,
  uuidParamSchema,
} from "./faq_validation.js";
import faqService from "./faq_service.js";

function parseScope(scopeRaw) {
  if (!scopeRaw) return undefined;
  const parsed = faqScopeSchema.safeParse(String(scopeRaw).toUpperCase());
  if (!parsed.success) return null;
  return parsed.data;
}

const faqController = {
  listPublic: async (req, res) => {
    try {
      const scope = parseScope(req.query.scope);
      if (scope === null) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid scope" });
      }

      const publishedOnly = String(req.query.published ?? "true") !== "false";
      const data = await faqService.listFaqs({ scope, publishedOnly });

      res.status(200).json({ success: true, data });
    } catch (err) {
      console.error("Error listing FAQs:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // Admin: includes drafts by default
  listAdmin: async (req, res) => {
    try {
      const scope = parseScope(req.query.scope);
      if (scope === null) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid scope" });
      }

      const publishedOnly = String(req.query.published ?? "false") === "true";
      const data = await faqService.listFaqs({ scope, publishedOnly });

      res.status(200).json({ success: true, data });
    } catch (err) {
      console.error("Error listing FAQs (admin):", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getById: async (req, res) => {
    try {
      const idParsed = uuidParamSchema.safeParse(req.params.id);
      if (!idParsed.success) {
        return res.status(400).json({ success: false, message: "Invalid id" });
      }

      const faq = await faqService.getFaqById(idParsed.data);
      if (!faq) {
        return res
          .status(404)
          .json({ success: false, message: "FAQ not found" });
      }

      res.status(200).json({ success: true, data: faq });
    } catch (err) {
      console.error("Error fetching FAQ:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  create: async (req, res) => {
    try {
      const parsed = faqCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: parsed.error.issues.map((e) => e.message),
        });
      }

      const faq = await faqService.createFaq(parsed.data);
      res.status(201).json({ success: true, data: faq });
    } catch (err) {
      console.error("Error creating FAQ:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  update: async (req, res) => {
    try {
      const idParsed = uuidParamSchema.safeParse(req.params.id);
      if (!idParsed.success) {
        return res.status(400).json({ success: false, message: "Invalid id" });
      }

      const parsed = faqUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: parsed.error.issues.map((e) => e.message),
        });
      }

      const faq = await faqService.updateFaq(idParsed.data, parsed.data);
      if (!faq) {
        return res
          .status(404)
          .json({ success: false, message: "FAQ not found" });
      }

      res.status(200).json({ success: true, data: faq });
    } catch (err) {
      console.error("Error updating FAQ:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  publish: async (req, res) => {
    try {
      const idParsed = uuidParamSchema.safeParse(req.params.id);
      if (!idParsed.success) {
        return res.status(400).json({ success: false, message: "Invalid id" });
      }

      const parsed = faqPublishSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: parsed.error.issues.map((e) => e.message),
        });
      }

      const faq = await faqService.setPublish(
        idParsed.data,
        parsed.data.is_published
      );
      if (!faq) {
        return res
          .status(404)
          .json({ success: false, message: "FAQ not found" });
      }

      res.status(200).json({ success: true, data: faq });
    } catch (err) {
      console.error("Error publishing FAQ:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  reorder: async (req, res) => {
    try {
      const parsed = faqReorderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: parsed.error.issues.map((e) => e.message),
        });
      }

      const data = await faqService.reorderFaqs(
        parsed.data.scope,
        parsed.data.ids
      );
      res.status(200).json({ success: true, data });
    } catch (err) {
      console.error("Error reordering FAQs:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  remove: async (req, res) => {
    try {
      const idParsed = uuidParamSchema.safeParse(req.params.id);
      if (!idParsed.success) {
        return res.status(400).json({ success: false, message: "Invalid id" });
      }

      const ok = await faqService.deleteFaq(idParsed.data);
      if (!ok) {
        return res
          .status(404)
          .json({ success: false, message: "FAQ not found" });
      }

      res.status(200).json({ success: true, message: "FAQ deleted" });
    } catch (err) {
      console.error("Error deleting FAQ:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

export default faqController;
