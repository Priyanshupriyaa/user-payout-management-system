const Sale = require("../models/Sale");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const SALE_STATUS = require("../constants/saleStatus");
const TRANSACTION_TYPES = require("../constants/transactionTypes");



const runAdvancePayout = async () => {

    // Find all eligible sales
    const sales = await Sale.find({
        status: SALE_STATUS.PENDING,
        advancePaid: false
    });

    if (sales.length === 0) {
        return {
            message: "No eligible sales found"
        };
    }

    // Group sales by user
    const groupedSales = {};

    for (const sale of sales) {
        const userId = sale.userId.toString();

        if (!groupedSales[userId]) {
            groupedSales[userId] = [];
        }

        groupedSales[userId].push(sale);
    }

    // Process each user
    for (const userId in groupedSales) {

        const wallet = await Wallet.findOne({ userId });

        let totalAdvance = 0;

        for (const sale of groupedSales[userId]) {

            const advance = sale.earning * 0.10;

            totalAdvance += advance;

            sale.advancePaid = true;
            sale.advanceAmount = advance;

            await sale.save();

            await Transaction.create({
                userId,
                saleId: sale._id,
                type: TRANSACTION_TYPES.ADVANCE,
                amount: advance,
                description: "Advance payout"
            });


        }

        wallet.withdrawableBalance += totalAdvance;

        await wallet.save();

    }

    return {
        message: "Advance payout completed"
    };

};

module.exports = {
    runAdvancePayout
};