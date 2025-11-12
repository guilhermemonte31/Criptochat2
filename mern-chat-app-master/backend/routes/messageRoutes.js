const express = require("express");
const {
  allMessages,
  sendMessage,
  getNextSequence, // ← NOVO
  validateEnvelope, // ← NOVO (opcional, para debug)
} = require("../controllers/messageControllers");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/:chatId").get(protect, allMessages);
router.route("/").post(protect, sendMessage);
router.route("/sequence/:chatId").get(protect, getNextSequence); // ← NOVO
router.route("/validate-envelope").post(protect, validateEnvelope); // ← NOVO

module.exports = router;
