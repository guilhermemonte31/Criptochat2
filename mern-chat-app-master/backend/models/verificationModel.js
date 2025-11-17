const mongoose = require("mongoose");

const verificationTokenSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    tokenHash: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["email"],
      required: true,
    },
    used: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VerificationToken", verificationTokenSchema);