const express = require("express");

const app = express();

const userRoutes = require("./routes/userRoutes");
const payoutRoutes = require("./routes/payoutRoutes");
const saleRoutes = require("./routes/saleRoutes");
const withdrawalRoutes = require("./routes/withdrawalRoutes");
const errorHandler = require("./middleware/errorHandler");

app.use(express.json());

app.use("/users",userRoutes);

app.use("/payouts", payoutRoutes);

app.use("/sales", saleRoutes);

app.use("/withdrawals", withdrawalRoutes);

app.use(errorHandler);

app.get("/", (req, res) => {
    res.json({
        message: "User Payout Management API Running"
    });
});

module.exports = app;