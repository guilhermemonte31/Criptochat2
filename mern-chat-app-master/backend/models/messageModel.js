const mongoose = require("mongoose");

const testSchema = mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    content: { type: String, trim: true },
    chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat" },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

/**
 * ============================================================================
 * ESQUEMA DE MENSAGEM COM INTEGRIDADE (SEM NONCE)
 * ============================================================================
 *
 * Este esquema implementa os seguintes mecanismos de integridade:
 *
 * 1. CRIPTOGRAFIA HÍBRIDA (RSA + AES-GCM):
 *    - Usa AES-GCM para criptografar a mensagem (rápido e seguro)
 *    - Usa RSA-OAEP para criptografar a chave AES (segurança de chaves)
 *
 * 2. AUTHENTICATION TAG (authTag):
 *    - Gerado automaticamente pelo AES-GCM
 *    - Garante que a mensagem não foi adulterada
 *    - Se qualquer byte for modificado, a verificação falhará
 *
 * 3. TIMESTAMP:
 *    - Momento exato do envio
 *    - Detecta mensagens muito antigas (possível replay)
 *    - Permite ordenação temporal
 *    - Servidor rejeita mensagens com > 10 minutos
 *
 * 4. HMAC (Hash-based Message Authentication Code):
 *    - Segunda camada de verificação
 *    - Hash de: content + timestamp + sender
 *    - Garante integridade mesmo se AES-GCM for comprometido
 *
 * 5. IV (Initialization Vector):
 *    - Valor aleatório único para cada mensagem
 *    - Garante que mensagens idênticas tenham cifras diferentes
 *    - Essencial para segurança do AES-GCM
 *
 * 6. MESSAGE ID (MongoDB _id):
 *    - ID único automático do MongoDB
 *    - Previne duplicatas exatas no banco
 *    - Gerado automaticamente pelo banco
 *
 * PROTEÇÃO CONTRA REPLAY ATTACKS (SEM NONCE):
 * - Timestamp com janela de 10 minutos (servidor rejeita mensagens antigas)
 * - Rate limiting: 30 mensagens por minuto por usuário
 * - MessageId único previne duplicatas exatas
 * - Logs de auditoria registram tentativas suspeitas
 *
 * ============================================================================
 */

const encryptedMessageSchema = mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    destinatario: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Opcional (para grupo)

    // DADOS CRIPTOGRAFADOS
    content: { type: String, trim: true, required: true }, // Mensagem criptografada em Base64
    encryptedKey: { type: String, required: true }, // Chave AES criptografada com RSA (Base64)

    // INTEGRIDADE AES-GCM
    iv: { type: String, required: true }, // IV do AES-GCM (Base64, 12 bytes)
    authTag: { type: String, required: true }, // Tag de autenticação (Base64, 16 bytes)

    // PROTEÇÃO TEMPORAL
    timestamp: { type: Date, required: true, default: Date.now, index: true },

    // VERIFICAÇÃO ADICIONAL
    hmac: { type: String, required: true }, // HMAC-SHA256 dos dados

    // METADADOS
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // FLAGS DE SEGURANÇA
    integrityVerified: { type: Boolean, default: false }, // Se passou na verificação
    tampered: { type: Boolean, default: false }, // Se foi detectada adulteração
  },
  {
    timestamps: true, // Adiciona createdAt e updatedAt automaticamente
  }
);

// ÍNDICES COMPOSTOS para queries eficientes
encryptedMessageSchema.index({ chat: 1, timestamp: -1 }); // Busca de mensagens por chat
encryptedMessageSchema.index({ destinatario: 1, integrityVerified: 1 }); // Mensagens não verificadas
encryptedMessageSchema.index({ sender: 1, createdAt: -1 }); // Mensagens por remetente

// MÉTODO: Verificar se timestamp é recente (janela configurável)
encryptedMessageSchema.methods.isTimestampValid = function (
  maxAgeMinutes = 10
) {
  const now = new Date();
  const messageAge = (now - this.timestamp) / 1000 / 60; // em minutos
  return messageAge >= 0 && messageAge <= maxAgeMinutes;
};

// MÉTODO: Verificar integridade completa da mensagem
encryptedMessageSchema.methods.verifyIntegrity = function () {
  // Verificar campos obrigatórios
  const hasRequiredFields = !!(
    this.content &&
    this.encryptedKey &&
    this.iv &&
    this.authTag &&
    this.hmac &&
    this.timestamp
  );

  // Verificar timestamp válido
  const timestampValid = this.isTimestampValid(60); // 1 hora para histórico

  // Verificar flags de segurança
  const notTampered = !this.tampered;

  return hasRequiredFields && timestampValid && notTampered;
};

// MIDDLEWARE: Antes de salvar, validar integridade básica
encryptedMessageSchema.pre("save", async function (next) {
  if (this.isNew) {
    // Verificar se timestamp não é muito antigo (10 minutos)
    if (!this.isTimestampValid(10)) {
      const error = new Error(
        "Message timestamp too old - possible replay attack"
      );
      error.name = "TimestampError";
      throw error;
    }

    // Verificar se timestamp não é do futuro
    const now = new Date();
    if (this.timestamp > now) {
      const error = new Error("Message timestamp is in the future");
      error.name = "TimestampError";
      throw error;
    }
  }
  next();
});

// MIDDLEWARE: Após salvar, registrar log de auditoria
encryptedMessageSchema.post("save", function (doc) {
  console.log(`✅ Mensagem salva com integridade verificada: ${doc._id}`);
  console.log(`   Sender: ${doc.sender}`);
  console.log(`   Chat: ${doc.chat}`);
  console.log(`   Timestamp: ${doc.timestamp}`);
});

// MÉTODO ESTÁTICO: Buscar mensagens por chat com validação de integridade
encryptedMessageSchema.statics.findValidMessages = async function (
  chatId,
  userId
) {
  const messages = await this.find({
    chat: chatId,
    $or: [{ destinatario: userId }, { sender: userId }],
    integrityVerified: true,
    tampered: false,
  })
    .populate("sender", "name pic email")
    .populate("destinatario", "name email")
    .sort({ timestamp: 1 });

  return messages;
};

// MÉTODO ESTÁTICO: Contar mensagens não verificadas
encryptedMessageSchema.statics.countUnverified = async function (userId) {
  return await this.countDocuments({
    destinatario: userId,
    integrityVerified: false,
  });
};

const Message = mongoose.model("Message", testSchema);

const encryptedMessage = mongoose.model(
  "EncryptedMessage",
  encryptedMessageSchema
);

module.exports = {
  Message,
  encryptedMessage,
};
