const express = require("express");
const router = express.Router();
const salesController = require("../controllers/salesController");

// Sales transactions routes
router.post("/sales", salesController.recordSale);
router.get("/sales", salesController.getSalesItemsHistory);
router.get("/reports", salesController.getReportsData);
router.get("/reports/summary", salesController.getReportsSummary);
router.get("/notifications", salesController.getNotifications);

module.exports = router;
