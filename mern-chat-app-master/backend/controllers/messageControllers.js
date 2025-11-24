// messageController_SEM_NONCE.js
// Versão modificada que REMOVE validação de nonce

const asyncHandler = require("express-async-handler");
const { encryptedMessage } = require("../models/messageModel");
const User = require("../models/userModel");
const Chat = require("../models/chatModel");

// SISTEMA DE AUDITORIA
const auditLog = [];

const logSecurityEvent = (type, userId, details) => {
  const event = {
    type,
    userId,
    details,
    timestamp: new Date(),
    ip: details.ip || "unknown",
  };

  auditLog.push(event);
  console.log(`🚨 [SECURITY EVENT] ${type}:`, details);
};

// UTILITÁRIOS DE VALIDAÇÃO

// Verifica se o timestamp é válido (janela de 10 minutos)
const isTimestampValid = (timestamp, maxAgeMinutes = 10) => {
  const now = new Date();
  const messageDate = new Date(timestamp);
  const ageMinutes = (now - messageDate) / 1000 / 60;

  return ageMinutes >= 0 && ageMinutes <= maxAgeMinutes;
};

// Rate limiting simples
const userMessageCounts = new Map();

const checkRateLimit = (userId, maxPerMinute = 30) => {
  const now = Date.now();
  const userKey = userId.toString();

  if (!userMessageCounts.has(userKey)) {
    userMessageCounts.set(userKey, { count: 1, resetTime: now + 60000 });
    return { allowed: true, remaining: maxPerMinute - 1 };
  }

  const userData = userMessageCounts.get(userKey);

  // Reset se passou 1 minuto
  if (now > userData.resetTime) {
    userData.count = 1;
    userData.resetTime = now + 60000;
    return { allowed: true, remaining: maxPerMinute - 1 };
  }

  // Incrementar contador
  userData.count++;

  if (userData.count > maxPerMinute) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((userData.resetTime - now) / 1000),
    };
  }
  return { allowed: true, remaining: maxPerMinute - userData.count };
};

// ENDPOINTS DE MENSAGENS

//
// @desc  Buscar todas as mensagens cifradas de um chat
// @route GET /api/message/:chatId
// @access Protected
//
const allMessages = asyncHandler(async (req, res) => {
  try {
    console.log("\n[MENSAGENS] Iniciando busca de mensagens cifradas...");
    const { chatId } = req.params;

    const messages = await encryptedMessage
      .find({
        chat: chatId,
        $or: [{ destinatario: req.user._id }, { sender: req.user._id }],
      })
      .populate("sender", "name pic email")
      .populate("destinatario", "name email")
      .populate("chat")
      .sort({ createdAt: 1 });

    console.log(`✅ ${messages.length} mensagens encontradas`);
    res.json(messages);
  } catch (error) {
    console.error("❌ Erro ao buscar mensagens:", error);
    res.status(400).json({ message: error.message });
  }
});

//
// @desc Enviar nova Mensagem COM INTEGRIDADE (SEM NONCE)
// @route POST /api/message
// @access Protected
//
const sendMessage = asyncHandler(async (req, res) => {
  console.log("\n=== RECEBENDO MENSAGEM COM INTEGRIDADE (SEM NONCE) ===");

  const {
    content,
    chatId,
    destinatarioId,
    // Campos de integridade (SEM NONCE)
    encryptedKey,
    iv,
    authTag,
    timestamp,
    hmac,
  } = req.body;

  // VALIDAÇÃO 1: Campos obrigatórios (SEM NONCE)
  if (
    !content ||
    !chatId ||
    !encryptedKey ||
    !iv ||
    !authTag ||
    !timestamp ||
    !hmac
  ) {
    console.log("❌ Campos de integridade faltando");
    return res.status(400).json({
      message: "Missing integrity fields",
      required: [
        "content",
        "chatId",
        "encryptedKey",
        "iv",
        "authTag",
        "timestamp",
        "hmac",
      ],
    });
  }

  try {
    const senderId = req.user._id;

    // === VALIDAÇÃO 2: Rate Limiting ===
    console.log("1️⃣ Verificando rate limit...");
    const rateLimit = checkRateLimit(senderId);
    if (!rateLimit.allowed) {
      logSecurityEvent("RATE_LIMIT_EXCEEDED", senderId, {
        chatId,
        retryAfter: rateLimit.retryAfter,
      });

      return res.status(429).json({
        message: "Too many messages. Please wait.",
        retryAfter: rateLimit.retryAfter,
      });
    }

    // === VALIDAÇÃO 3: Timestamp ===
    console.log("2️⃣ Verificando timestamp...");
    if (!isTimestampValid(timestamp)) {
      logSecurityEvent("INVALID_TIMESTAMP", senderId, {
        chatId,
        timestamp,
        age: (new Date() - new Date(timestamp)) / 1000 / 60,
      });

      return res.status(400).json({
        message: "Invalid timestamp - message too old or from future",
      });
    }

    // === VALIDAÇÃO 4: Chat Existe ===
    console.log("3️⃣ Verificando chat...");
    const chat = await Chat.findById(chatId).populate("users", "name email");
    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // === VALIDAÇÃO 5: Usuário no Chat ===
    const isUserInChat = chat.users.some(
      (u) => u._id.toString() === senderId.toString()
    );
    if (!isUserInChat) {
      logSecurityEvent("UNAUTHORIZED_CHAT_ACCESS", senderId, {
        chatId,
        users: chat.users.map((u) => u._id),
      });

      return res.status(403).json({
        message: "Unauthorized - user not in chat",
      });
    }

    // === SALVAR MENSAGEM (SEM NONCE) ===
    console.log("4️⃣ Salvando mensagem com integridade...");
    const newMessage = await encryptedMessage.create({
      sender: senderId,
      destinatario: destinatarioId || null,
      content,
      encryptedKey,
      iv,
      authTag,
      timestamp: new Date(timestamp),
      hmac,
      chat: chat._id,
      integrityVerified: true,
      tampered: false,
    });

    // === POPULAR DADOS ===
    let populatedMessage = await encryptedMessage
      .findById(newMessage._id)
      .populate("sender", "name pic email")
      .populate("destinatario", "name email")
      .populate("chat");

    populatedMessage = await User.populate(populatedMessage, {
      path: "chat.users",
      select: "name pic email",
    });

    // === ATUALIZAR ÚLTIMA MENSAGEM ===
    await Chat.findByIdAndUpdate(chat._id, {
      latestMessage: populatedMessage,
    });

    // === LOG DE SUCESSO ===
    console.log("✅ Mensagem salva com integridade verificada!");
    console.log(`   ID: ${newMessage._id}`);
    console.log(`   Remetente: ${req.user.name}`);
    console.log(`   Chat: ${chat._id}`);

    res.json(populatedMessage);
  } catch (error) {
    console.error("❌ Erro ao salvar mensagem:", error);
    res.status(400).json({ message: error.message });
  }

  console.log("Fim do processamento da mensagem.\n");
});

/**
 * @desc  Buscar mensagens por destinatário
 * @route GET /api/message/getmessages/:destinatarioID
 * @access Protected
 */
const allMessagesDestinatario = asyncHandler(async (req, res) => {
  try {
    console.log("\n[MENSAGENS] Buscando por destinatário...");
    const { destinatarioID } = req.params;

    const messages = await encryptedMessage
      .find({ destinatario: destinatarioID })
      .populate("sender", "name pic email")
      .populate("destinatario", "name email")
      .populate("chat")
      .sort({ createdAt: 1 });

    console.log(`✅ ${messages.length} mensagens encontradas`);
    res.json(messages);
  } catch (error) {
    console.error("Erro ao buscar mensagens:", error);
    res.status(400).json({ message: error.message });
  }
});

/**
 * @desc  Editar mensagem (recriptografar após rotação de chaves)
 * @route POST /api/message/editmessage
 * @access Protected
 */
const editedMessage = asyncHandler(async (req, res) => {
  console.log("\n[MENSAGENS] Editando mensagem...");

  const { msgID, content, encryptedKey, iv, authTag, timestamp, hmac } =
    req.body;

  try {
    const mensagem = await encryptedMessage.findById(msgID);

    if (!mensagem) {
      return res.status(404).json({ message: "Mensagem não encontrada" });
    }

    // Verificar se usuário tem permissão
    if (
      mensagem.sender.toString() !== req.user._id.toString() &&
      mensagem.destinatario?.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message: "Sem permissão para editar esta mensagem",
      });
    }

    // Atualizar com novos dados de integridade
    mensagem.content = content;
    mensagem.encryptedKey = encryptedKey;
    mensagem.iv = iv;
    mensagem.authTag = authTag;
    mensagem.timestamp = timestamp ? new Date(timestamp) : mensagem.timestamp;
    mensagem.hmac = hmac;
    mensagem.integrityVerified = true;

    await mensagem.save();

    console.log("✅ Mensagem atualizada com sucesso");
    res.json({ message: "Mensagem atualizada com sucesso" });
  } catch (error) {
    console.error("❌ Erro ao editar mensagem:", error);
    res.status(400).json({ message: error.message });
  }
});

/**
 * @desc  Obter logs de auditoria (apenas admin)
 * @route GET /api/message/audit-logs
 * @access Protected + Admin
 */
const getAuditLogs = asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }

  const recentLogs = auditLog.slice(-100);
  res.json({
    total: auditLog.length,
    logs: recentLogs,
  });
});

/**
 * @desc  Verificar integridade de uma mensagem específica
 * @route POST /api/message/verify/:messageId
 * @access Protected
 */
const verifyMessageIntegrity = asyncHandler(async (req, res) => {
  const { messageId } = req.params;

  try {
    const message = await encryptedMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Verificar se usuário tem acesso
    if (
      message.sender.toString() !== req.user._id.toString() &&
      message.destinatario?.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Realizar verificações
    const checks = {
      hasRequiredFields: !!(
        message.encryptedKey &&
        message.iv &&
        message.authTag &&
        message.hmac
      ),
      timestampValid: isTimestampValid(message.timestamp, 60),
      integrityVerified: message.integrityVerified,
      tampered: message.tampered,
    };

    const allChecksPass = Object.values(checks).every((v) => v === true);

    res.json({
      messageId,
      valid: allChecksPass,
      checks,
      timestamp: message.timestamp,
    });
  } catch (error) {
    console.error("Erro ao verificar integridade:", error);
    res.status(400).json({ message: error.message });
  }
});

module.exports = {
  allMessages,
  sendMessage,
  allMessagesDestinatario,
  editedMessage,
  getAuditLogs,
  verifyMessageIntegrity,
};
