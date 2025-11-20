const express = require("express");
const {
  registerUser,
  updatePublicKey,
  authUser,
  allUsers,
  updateUserProfile,
  deleteUserProfile,
  getUserProfile,
  sendVerificationOtp,
  updateEncryptedPrivateKey,
  requestPasswordReset,
  resetPassword,
} = require("../controllers/userControllers");
const { protect } = require("../middleware/authMiddleware");
const User = require("../models/userModel");

const router = express.Router();

router.route("/").get(protect, allUsers);
router.route("/").post(registerUser);
router.post("/login", authUser);
router.post("/rotatekeys",protect, updatePublicKey);
router.post("/checkemail", sendVerificationOtp);
router.post("/updateEncryptedKey", protect, updateEncryptedPrivateKey);
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password/:token", resetPassword);

router
  .route("/profile")
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile)
  .delete(protect, deleteUserProfile);

module.exports = router;