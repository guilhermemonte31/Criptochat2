const express = require("express");
const {
  allMessages,
  sendMessage,
  allMessagesDestinatario,
  editedMessage
} = require("../controllers/messageControllers");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/:chatId").get(protect, allMessages);
router.route("/").post(protect, sendMessage);
router.route("/getmessages/:destinatarioID").get(protect, allMessagesDestinatario);
router.route("/editmessage").post(protect, editedMessage);



// router.post("/edit/:msgId", protect, async (req, res) => {
//   const msgID = req.params.msgId;
//   console.log("[DEBUG] ID da mensagem recebida para atualização:", msgID);
//   const newContent = req.body.content;
//   try{
//     await Message.findByIdAndUpdate(msgID, {content: newContent});
//     res.json({ message: "Mensagem atualizada com sucesso" });
//   }catch (error) {
//     res.status(500).json({ message: "Erro ao processar a mensagem" });
//   }
// });




module.exports = router;
