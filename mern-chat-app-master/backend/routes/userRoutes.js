const express = require("express");
const {
  registerUser,
  authUser,
  allUsers,
  updateUserProfile,
  deleteUserProfile,
  getUserProfile,
  verifyEmail,
  resendVerification,
} = require("../controllers/userControllers");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/").get(protect, allUsers);
router.route("/").post(registerUser);
router.post("/login", authUser);
router.post("/resend-verification", resendVerification);
router.get("/verify-email", verifyEmail);
router
  .route("/profile")
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile)
  .delete(protect, deleteUserProfile);

module.exports = router;