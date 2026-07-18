const express = require("express");

const router = express.Router();

const {
    advancePayout,
    reconcile
} = require("../controllers/payoutController");

router.post("/advance", advancePayout);

router.post("/reconcile", reconcile);

module.exports = router;