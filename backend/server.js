const express = require("express");
const cors = require("cors");

const db = require("./config/db");
const runMigration = require("./config/migrate");

// Run migrations on startup
runMigration()
  .then(() => console.log("Migrations completed successfully"))
  .catch(err => console.error("Migrations failed:", err));

const productRoutes = require("./routes/productRoutes");
const salesRoutes = require("./routes/salesRoutes");
const expenseRoutes = require("./routes/expenseRoutes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", productRoutes);
app.use("/api", salesRoutes);
app.use("/api", expenseRoutes);

app.get("/", (req, res) => {
  res.send("Slipper Shop Backend Running");
});

app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});