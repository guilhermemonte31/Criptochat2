/**
 * ============================================================================
 * SISTEMA DE CRIPTOGRAFIA HÍBRIDA E2EE COM INTEGRIDADE
 * ============================================================================
 *
 * Arquitetura:
 * - AES-256-GCM para cifrar dados (confidencialidade + integridade)
 * - RSA-OAEP para cifrar chaves AES (envelope híbrido)
 * - AAD (Additional Authenticated Data) para proteger metadados
 * - Sequence numbers para prevenir replay/reorder attacks
 *
 * Estrutura da Mensagem Cifrada:
 * {
 *   encryptedKey: string (base64),      // Session key cifrada com RSA
 *   ciphertext: string (base64),        // Dados cifrados com AES-GCM
 *   iv: string (base64),                // Initialization Vector
 *   authTag: string (base64),           // Tag de autenticação do GCM
 *   metadata: {                         // Metadados protegidos no AAD
 *     senderId: string,
 *     recipientId: string,
 *     chatId: string,
 *     timestamp: number,
 *     sequence: number
 *   }
 * }
 */

const crypto = require("crypto");

/**
 * Gera uma chave AES-256 aleatória (session key)
 * @returns {Buffer} Chave AES de 32 bytes
 */
function generateSessionKey() {
  return crypto.randomBytes(32); // 256 bits
}

/**
 * Gera um IV (Initialization Vector) aleatório para AES-GCM
 * @returns {Buffer} IV de 12 bytes (recomendado para GCM)
 */
function generateIV() {
  return crypto.randomBytes(12);
}

/**
 * Serializa metadados para usar como AAD
 * @param {Object} metadata - Objeto com metadados da mensagem
 * @returns {Buffer} Buffer com metadados serializados
 */
function serializeMetadata(metadata) {
  const json = JSON.stringify({
    senderId: metadata.senderId,
    recipientId: metadata.recipientId,
    chatId: metadata.chatId,
    timestamp: metadata.timestamp,
    sequence: metadata.sequence,
  });
  return Buffer.from(json, "utf8");
}

/**
 * Cifra uma mensagem usando AES-256-GCM com metadados autenticados
 * @param {string} plaintext - Texto plano da mensagem
 * @param {Buffer} sessionKey - Chave AES de 32 bytes
 * @param {Buffer} iv - Initialization Vector de 12 bytes
 * @param {Object} metadata - Metadados a serem autenticados
 * @returns {Object} Objeto com ciphertext e authTag
 */
function encryptWithAESGCM(plaintext, sessionKey, iv, metadata) {
  const cipher = crypto.createCipheriv("aes-256-gcm", sessionKey, iv);

  // Adiciona metadados como AAD (Additional Authenticated Data)
  const aad = serializeMetadata(metadata);
  cipher.setAAD(aad);

  // Cifra o conteúdo
  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  // Obtém a tag de autenticação
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decifra uma mensagem usando AES-256-GCM e valida integridade
 * @param {string} ciphertext - Texto cifrado em base64
 * @param {string} authTag - Tag de autenticação em base64
 * @param {Buffer} sessionKey - Chave AES de 32 bytes
 * @param {Buffer} iv - Initialization Vector
 * @param {Object} metadata - Metadados que devem corresponder ao AAD
 * @returns {string} Texto plano decifrado
 * @throws {Error} Se a autenticação falhar (dados adulterados)
 */
function decryptWithAESGCM(ciphertext, authTag, sessionKey, iv, metadata) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", sessionKey, iv);

  // Define o AAD que deve corresponder ao usado na cifra
  const aad = serializeMetadata(metadata);
  decipher.setAAD(aad);

  // Define a tag de autenticação
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  try {
    // Decifra o conteúdo (vai falhar se AAD ou dados foram alterados)
    let decrypted = decipher.update(Buffer.from(ciphertext, "base64"));
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
  } catch (error) {
    throw new Error(
      "INTEGRITY_VIOLATION: Message authentication failed. Data may have been tampered with."
    );
  }
}

/**
 * Cifra a session key usando RSA-OAEP (chave pública do destinatário)
 * Esta função é para uso no backend Node.js
 * @param {Buffer} sessionKey - Chave AES a ser cifrada
 * @param {string} publicKeyPem - Chave pública RSA em formato PEM
 * @returns {string} Session key cifrada em base64
 */
function encryptSessionKeyRSA(sessionKey, publicKeyPem) {
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    sessionKey
  );

  return encrypted.toString("base64");
}

/**
 * Decifra a session key usando RSA-OAEP (chave privada)
 * Esta função é para uso no backend Node.js
 * @param {string} encryptedKey - Session key cifrada em base64
 * @param {string} privateKeyPem - Chave privada RSA em formato PEM
 * @returns {Buffer} Session key decifrada
 */
function decryptSessionKeyRSA(encryptedKey, privateKeyPem) {
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(encryptedKey, "base64")
  );

  return decrypted;
}

/**
 * ============================================================================
 * FUNÇÕES PRINCIPAIS DE ENVELOPE HÍBRIDO
 * ============================================================================
 */

/**
 * Cifra uma mensagem completa usando envelope híbrido
 * @param {string} message - Mensagem em texto plano
 * @param {string} publicKeyPem - Chave pública RSA do destinatário
 * @param {Object} metadata - Metadados da mensagem
 * @returns {Object} Envelope completo com todos os componentes
 */
function hybridEncrypt(message, publicKeyPem, metadata) {
  // 1. Gerar session key e IV aleatórios
  const sessionKey = generateSessionKey();
  const iv = generateIV();

  // 2. Adicionar timestamp atual aos metadados se não existir
  const fullMetadata = {
    ...metadata,
    timestamp: metadata.timestamp || Date.now(),
  };

  // 3. Cifrar mensagem com AES-GCM
  const { ciphertext, authTag } = encryptWithAESGCM(
    message,
    sessionKey,
    iv,
    fullMetadata
  );

  // 4. Cifrar session key com RSA
  const encryptedKey = encryptSessionKeyRSA(sessionKey, publicKeyPem);

  // 5. Retornar envelope completo
  return {
    encryptedKey,
    ciphertext,
    iv: iv.toString("base64"),
    authTag,
    metadata: fullMetadata,
  };
}

/**
 * Decifra uma mensagem do envelope híbrido
 * @param {Object} envelope - Envelope com todos os componentes
 * @param {string} privateKeyPem - Chave privada RSA
 * @returns {string} Mensagem em texto plano
 * @throws {Error} Se a autenticação falhar
 */
function hybridDecrypt(envelope, privateKeyPem) {
  // 1. Decifrar session key com RSA
  const sessionKey = decryptSessionKeyRSA(envelope.encryptedKey, privateKeyPem);

  // 2. Preparar IV
  const iv = Buffer.from(envelope.iv, "base64");

  // 3. Decifrar e validar com AES-GCM
  const plaintext = decryptWithAESGCM(
    envelope.ciphertext,
    envelope.authTag,
    sessionKey,
    iv,
    envelope.metadata
  );

  return plaintext;
}

/**
 * ============================================================================
 * VALIDAÇÃO DE SEQUÊNCIA (Proteção contra Replay/Reorder)
 * ============================================================================
 */

/**
 * Valida o número de sequência da mensagem
 * @param {number} receivedSeq - Número de sequência recebido
 * @param {number} expectedSeq - Número de sequência esperado
 * @param {number} window - Janela de tolerância (default: 10)
 * @returns {boolean} true se válido
 * @throws {Error} Se detectar replay ou reordenação suspeita
 */
function validateSequence(receivedSeq, expectedSeq, window = 10) {
  // Rejeita mensagens duplicadas ou muito antigas
  if (receivedSeq < expectedSeq - window) {
    throw new Error("REPLAY_ATTACK: Message sequence number too old");
  }

  // Rejeita mensagens com números de sequência muito futuros
  if (receivedSeq > expectedSeq + window) {
    throw new Error(
      "INVALID_SEQUENCE: Message sequence number too far in the future"
    );
  }

  return true;
}

/**
 * Valida timestamp da mensagem
 * @param {number} messageTimestamp - Timestamp da mensagem
 * @param {number} maxAge - Idade máxima em ms (default: 5 minutos)
 * @returns {boolean} true se válido
 * @throws {Error} Se mensagem muito antiga ou futura
 */
function validateTimestamp(messageTimestamp, maxAge = 5 * 60 * 1000) {
  const now = Date.now();
  const age = now - messageTimestamp;

  // Rejeita mensagens muito antigas
  if (age > maxAge) {
    throw new Error("MESSAGE_EXPIRED: Message is too old");
  }

  // Rejeita mensagens com timestamp futuro (clock skew máximo de 2 minutos)
  if (age < -2 * 60 * 1000) {
    throw new Error("INVALID_TIMESTAMP: Message timestamp is in the future");
  }

  return true;
}

module.exports = {
  // Funções auxiliares
  generateSessionKey,
  generateIV,
  serializeMetadata,

  // Funções de cifra/decifra
  encryptWithAESGCM,
  decryptWithAESGCM,
  encryptSessionKeyRSA,
  decryptSessionKeyRSA,

  // Funções principais
  hybridEncrypt,
  hybridDecrypt,

  // Validação
  validateSequence,
  validateTimestamp,
};
