const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const salesController = require("../controllers/salesController");

// Product routes
router.get("/products", productController.getProducts);
router.get("/products/filters", productController.getProductFilters);
router.get("/products/search/attributes", productController.getProductByAttributes);
router.get("/products/article/:articleNumber", productController.getProductByArticleNumber);
router.get("/products/:serial_no", productController.getProductBySerial);
router.post("/products", productController.addOrUpdateStock);
router.put("/products/:id", productController.editProduct);
router.delete("/products/:id", productController.deleteProduct);

// Barcode routes
router.get("/products/barcode/:barcode", productController.getProductByBarcode);
router.get("/barcode/image/:barcode", productController.getBarcodeImage);
router.post("/barcode/generate/:id", productController.regenerateBarcode);
router.post("/barcode/generate-missing", productController.generateMissingBarcodes);
router.post("/barcode/print/:id", productController.printBarcode);
router.post("/barcode/print-all", productController.printAllBarcodes);

// Settings routes
router.get("/settings", productController.getSettings);
router.post("/settings", productController.saveSettings);
router.post("/settings/test-sms", productController.testSMS);
router.post("/settings/change-password", productController.changePassword);
router.post("/settings/verify-password", productController.verifyPassword);
router.post("/settings/reset-password", productController.resetPassword);
router.post("/settings/recovery-pin", productController.setRecoveryPin);
router.post("/settings/verify-recovery-pin", productController.verifyRecoveryPin);
router.post("/settings/reset-password-pin", productController.resetPasswordWithPin);

// Master Tables Management routes
router.get("/master/:category", productController.getMasterItems);
router.post("/master/:category", productController.addMasterItem);
router.put("/master/:category/:id", productController.editMasterItem);
router.delete("/master/:category/:id", productController.deleteMasterItem);

// Activity logs route
router.get("/activity-log", productController.getActivityLogs);

// Dashboard routes (routes to sales controller for combined metrics)
router.get("/dashboard", salesController.getDashboardStats);

module.exports = router;