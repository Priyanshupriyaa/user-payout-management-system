const {
    createWithdrawal,
    failWithdrawal
} = require("../services/withdrawalService");

const withdraw = async (req, res, next) => {

    try {

        const { userId, amount } = req.body;

        const result =
            await createWithdrawal(userId, amount);

        res.status(201).json(result);

    } catch (err) {

        next(err);

    }

};

const fail = async (req, res, next) => {

    try {

        const result =
            await failWithdrawal(req.params.id);

        res.json(result);

    } catch (err) {

        next( err )

    }

};

module.exports = {
    withdraw,
    fail
};