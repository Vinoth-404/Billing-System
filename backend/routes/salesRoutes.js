const express = require("express");
const router = express.Router();
const salesController = require("../controllers/salesController");

// Sales transactions routes
router.post("/sales", salesController.recordSale);
router.get("/sales", salesController.getSalesItemsHistory);
router.get("/reports", salesController.getReportsData);
router.get("/reports/summary", salesController.getReportsSummary);
router.get("/reports/supplier", salesController.getSupplierReports);
router.get("/reports/export-data", salesController.getExportData);
router.get("/reports/export-excel", salesController.getExportExcel);
router.get("/notifications", salesController.getNotifications);

// Customer history and purchase history routes
router.get("/customers/export-data", salesController.getCustomerExportData);
router.get("/customers/export-excel", salesController.getCustomerExportExcel);
router.get("/customers", salesController.getCustomerHistoryList);
router.get("/customers/:phone/history", salesController.getCustomerPurchaseHistory);
router.get("/purchases", salesController.getPurchaseHistory);

module.exports = router;
