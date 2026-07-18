const {
    runAdvancePayout
} = require("../services/advancePayoutService");

const {
    reconcileSales
} = require("../services/reconciliationService");

const advancePayout = async (req, res, next) => {

    try {

        const result = await runAdvancePayout();

        res.status(200).json(result);

    } catch (err) {

        next(err);

    }

};

const reconcile = async (req, res, next) => {

    try {

        const result = await reconcileSales();

        res.status(200).json(result);

    } catch (err) {

        next(err);

    }

};

module.exports = {
    advancePayout,
    reconcile
};

