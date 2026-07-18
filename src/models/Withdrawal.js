const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    amount: {
        type: Number,
        required: true
    },

    status: {
        type: String,
        enum: ["SUCCESS", "FAILED"],
        default: "SUCCESS"
    }


}, {
    timestamps: true
});

module.exports = mongoose.model("Withdrawal", withdrawalSchema);