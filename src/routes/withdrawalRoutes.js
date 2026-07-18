const express = require("express");

const router = express.Router();

const {
    withdraw,
    fail
} = require("../controllers/withdrawalController");

router.post("/", withdraw);

router.patch("/:id/fail", fail);

module.exports = router;