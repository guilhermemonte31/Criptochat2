const mongoose = require("mongoose");
const { hmac } = require("node-forge");

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
 * ESQUEMA DE MENSAGEM COM INTEGRIDADE
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
 * 3. NONCE (Number used ONCE):
 *    - Contador incremental por usuário
 *    - Previne replay attacks (reenvio de mensagens antigas)
 *    - Cada mensagem tem um nonce único e sequencial
 *
 * 4. TIMESTAMP:
 *    - Momento exato do envio
 *    - Detecta mensagens muito antigas (possível replay)
 *    - Permite ordenação temporal
 *
 * 5. HMAC (Hash-based Message Authentication Code):
 *    - Segunda camada de verificação
 *    - Hash de: content + timestamp + nonce + sender
 *    - Garante integridade mesmo se AES-GCM for comprometido
 *
 * 6. IV (Initialization Vector):
 *    - Valor aleatório único para cada mensagem
 *    - Garante que mensagens idênticas tenham cifras diferentes
 *    - Essencial para segurança do AES-GCM
 *
 * ============================================================================
 */

const encryptedMessageSchema = mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    destinatario: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Opcional

    // DADOS CRIPTOGRAFADOS
    content: { type: String, trim: true, required: true }, // Mensagem criptografada em Base64
    encryptedKey: { type: String, required: true }, // Chave AES criptografada com RSA (Base64)

    // INTEGRIDADE AES-GCM
    iv: { type: String, required: true }, // IV do AES-GCM (Base64, 12 bytes)
    authTag: { type: String, required: true }, // Tag de autenticação (Base64, 16 bytes)

    // PROTEÇÃO CONTRA REPLAY
    nonce: { type: Number, required: true, index: true }, // Contador sequencial
    timestamp: { type: Date, required: true, default: Date.now, index: true },
    
    // VERIFICAÇÃO ADICIONAL
    hmac: { type: String, required: true }, // HMAC-SHA256 dos dados
    
    // METADADOS
    chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    
    // FLAGS DE SEGURANÇA
    integrityVerified: { type: Boolean, default: false }, // Se passou na verificação
    tampered: { type: Boolean, default: false }, // Se foi detectada adulteração
  },
  {
    timestamps: true,
    // Índices compostos para queries eficientes
    indexes: [
      { sender: 1, nonce: 1 }, // Verificação de nonce por sender
      { chat: 1, timestamp: -1 }, // Busca de mensagens por chat
      { destinatario: 1, integrityVerified: 1 } // Mensagens não verificadas
    ]
  }
);

// Índice único para prevenir nonces duplicados por usuário
encryptedMessageSchema.index({ sender: 1, nonce: 1 }, { unique: true })

// MÉTODO: Verificar se o nonce é válido (não é replay)

encryptedMessageSchema.statics.isValidNonce = async function (senderId, nonce) {
  const lastMessage = await this.findOne({ sender: senderId }).sort({ nonce: -1 }).select('nonce')
  
  // Primeira mensagem do usuário
  if (!lastMessage) return true
  
  // Nonce deve ser maior que o último
  return nonce > lastMessage.nonce
}

// MÉTODO: Verificar se timestamp é recente (janela de 5 minutos)

encryptedMessageSchema.methods.isTimestampValid = function (maxAgeMinutes = 5) {
  const now = new Date()
  const messageAge = (now - this.timestamp) / 1000 / 60 // em minutos
  return messageAge <= maxAgeMinutes
}

// MIDLDLEWARE: Antes de salvar, validar integridade básica

encryptedMessageSchema.pre('save', async function (next) {
  if (this.isNew) {
    // Verificar se nonce é válido
    const isValid = await this.constructor.isValidNonce(this.sender, this.none)
    if (!isValid) {
      throw new Error('Invalid nonce - possible raplay attack detected')
    }

    // Verificar se timestamp não é muito antigo
    if (!this.isTimestampValid()) {
      throw new Error('Message timestamp too old - possible replay attack')
    }
  }
  next()
})

const Message = mongoose.model("Message", testSchema);

const encryptedMessage = mongoose.model(
  "EncryptedMessage",
  encryptedMessageSchema
);

module.exports = {
  Message,
  encryptedMessage,
};
