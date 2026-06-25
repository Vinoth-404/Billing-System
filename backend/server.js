const express = require("express");
const cors = require("cors");

require("./config/db");

const productRoutes = require("./routes/productRoutes");
const salesRoutes = require("./routes/salesRoutes");
const expenseRoutes = require("./routes/expenseRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", productRoutes);
app.use("/api", salesRoutes);
app.use("/api", expenseRoutes);

app.get("/", (req, res) => {
  res.send("Slipper Shop Backend Running");
});

app.listen(process.env.PORT || 5000, () => {
  console.log("Server running on port 5000");
});