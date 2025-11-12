/*
 * ============================================================================
 * MESSAGE SEQUENCE MODEL
 * ============================================================================
 * Gerencia números de sequência para cada par (chat, usuário) para prevenir
 * ataques de replay e reordenação de mensagens
 */

const mongoose = require("mongoose");

const messageSequenceSchema = mongoose.Schema(
  {
    // Chat ao qual pertence a sequência
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },

    // Usuário que envia as mensagens (remetente)
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Último número de sequência usado por este sender neste chat
    lastSequence: {
      type: Number,
      required: true,
      default: 0,
    },

    // Janela de sequências válidas recebidas (para detecção de duplicatas)
    // Array de números de sequência já processados nos últimos N mensagens
    receivedWindow: {
      type: [Number],
      default: [],
      // Mantém apenas as últimas 50 sequências para economizar espaço
      validate: {
        validator: function (arr) {
          return arr.length <= 50;
        },
        message: "Received window cannot exceed 50 entries",
      },
    },

    // Timestamp da última atualização
    lastUpdate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    // Índice composto para garantir unicidade e performance
    indexes: [
      {
        fields: { chat: 1, sender: 1 },
        unique: true,
      },
    ],
  }
);

/**
 * Métodos de instância
 */

/**
 * Obtém o próximo número de sequência e atualiza o registro
 * @returns {Promise<number>} Próximo número de sequência
 */
messageSequenceSchema.methods.getNextSequence = async function () {
  this.lastSequence += 1;
  this.lastUpdate = new Date();
  await this.save();
  return this.lastSequence;
};

/**
 * Valida se um número de sequência é válido (não é duplicado)
 * @param {number} sequence - Número de sequência a validar
 * @param {number} window - Tamanho da janela de tolerância
 * @returns {boolean} true se válido, false se duplicado
 */
messageSequenceSchema.methods.validateSequence = function (
  sequence,
  window = 10
) {
  // Verifica se a sequência já foi processada
  if (this.receivedWindow.includes(sequence)) {
    return false; // Duplicada
  }

  // Verifica se está muito atrás
  if (sequence < this.lastSequence - window) {
    return false; // Muito antiga
  }

  // Verifica se está muito à frente
  if (sequence > this.lastSequence + window) {
    return false; // Muito futura
  }

  return true;
};

/**
 * Marca uma sequência como recebida/processada
 * @param {number} sequence - Número de sequência processado
 * @returns {Promise<void>}
 */
messageSequenceSchema.methods.markAsReceived = async function (sequence) {
  // Adiciona à janela de recebidos
  this.receivedWindow.push(sequence);

  // Mantém apenas as últimas 50 entradas
  if (this.receivedWindow.length > 50) {
    this.receivedWindow = this.receivedWindow.slice(-50);
  }

  // Atualiza lastSequence se necessário
  if (sequence > this.lastSequence) {
    this.lastSequence = sequence;
  }

  this.lastUpdate = new Date();
  await this.save();
};

/**
 * Métodos estáticos
 */

/**
 * Obtém ou cria um registro de sequência
 * @param {string} chatId - ID do chat
 * @param {string} senderId - ID do remetente
 * @returns {Promise<MessageSequence>} Registro de sequência
 */
messageSequenceSchema.statics.getOrCreate = async function (chatId, senderId) {
  let sequence = await this.findOne({
    chat: chatId,
    sender: senderId,
  });

  if (!sequence) {
    sequence = await this.create({
      chat: chatId,
      sender: senderId,
      lastSequence: 0,
      receivedWindow: [],
    });
  }

  return sequence;
};

/**
 * Valida e registra uma mensagem recebida
 * @param {string} chatId - ID do chat
 * @param {string} senderId - ID do remetente
 * @param {number} sequence - Número de sequência da mensagem
 * @param {number} window - Janela de tolerância
 * @returns {Promise<boolean>} true se válida e registrada
 * @throws {Error} Se a mensagem for inválida
 */
messageSequenceSchema.statics.validateAndRegister = async function (
  chatId,
  senderId,
  sequence,
  window = 10
) {
  const seqRecord = await this.getOrCreate(chatId, senderId);

  // Valida a sequência
  if (!seqRecord.validateSequence(sequence, window)) {
    if (seqRecord.receivedWindow.includes(sequence)) {
      throw new Error("REPLAY_ATTACK: Duplicate message sequence detected");
    } else if (sequence < seqRecord.lastSequence - window) {
      throw new Error("REPLAY_ATTACK: Message sequence too old");
    } else {
      throw new Error("INVALID_SEQUENCE: Message sequence out of valid range");
    }
  }

  // Marca como recebida
  await seqRecord.markAsReceived(sequence);

  return true;
};

/**
 * Limpa sequências antigas (manutenção)
 * @param {number} daysOld - Número de dias de inatividade para considerar antiga
 * @returns {Promise<number>} Número de registros removidos
 */
messageSequenceSchema.statics.cleanOldSequences = async function (
  daysOld = 30
) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await this.deleteMany({
    lastUpdate: { $lt: cutoffDate },
  });

  return result.deletedCount;
};

/**
 * Reseta sequências de um chat (útil para testes ou reset manual)
 * @param {string} chatId - ID do chat
 * @returns {Promise<number>} Número de sequências resetadas
 */
messageSequenceSchema.statics.resetChatSequences = async function (chatId) {
  const result = await this.deleteMany({ chat: chatId });
  return result.deletedCount;
};

/**
 * ============================================================================
 * ÍNDICES
 * ============================================================================
 * Otimizam queries frequentes e garantem unicidade
 */

// Índice único em (chat, sender) para garantir apenas um registro por par
messageSequenceSchema.index({ chat: 1, sender: 1 }, { unique: true });

// Índice em chat para queries de sequências por chat
messageSequenceSchema.index({ chat: 1 });

// Índice em sender para queries por remetente
messageSequenceSchema.index({ sender: 1 });

// Índice em lastUpdate para limpeza automática de registros antigos
messageSequenceSchema.index({ lastUpdate: 1 });

const MessageSequence = mongoose.model(
  "MessageSequence",
  messageSequenceSchema
);

module.exports = MessageSequence;
