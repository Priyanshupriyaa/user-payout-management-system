const Sale = require("../models/Sale");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const SALE_STATUS = require("../constants/saleStatus");
const TRANSACTION_TYPES = require("../constants/transactionTypes");

const reconcileSales = async () => {

    const sales = await Sale.find({
        reconciled: false,
        status: {
            $in: [SALE_STATUS.APPROVED, SALE_STATUS.REJECTED]
        }
    });

    if (sales.length === 0) {
        return {
            message: "No sales to reconcile"
        };
    }

    const groupedSales = {};

    for (const sale of sales) {

        const userId = sale.userId.toString();

        if (!groupedSales[userId]) {
            groupedSales[userId] = [];
        }

        groupedSales[userId].push(sale);
    }

    for (const userId in groupedSales) {

        const wallet = await Wallet.findOne({ userId });

        let totalAdjustment = 0;

        for (const sale of groupedSales[userId]) {

            let amount = 0;
            let type = "";

            if (sale.status === SALE_STATUS.APPROVED) {

                amount = sale.earning - sale.advanceAmount;
                type = TRANSACTION_TYPES.FINAL;

            } else {

                amount = -sale.advanceAmount;
                type = TRANSACTION_TYPES.RECOVERY;

            }

            totalAdjustment += amount;

            sale.reconciled = true;
            await sale.save();

            await Transaction.create({
                userId,
                saleId: sale._id,
                type,
                amount,
                description:
                    sale.status === SALE_STATUS.APPROVED
                        ? "Final payout after reconciliation"
                        : "Recovery of advance due to rejected sale"
            });

        }

        wallet.withdrawableBalance += totalAdjustment;
        await wallet.save();
    }


    return {
        message: "Reconciliation completed"
    };

};

module.exports = {
    reconcileSales
};

