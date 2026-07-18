const Wallet = require("../models/Wallet");
const Withdrawal = require("../models/Withdrawal");
const Transaction = require("../models/Transaction");
const TRANSACTION_TYPES = require("../constants/transactionTypes");





const createWithdrawal = async (userId, amount) => {

    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
        throw new Error("Wallet not found");
    }

    const lastWithdrawal = await Withdrawal.findOne({
        userId,
        status: "SUCCESS"
    }).sort({ createdAt: -1 });

    if (lastWithdrawal) {

        const diff =
            Date.now() - new Date(lastWithdrawal.createdAt).getTime();

        if (diff < 24 * 60 * 60 * 1000) {
            throw new Error("Only one withdrawal allowed every 24 hours");
        }

    }

    const updatedWallet = await Wallet.findOneAndUpdate(
        {
            userId,
            withdrawableBalance: { $gte: amount }   // DB-level atomic check
        },
        {
            $inc: { withdrawableBalance: -amount }   // atomic deduction
        },
        { new: true }
    );

    if (!updatedWallet) {
        throw new Error("Insufficient balance");
    }

    const withdrawal = await Withdrawal.create({
        userId,
        amount
    });

    await Transaction.create({
        userId,
        type: TRANSACTION_TYPES.WITHDRAWAL,
        amount,
        description: "Withdrawal successful"
    });

    return withdrawal;

};

const failWithdrawal = async (withdrawalId) => {

    // Atomically flip status only if it's currently SUCCESS —
    // prevents double-processing if this is called twice at once.
    const withdrawal = await Withdrawal.findOneAndUpdate(
        {
            _id: withdrawalId,
            status: "SUCCESS"
        },
        {
            status: "FAILED"
        },
        { new: false }   // return the OLD doc, we already know it's now FAILED
    );

    if (!withdrawal) {
        const exists = await Withdrawal.findById(withdrawalId);

        if (!exists) {
            throw new Error("Withdrawal not found");
        }

        throw new Error("Withdrawal already failed or not eligible");
    }

    // Atomic credit back to wallet
    await Wallet.updateOne(
        { userId: withdrawal.userId },
        { $inc: { withdrawableBalance: withdrawal.amount } }
    );

    await Transaction.create({
        userId: withdrawal.userId,
        type: TRANSACTION_TYPES.REFUND,
        amount: withdrawal.amount,
        description: "Refund after failed payout"
    });

    withdrawal.status = "FAILED";  // reflect new state in the returned object

    return withdrawal;

};

module.exports = {
    createWithdrawal,
    failWithdrawal
};