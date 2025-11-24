const express = require("express");
const {
  allMessages,
  sendMessage,
  allMessagesDestinatario,
  editedMessage,
  getAuditLogs, // NOVO
  verifyMessageIntegrity, // NOVO
} = require("../controllers/messageControllers");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/:chatId").get(protect, allMessages);
router.route("/").post(protect, sendMessage);
router
  .route("/getmessages/:destinatarioID")
  .get(protect, allMessagesDestinatario);
router.route("/editmessage").post(protect, editedMessage);

// === NOVOS ENDPOINTS ===
router.route("/audit-logs").get(protect, getAuditLogs);
router.route("/verify/:messageId").post(protect, verifyMessageIntegrity);

module.exports = router;
