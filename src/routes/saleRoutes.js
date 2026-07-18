const express = require("express");

const router = express.Router();

const {
    createSale,
    getSales,
    updateSaleStatus
} = require("../controllers/saleController");

router.post("/", createSale);

router.get("/", getSales);

router.patch("/:id/status", updateSaleStatus);

module.exports = router;