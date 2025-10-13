const asyncHandler = require("express-async-handler");
const { encryptedMessage } = require("../models/messageModel");
const User = require("../models/userModel");
const Chat = require("../models/chatModel");

//@desc Get all Messages
//@route GET /api/message/:chatId
//@access Protected
const allMessages = asyncHandler(async (req, res) => {
  try {
    console.log("\n=== BUSCANDO MENSAGENS ===");
    const { chatId } = req.params;

    const messages = await encryptedMessage
      .find({ chat: chatId })
      .populate("sender", "name pic email")
      .populate("destinatario", "name email")
      .populate("chat")
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error("❌ Erro ao buscar mensagens:", error);
    res.status(400).json({ message: error.message });
  }
});

//@desc Create new message (já cifrada pelo cliente)
//@route POST /api/message
//@access Protected
const sendMessage = asyncHandler(async (req, res) => {
  console.log("\n=== RECEBENDO NOVA MENSAGEM CIFRADA ===");

  const { content, chatId, destinatarioId } = req.body;
  if (!content || !chatId) {
    console.log("❌ Dados inválidos");
    return res.sendStatus(400);
  }

  try {
    const chat = await Chat.findById(chatId).populate("users", "name email");
    if (!chat) {
      console.log("❌ Chat não encontrado");
      return res.status(404).json({ message: "Chat not found" });
    }

    const sender = req.user._id;
    const destinatario = destinatarioId || null;

    // Criar mensagem já cifrada (sem mexer no conteúdo)
    const newMessage = await encryptedMessage.create({
      sender,
      destinatario,
      content, // já vem cifrado do cliente
      chat: chat._id,
    });

    let populatedMessage = await encryptedMessage.findById(newMessage._id)
      .populate("sender", "name pic email")
      .populate("chat");

    populatedMessage = await User.populate(populatedMessage, {
      path: "chat.users",
      select: "name pic email",
    });

    // Atualizar o chat com última mensagem
    await Chat.findByIdAndUpdate(chat._id, { latestMessage: populatedMessage });

    console.log("✓ Mensagem armazenada com sucesso:", newMessage._id);
    res.json(populatedMessage);
  } catch (error) {
    console.error("❌ Erro ao salvar mensagem:", error);
    res.status(400).json({ message: error.message });
  }
  console.log("\x1b[33mTeste3\x1b[0m"); // Amarelo
});

const encryptMsg = async (message, publicKeyPem) => {
  try {
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const encrypted = publicKey.encrypt(forge.util.encodeUtf8(message), 'RSA-OAEP');
    return forge.util.encode64(encrypted);
  } catch (error) {
    console.error("Error encrypting message: ", error);
    throw error;
  }
};

const decryptMsg = (privateKeyPem, encryptedMessage) => {
  try {
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
    const decrypted = privateKey.decrypt(forge.util.decode64(encryptedMessage), 'RSA-OAEP');
    return forge.util.decodeUtf8(decrypted);
  } catch (error) {
    console.error("Error decrypting message: ", error);
    throw error;
  }
};

module.exports = { allMessages, sendMessage };
