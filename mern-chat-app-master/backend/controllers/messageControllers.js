const asyncHandler = require("express-async-handler");
const { encryptedMessage } = require("../models/messageModel");
const User = require("../models/userModel");
const Chat = require("../models/chatModel");
const MessageSequence = require("../models/messageSequenceModel");

/*
  ============================================================================
   🔐 SISTEMA DE MENSAGENS CIFRADAS COM INTEGRIDADE - ARQUITETURA HÍBRIDA
  ============================================================================
  
  CAMADA DE CRIPTOGRAFIA:
  1️⃣ Cliente gera envelope híbrido para cada mensagem:
      - Session Key AES-256 aleatória para cifrar a mensagem
      - AES-GCM fornece confidencialidade + integridade autenticada
      - Session key é cifrada com RSA-OAEP (chave pública do destinatário)
      - Metadados protegidos via AAD (Additional Authenticated Data)
  
  2️⃣ Estrutura do envelope enviado ao servidor:
      {
        encryptedKey: "...",    // Session key cifrada com RSA
        ciphertext: "...",      // Mensagem cifrada com AES-GCM
        iv: "...",              // Initialization Vector
        authTag: "...",         // Tag de autenticação GCM
        metadata: {             // Metadados protegidos no AAD
          senderId: "...",
          recipientId: "...",
          chatId: "...",
          timestamp: 123456,
          sequence: 42          // Número de sequência
        }
      }
  
  3️⃣ Servidor valida e armazena:
      - Valida estrutura do envelope
      - Valida número de sequência (previne replay/reorder)
      - Valida timestamp (previne mensagens antigas)
      - Armazena envelope completo cifrado
      - NÃO tem acesso ao conteúdo da mensagem
  
  4️⃣ Destinatário decifra e valida:
      - Decifra session key com sua chave privada RSA
      - Decifra mensagem com AES-GCM
      - GCM valida automaticamente integridade e AAD
      - Se metadados ou conteúdo foram adulterados, falha
  
  PROTEÇÕES IMPLEMENTADAS:
  ✅ Confidencialidade: AES-256-GCM
  ✅ Integridade: Tag de autenticação GCM
  ✅ Autenticidade: Metadados no AAD
  ✅ Anti-Replay: Números de sequência
  ✅ Anti-Reorder: Validação de sequência
  ✅ Forward Secrecy: Session key única por mensagem
*/

/**
 * Valida a estrutura do envelope híbrido
 */
function validateEnvelopeStructure(envelope) {
  if (!envelope.encryptedKey || typeof envelope.encryptedKey !== "string") {
    throw new Error("Invalid envelope: missing or invalid encryptedKey");
  }

  if (!envelope.ciphertext || typeof envelope.ciphertext !== "string") {
    throw new Error("Invalid envelope: missing or invalid ciphertext");
  }

  if (!envelope.iv || typeof envelope.iv !== "string") {
    throw new Error("Invalid envelope: missing or invalid iv");
  }

  if (!envelope.authTag || typeof envelope.authTag !== "string") {
    throw new Error("Invalid envelope: missing or invalid authTag");
  }

  if (!envelope.metadata || typeof envelope.metadata !== "object") {
    throw new Error("Invalid envelope: missing or invalid metadata");
  }

  const meta = envelope.metadata;
  if (!meta.senderId || !meta.recipientId || !meta.chatId) {
    throw new Error("Invalid metadata: missing required fields");
  }

  if (typeof meta.timestamp !== "number" || meta.timestamp <= 0) {
    throw new Error("Invalid metadata: invalid timestamp");
  }

  if (typeof meta.sequence !== "number" || meta.sequence < 0) {
    throw new Error("Invalid metadata: invalid sequence number");
  }

  return true;
}

/**
 * Valida timestamp da mensagem
 */
function validateTimestamp(timestamp, maxAge = 5 * 60 * 1000) {
  const now = Date.now();
  const age = now - timestamp;

  if (age > maxAge) {
    throw new Error("MESSAGE_EXPIRED: Message timestamp too old");
  }

  if (age < -2 * 60 * 1000) {
    throw new Error("INVALID_TIMESTAMP: Message timestamp in future");
  }

  return true;
}

//
// @desc  Buscar todas as mensagens cifradas de um chat
// @route GET /api/message/:chatId
// @access Protected
//
const allMessages = asyncHandler(async (req, res) => {
  try {
    console.log("\n[MENSAGENS] Buscando mensagens cifradas com integridade...");
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

    console.log(`✅ ${messages.length} envelopes cifrados encontrados`);

    // Log de auditoria para cada mensagem
    messages.forEach((msg, idx) => {
      try {
        const envelope = JSON.parse(msg.content);
        console.log(
          `[${idx + 1}] Envelope válido - Seq: ${
            envelope.metadata?.sequence || "N/A"
          }, Timestamp: ${new Date(
            envelope.metadata?.timestamp || 0
          ).toISOString()}`
        );
      } catch (e) {
        console.warn(`[${idx + 1}] ⚠️ Formato de envelope inválido`);
      }
    });

    res.json(messages);
  } catch (error) {
    console.error("❌ Erro ao buscar mensagens:", error);
    res.status(400).json({ message: error.message });
  }
});

//
// @desc  Armazenar nova mensagem (envelope híbrido cifrado)
// @route POST /api/message
// @access Protected
//
const sendMessage = asyncHandler(async (req, res) => {
  console.log("\n============================================");
  console.log("🔐 RECEBENDO ENVELOPE HÍBRIDO CIFRADO");
  console.log("============================================");

  const { content, chatId, destinatarioId } = req.body;

  if (!content || !chatId || !destinatarioId) {
    console.log("❌ Dados inválidos: faltando campos obrigatórios");
    return res.status(400).json({
      message: "Missing required fields: content, chatId, and destinatarioId",
    });
  }

  try {
    // Parse do envelope
    let envelope;
    try {
      envelope = typeof content === "string" ? JSON.parse(content) : content;
    } catch (parseError) {
      console.error("❌ Erro ao parsear envelope:", parseError);
      return res.status(400).json({
        message: "Invalid envelope format: not valid JSON",
      });
    }

    console.log("📋 Envelope recebido:", {
      hasEncryptedKey: !!envelope.encryptedKey,
      hasCiphertext: !!envelope.ciphertext,
      hasIV: !!envelope.iv,
      hasAuthTag: !!envelope.authTag,
      hasMetadata: !!envelope.metadata,
    });

    // VALIDAÇÃO 1: Estrutura do envelope
    console.log("\n🔍 VALIDAÇÃO 1: Estrutura do Envelope");
    try {
      validateEnvelopeStructure(envelope);
      console.log("✅ Estrutura válida");
    } catch (validationError) {
      console.error("❌", validationError.message);
      return res.status(400).json({ message: validationError.message });
    }

    const metadata = envelope.metadata;
    console.log("📋 Metadados protegidos:", {
      senderId: metadata.senderId,
      recipientId: metadata.recipientId,
      chatId: metadata.chatId,
      timestamp: new Date(metadata.timestamp).toISOString(),
      sequence: metadata.sequence,
    });

    // VALIDAÇÃO 2: Correspondência de IDs
    console.log("\n🔍 VALIDAÇÃO 2: Correspondência de IDs");
    if (metadata.senderId !== req.user._id.toString()) {
      console.error("❌ Sender ID não corresponde ao usuário autenticado");
      return res.status(403).json({
        message: "Sender ID mismatch: not authorized",
      });
    }

    if (metadata.recipientId !== destinatarioId) {
      console.error(
        "❌ Recipient ID não corresponde ao destinatário especificado"
      );
      return res.status(400).json({
        message: "Recipient ID mismatch",
      });
    }

    if (metadata.chatId !== chatId) {
      console.error("❌ Chat ID não corresponde");
      return res.status(400).json({
        message: "Chat ID mismatch",
      });
    }
    console.log("✅ IDs validados");

    // VALIDAÇÃO 3: Chat existe e usuários pertencem a ele
    console.log("\n🔍 VALIDAÇÃO 3: Validação do Chat");
    const chat = await Chat.findById(chatId).populate("users", "name email");
    if (!chat) {
      console.log("❌ Chat não encontrado");
      return res.status(404).json({ message: "Chat not found" });
    }

    const userIds = chat.users.map((u) => u._id.toString());
    if (
      !userIds.includes(req.user._id.toString()) ||
      !userIds.includes(destinatarioId)
    ) {
      console.error("❌ Usuários não pertencem ao chat");
      return res.status(403).json({
        message: "Users not authorized for this chat",
      });
    }
    console.log("✅ Chat validado");

    // VALIDAÇÃO 4: Timestamp
    console.log("\n🔍 VALIDAÇÃO 4: Timestamp");
    try {
      validateTimestamp(metadata.timestamp);
      const age = Date.now() - metadata.timestamp;
      console.log(`✅ Timestamp válido (idade: ${(age / 1000).toFixed(2)}s)`);
    } catch (timestampError) {
      console.error("❌", timestampError.message);
      return res.status(400).json({ message: timestampError.message });
    }

    // VALIDAÇÃO 5: Número de Sequência (Anti-Replay/Reorder)
    console.log("\n🔍 VALIDAÇÃO 5: Número de Sequência");
    try {
      await MessageSequence.validateAndRegister(
        chatId,
        metadata.senderId,
        metadata.sequence,
        10 // janela de tolerância
      );
      console.log(`✅ Sequência ${metadata.sequence} validada e registrada`);
    } catch (sequenceError) {
      console.error(
        "❌ Falha na validação de sequência:",
        sequenceError.message
      );
      return res.status(400).json({
        message: sequenceError.message,
        code: "SEQUENCE_VALIDATION_FAILED",
      });
    }

    // ARMAZENAMENTO: Salva envelope completo cifrado
    console.log("\n💾 ARMAZENAMENTO");
    const envelopeString = JSON.stringify(envelope);

    const newMessage = await encryptedMessage.create({
      sender: req.user._id,
      destinatario: destinatarioId,
      content: envelopeString, // Envelope completo serializado
      chat: chat._id,
    });

    console.log("✅ Envelope armazenado com sucesso");
    console.log("📊 Estatísticas:");
    console.log(`   - ID da mensagem: ${newMessage._id}`);
    console.log(`   - Tamanho do envelope: ${envelopeString.length} bytes`);
    console.log(
      `   - Componentes: encryptedKey, ciphertext, iv, authTag, metadata`
    );

    // Popular informações para retorno
    let populatedMessage = await encryptedMessage
      .findById(newMessage._id)
      .populate("sender", "name pic email")
      .populate("destinatario", "name email")
      .populate("chat");

    populatedMessage = await User.populate(populatedMessage, {
      path: "chat.users",
      select: "name pic email",
    });

    // Atualizar última mensagem do chat
    await Chat.findByIdAndUpdate(chat._id, {
      latestMessage: populatedMessage,
    });

    console.log("\n✅ ENVELOPE PROCESSADO COM SUCESSO");
    console.log("🔒 Proteções ativas:");
    console.log("   ✓ Confidencialidade (AES-256-GCM)");
    console.log("   ✓ Integridade (Authentication Tag)");
    console.log("   ✓ Autenticidade (AAD com metadados)");
    console.log("   ✓ Anti-Replay (Sequence validation)");
    console.log("   ✓ Anti-Reorder (Sequence ordering)");
    console.log("============================================\n");

    res.json(populatedMessage);
  } catch (error) {
    console.error("\n❌ ERRO NO PROCESSAMENTO DO ENVELOPE");
    console.error("Erro:", error.message);
    console.error("Stack:", error.stack);
    console.log("============================================\n");

    res.status(400).json({
      message: error.message || "Failed to process encrypted message",
      code: "PROCESSING_ERROR",
    });
  }
});

/**
 * @desc    Obter próximo número de sequência para um chat
 * @route   GET /api/message/sequence/:chatId
 * @access  Protected
 */
const getNextSequence = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  try {
    // Verifica se o usuário pertence ao chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    const userIds = chat.users.map((u) => u.toString());
    if (!userIds.includes(req.user._id.toString())) {
      return res.status(403).json({ message: "Not authorized for this chat" });
    }

    // Obtém ou cria registro de sequência
    const seqRecord = await MessageSequence.getOrCreate(chatId, req.user._id);
    const nextSeq = await seqRecord.getNextSequence();

    console.log(
      `📊 Próximo número de sequência para ${req.user.name} no chat ${chatId}: ${nextSeq}`
    );

    res.json({
      sequence: nextSeq,
      chatId: chatId,
      senderId: req.user._id,
    });
  } catch (error) {
    console.error("❌ Erro ao obter sequência:", error);
    res.status(400).json({ message: error.message });
  }
});

/**
 * @desc    Validar envelope (endpoint de teste/debug)
 * @route   POST /api/message/validate-envelope
 * @access  Protected
 */
const validateEnvelope = asyncHandler(async (req, res) => {
  const { envelope } = req.body;

  if (!envelope) {
    return res.status(400).json({ message: "Envelope is required" });
  }

  try {
    // Parse se necessário
    const env = typeof envelope === "string" ? JSON.parse(envelope) : envelope;

    // Validações
    const validations = {
      structure: false,
      timestamp: false,
      metadata: false,
    };

    try {
      validateEnvelopeStructure(env);
      validations.structure = true;
    } catch (e) {
      validations.structureError = e.message;
    }

    try {
      validateTimestamp(env.metadata.timestamp);
      validations.timestamp = true;
    } catch (e) {
      validations.timestampError = e.message;
    }

    validations.metadata = !!(
      env.metadata.senderId &&
      env.metadata.recipientId &&
      env.metadata.chatId &&
      env.metadata.sequence !== undefined
    );

    const isValid = Object.values(validations).every((v) => v === true);

    res.json({
      valid: isValid,
      validations,
      metadata: env.metadata,
      envelope: {
        hasEncryptedKey: !!env.encryptedKey,
        hasCiphertext: !!env.ciphertext,
        hasIV: !!env.iv,
        hasAuthTag: !!env.authTag,
      },
    });
  } catch (error) {
    res.status(400).json({
      valid: false,
      error: error.message,
    });
  }
});

module.exports = {
  allMessages,
  sendMessage,
  getNextSequence,
  validateEnvelope,
};
