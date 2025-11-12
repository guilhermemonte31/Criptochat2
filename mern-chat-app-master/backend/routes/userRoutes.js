const express = require("express");
const {
  registerUser,
  authUser,
  allUsers,
  updateUserProfile,
  deleteUserProfile,
  getUserProfile,
} = require("../controllers/userControllers");
const { protect } = require("../middleware/authMiddleware");
const User = require("../models/userModel");

const router = express.Router();

router.route("/").get(protect, allUsers);
router.route("/").post(registerUser);
router.post("/login", authUser);

router.post("/rotate-keys", protect, async (req, res) => {
  const userId = req.user._id;
  const userPublicKey = req.body.newPublicKey;
  try{
    await User.findByIdAndUpdate(userId, { publicKey: userPublicKey });
    res.json({ message: "Chave pública atualizada com sucesso" });
  } catch (error) {
    console.error("Erro ao atualizar chave pública:", error);
    res.status(500).json({ message: "Erro ao atualizar chave pública" });
  }
});


router
  .route("/profile")
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile)
  .delete(protect, deleteUserProfile);

module.exports = router;