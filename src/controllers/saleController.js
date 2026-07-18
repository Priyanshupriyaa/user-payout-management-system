const Sale = require("../models/Sale");
const User = require("../models/User");
const SALE_STATUS = require("../constants/saleStatus");

const createSale = async (req, res, next) => {
    try {
        const { userId, brand, earning } = req.body;

        if (!userId || !brand || earning === undefined) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const sale = await Sale.create({
            userId,
            brand,
            earning
        });

        res.status(201).json({
            message: "Sale created successfully",
            sale
        });

    } catch (err) {
        next(err);
    }
};

const getSales = async (req, res, next) => {
    try {

        const sales = await Sale.find()
            .populate("userId", "name email");

        res.status(200).json(sales);

    } catch (err) {
        next(err);
    }
};

const updateSaleStatus = async (req, res, next) => {
    try {

        const { id } = req.params;
        const { status } = req.body;

        if (![SALE_STATUS.APPROVED, SALE_STATUS.REJECTED].includes(status)) {
            return res.status(400).json({
                message: "Invalid status"
            });
        }

        const sale = await Sale.findById(id);

        if (!sale) {
            return res.status(404).json({
                message: "Sale not found"
            });
        }

        if (sale.status !== SALE_STATUS.PENDING) {
            return res.status(400).json({
                message: "Sale already reconciled"
            });
        }


        sale.status = status;

        await sale.save();

        res.json(sale);

    } catch (err) {
        next(err);
    }
};

module.exports = {
    createSale,
    getSales,
    updateSaleStatus
};

