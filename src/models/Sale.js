const mongoose = require("mongoose");
const SALE_STATUS = require("../constants/saleStatus");

const saleSchema = new mongoose.Schema(

  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    brand: {
      type: String,
      required: true,
    },

    earning: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: [SALE_STATUS.PENDING, SALE_STATUS.APPROVED, SALE_STATUS.REJECTED],
      default: SALE_STATUS.PENDING,
      index: true,
    },

    advancePaid: {
      type: Boolean,
      default: false,
      index: true,
    },

    advanceAmount: {
      type: Number,
      default: 0,
    },

    reconciled: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Sale", saleSchema);