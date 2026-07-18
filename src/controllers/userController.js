const User = require("../models/User");
const Wallet = require("../models/Wallet");

const createUser = async (req, res, next) => {
    try {
        const { name, email } = req.body;

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                message: "User already exists"
            });
        }

        const user = await User.create({
            name,
            email
        });

        await Wallet.create({
            userId: user._id
        });

        res.status(201).json(user);

    } catch (err) {
        next(err);
    }
};

module.exports = {
    createUser
};