const express = require("express");
const {
  allMessages,
  sendMessage,
} = require("../controllers/messageControllers");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/:chatId").get(protect, allMessages);
router.route("/").post(protect, sendMessage);
router.route("/getmessages/:destinatarioID").get(protect, allMessagesDestinatario);
router.route("/editmessage").post(protect, editedMessage);

module.exports = router;
