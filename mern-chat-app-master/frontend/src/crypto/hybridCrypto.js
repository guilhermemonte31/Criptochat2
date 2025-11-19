/**
 * ============================================================================
 * SISTEMA DE CRIPTOGRAFIA HÍBRIDA E2EE - FRONTEND (Web Crypto API)
 * ============================================================================
 *
 * Implementação client-side compatível com o backend
 * Usa Web Crypto API nativa do navegador para máxima performance e segurança
 */

/**
 * Converte ArrayBuffer para string Base64
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converte string Base64 para ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Serializa metadados para AAD (igual ao backend)
 */
function serializeMetadata(metadata) {
  const json = JSON.stringify({
    senderId: metadata.senderId,
    recipientId: metadata.recipientId,
    chatId: metadata.chatId,
    timestamp: metadata.timestamp,
    sequence: metadata.sequence,
  });
  return new TextEncoder().encode(json);
}

/**
 * ============================================================================
 * GERAÇÃO DE CHAVES E VALORES ALEATÓRIOS
 * ============================================================================
 */

/**
 * Gera uma session key AES-256 aleatória
 * @returns {Promise<CryptoKey>} Chave AES-GCM
 */
async function generateSessionKey() {
  return await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true, // extractable
    ["encrypt", "decrypt"]
  );
}

/**
 * Gera um IV aleatório de 12 bytes (recomendado para GCM)
 * @returns {Uint8Array} IV de 12 bytes
 */
function generateIV() {
  return crypto.getRandomValues(new Uint8Array(12));
}

/**
 * ============================================================================
 * CRIPTOGRAFIA AES-GCM COM AAD
 * ============================================================================
 */

/**
 * Cifra mensagem com AES-256-GCM incluindo metadados autenticados
 * @param {string} plaintext - Mensagem em texto plano
 * @param {CryptoKey} sessionKey - Chave AES-GCM
 * @param {Uint8Array} iv - Initialization Vector
 * @param {Object} metadata - Metadados a autenticar
 * @returns {Promise<Object>} Ciphertext e authTag em base64
 */
async function encryptWithAESGCM(plaintext, sessionKey, iv, metadata) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Serializa metadados para AAD
  const aad = serializeMetadata(metadata);

  // Cifra com AES-GCM (AAD incluído automaticamente)
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
      additionalData: aad,
      tagLength: 128, // 16 bytes de tag de autenticação
    },
    sessionKey,
    data
  );

  // GCM retorna ciphertext + tag concatenados
  // Separamos os últimos 16 bytes (tag) do resto (ciphertext)
  const encryptedArray = new Uint8Array(encrypted);
  const ciphertext = encryptedArray.slice(0, -16);
  const authTag = encryptedArray.slice(-16);

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    authTag: arrayBufferToBase64(authTag),
  };
}

/**
 * Decifra mensagem com AES-256-GCM validando integridade
 * @param {string} ciphertextB64 - Ciphertext em base64
 * @param {string} authTagB64 - Tag de autenticação em base64
 * @param {CryptoKey} sessionKey - Chave AES-GCM
 * @param {Uint8Array} iv - Initialization Vector
 * @param {Object} metadata - Metadados que devem corresponder
 * @returns {Promise<string>} Texto plano decifrado
 * @throws {Error} Se autenticação falhar
 */
async function decryptWithAESGCM(
  ciphertextB64,
  authTagB64,
  sessionKey,
  iv,
  metadata
) {
  try {
    // Reconstrói o formato esperado pelo Web Crypto (ciphertext + tag)
    const ciphertext = new Uint8Array(base64ToArrayBuffer(ciphertextB64));
    const authTag = new Uint8Array(base64ToArrayBuffer(authTagB64));

    // Concatena ciphertext + tag (formato Web Crypto API)
    const combined = new Uint8Array(ciphertext.length + authTag.length);
    combined.set(ciphertext);
    combined.set(authTag, ciphertext.length);

    // Serializa metadados para AAD
    const aad = serializeMetadata(metadata);

    // Decifra e valida
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        additionalData: aad,
        tagLength: 128,
      },
      sessionKey,
      combined
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error("❌ AES-GCM decryption failed:", error);
    throw new Error(
      "INTEGRITY_VIOLATION: Message authentication failed. Data may have been tampered with."
    );
  }
}

/**
 * ============================================================================
 * TESTE DE COMPATIBILIDADE (Debugging)
 * ============================================================================
 */

/**
 * Testa se um par de chaves público/privado é compatível
 * @param {CryptoKey} publicKey - Chave pública RSA
 * @param {CryptoKey} privateKey - Chave privada RSA
 * @returns {Promise<boolean>} true se compatível
 */
export async function testKeyPairCompatibility(publicKey, privateKey) {
  try {
    console.log("🧪 Testando compatibilidade de par de chaves RSA...");

    // Cifra um teste com a chave pública
    const testData = new TextEncoder().encode("test");
    const testEncrypted = await crypto.subtle.encrypt(
      {
        name: "RSA-OAEP",
      },
      publicKey,
      testData
    );

    console.log("   ✅ Criptografia com chave pública bem-sucedida");

    // Tenta descriptografar com a chave privada
    const testDecrypted = await crypto.subtle.decrypt(
      {
        name: "RSA-OAEP",
      },
      privateKey,
      testEncrypted
    );

    console.log("   ✅ Descriptografia com chave privada bem-sucedida");

    // Valida que o resultado é o original
    const decryptedText = new TextDecoder().decode(testDecrypted);
    if (decryptedText !== "test") {
      throw new Error("Decrypted data does not match original");
    }

    console.log("   ✅ Dados descriptografados correspondem ao original");
    console.log("🎉 Par de chaves é COMPATÍVEL");
    return true;
  } catch (error) {
    console.error("❌ Erro na validação do par de chaves:", error);
    console.error("   ⚠️  Par de chaves INCOMPATÍVEL");
    return false;
  }
}

/**
 * ============================================================================
 * IMPORTAÇÃO DE CHAVES COM VALIDAÇÃO
 * ============================================================================
 */
async function importPublicKeyRSA(publicKeyPem) {
  // Remove headers e quebras de linha
  const pemBody = publicKeyPem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\n/g, "");

  const binaryDer = base64ToArrayBuffer(pemBody);

  return await crypto.subtle.importKey(
    "spki",
    binaryDer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
}

/**
 * Importa chave privada RSA do formato JWK (armazenado em sessionStorage)
 * @param {Object} privateKeyJwk - Chave privada em formato JWK
 * @returns {Promise<CryptoKey>} Chave privada RSA
 */
async function importPrivateKeyRSA(privateKeyJwk) {
  try {
    console.log("🔑 Importando chave privada JWK...");

    // Garante que a chave está no formato JWK correto
    if (typeof privateKeyJwk === "string") {
      privateKeyJwk = JSON.parse(privateKeyJwk);
    }

    // Valida componentes essenciais da chave RSA privada
    if (!privateKeyJwk.d || !privateKeyJwk.n) {
      throw new Error("Invalid JWK: Missing private key components (d or n)");
    }

    const key = await crypto.subtle.importKey(
      "jwk",
      privateKeyJwk,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      true,
      ["decrypt"]
    );

    console.log("✅ Chave privada RSA importada com sucesso");
    return key;
  } catch (error) {
    console.error("❌ Erro ao importar chave privada:", error);
    throw new Error(`Failed to import private key: ${error.message}`);
  }
}

/**
 * Cifra session key com RSA-OAEP
 * @param {CryptoKey} sessionKey - Chave AES a cifrar
 * @param {CryptoKey} publicKey - Chave pública RSA
 * @returns {Promise<string>} Session key cifrada em base64
 */
async function encryptSessionKeyRSA(sessionKey, publicKey) {
  // Exporta a session key como raw bytes
  const rawKey = await crypto.subtle.exportKey("raw", sessionKey);

  // Cifra com RSA-OAEP
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    rawKey
  );

  return arrayBufferToBase64(encrypted);
}

/**
 * Decifra session key com RSA-OAEP
 * @param {string} encryptedKeyB64 - Session key cifrada em base64
 * @param {CryptoKey} privateKey - Chave privada RSA
 * @returns {Promise<CryptoKey>} Session key AES decifrada
 */
async function decryptSessionKeyRSA(encryptedKeyB64, privateKey) {
  try {
    console.log("🔓 Descriptografando session key com RSA...");
    console.log("📊 Chave privada type:", privateKey.type);
    console.log("📊 Encrypted key length:", encryptedKeyB64.length);

    const encryptedKey = base64ToArrayBuffer(encryptedKeyB64);
    console.log(
      "🔄 Encrypted key buffer size:",
      encryptedKey.byteLength,
      "bytes"
    );

    // Decifra com RSA-OAEP (DEVE usar o mesmo hash que na cifra)
    console.log("🔓 Iniciando decrypt com RSA-OAEP...");
    const rawKey = await crypto.subtle.decrypt(
      {
        name: "RSA-OAEP",
        // IMPORTANTE: Deve usar o mesmo hash que foi usado na criptografia
      },
      privateKey,
      encryptedKey
    );

    console.log("✅ Session key descriptografada");
    console.log("📊 Raw key size:", rawKey.byteLength, "bytes");

    // Importa de volta como chave AES
    return await crypto.subtle.importKey(
      "raw",
      rawKey,
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    console.error("❌ Erro ao descriptografar session key:", error);
    console.error("   Erro completo:", error.message);
    console.error("   Stack:", error.stack);
    throw new Error(`Failed to decrypt session key: ${error.message}`);
  }
}
/**
 * ============================================================================
 * FUNÇÕES PRINCIPAIS DE ENVELOPE HÍBRIDO
 * ============================================================================
 */

/**
 * Cifra mensagem completa usando envelope híbrido
 * @param {string} message - Mensagem em texto plano
 * @param {string} publicKeyPem - Chave pública RSA do destinatário (PEM)
 * @param {Object} metadata - Metadados da mensagem
 * @returns {Promise<Object>} Envelope completo
 */
export async function hybridEncrypt(message, publicKeyPem, metadata) {
  console.log("🔐 Iniciando criptografia híbrida...");

  try {
    // 1. Gerar session key e IV
    const sessionKey = await generateSessionKey();
    const iv = generateIV();

    // 2. Adicionar timestamp e garantir metadados completos
    const fullMetadata = {
      senderId: metadata.senderId,
      recipientId: metadata.recipientId,
      chatId: metadata.chatId,
      timestamp: metadata.timestamp || Date.now(),
      sequence: metadata.sequence || 0,
    };

    console.log("📋 Metadados protegidos:", fullMetadata);

    // 3. Cifrar mensagem com AES-GCM
    const { ciphertext, authTag } = await encryptWithAESGCM(
      message,
      sessionKey,
      iv,
      fullMetadata
    );

    // 4. Importar chave pública RSA
    const publicKey = await importPublicKeyRSA(publicKeyPem);

    // 5. Cifrar session key com RSA
    const encryptedKey = await encryptSessionKeyRSA(sessionKey, publicKey);

    const envelope = {
      encryptedKey,
      ciphertext,
      iv: arrayBufferToBase64(iv),
      authTag,
      metadata: fullMetadata,
    };

    console.log("✅ Criptografia híbrida completa");
    console.log(
      "📦 Tamanho do envelope:",
      JSON.stringify(envelope).length,
      "bytes"
    );

    return envelope;
  } catch (error) {
    console.error("❌ Erro na criptografia híbrida:", error);
    throw error;
  }
}

/**
 * Decifra mensagem do envelope híbrido
 * @param {Object} envelope - Envelope com todos os componentes
 * @param {Object} privateKeyJwk - Chave privada RSA em formato JWK
 * @returns {Promise<string>} Mensagem em texto plano
 * @throws {Error} Se autenticação falhar
 */
export async function hybridDecrypt(envelope, privateKeyJwk) {
  console.log("🔓 Iniciando descriptografia híbrida...");

  try {
    // 1. Importar chave privada RSA
    console.log("📝 Importando chave privada...");
    const privateKey = await importPrivateKeyRSA(privateKeyJwk);
    console.log("✅ Chave privada importada");

    // 2. Decifrar session key
    console.log("🔑 Descriptografando session key...");
    const sessionKey = await decryptSessionKeyRSA(
      envelope.encryptedKey,
      privateKey
    );
    console.log("✅ Session key descriptografada");

    // 3. Preparar IV
    const iv = new Uint8Array(base64ToArrayBuffer(envelope.iv));

    // 4. Decifrar e validar mensagem
    console.log("💬 Descriptografando mensagem...");
    const plaintext = await decryptWithAESGCM(
      envelope.ciphertext,
      envelope.authTag,
      sessionKey,
      iv,
      envelope.metadata
    );

    console.log("✅ Descriptografia híbrida completa");
    console.log("📋 Metadados validados:", envelope.metadata);

    return plaintext;
  } catch (error) {
    console.error("❌ Erro na descriptografia híbrida:", error);
    console.error("   Mensagem:", error.message);
    console.error("   Stack:", error.stack);

    // Tenta identificar o ponto de falha
    if (error.message.includes("Failed to import")) {
      console.error("   💡 Dica: Problema ao importar chave privada JWK");
    } else if (error.message.includes("Failed to decrypt session key")) {
      console.error(
        "   💡 Dica: Problema ao descriptografar session key com RSA"
      );
      console.error("      Possíveis causas:");
      console.error(
        "      1. JWK não corresponde à chave pública usada na criptografia"
      );
      console.error("      2. Session key foi corrompida");
      console.error("      3. Versão do envelope não é compatível");
    } else if (error.message.includes("INTEGRITY_VIOLATION")) {
      console.error("   💡 Dica: Mensagem foi alterada ou corrompida");
    }

    throw error;
  }
}

/**
 * ============================================================================
 * VALIDAÇÃO DE SEGURANÇA
 * ============================================================================
 */

/**
 * Valida número de sequência (proteção contra replay/reorder)
 * @param {number} receivedSeq - Sequência recebida
 * @param {number} expectedSeq - Sequência esperada
 * @param {number} window - Janela de tolerância
 * @returns {boolean} true se válido
 */
export function validateSequence(receivedSeq, expectedSeq, window = 10) {
  if (receivedSeq < expectedSeq - window) {
    throw new Error("REPLAY_ATTACK: Message sequence too old");
  }

  if (receivedSeq > expectedSeq + window) {
    throw new Error("INVALID_SEQUENCE: Message sequence too far ahead");
  }

  return true;
}

/**
 * Valida timestamp da mensagem
 * @param {number} messageTimestamp - Timestamp da mensagem
 * @param {number} maxAge - Idade máxima em ms (default: 5 min)
 * @returns {boolean} true se válido
 */
export function validateTimestamp(messageTimestamp, maxAge = 5 * 60 * 1000) {
  const now = Date.now();
  const age = now - messageTimestamp;

  if (age > maxAge) {
    throw new Error("MESSAGE_EXPIRED: Message is too old");
  }

  if (age < -2 * 60 * 1000) {
    throw new Error("INVALID_TIMESTAMP: Message timestamp in future");
  }

  return true;
}

/**
 * Valida envelope completo antes de processar
 * @param {Object} envelope - Envelope a validar
 * @param {string} currentUserId - ID do usuário atual
 * @param {number} expectedSeq - Sequência esperada
 * @returns {boolean} true se válido
 */
export function validateEnvelope(envelope, currentUserId, expectedSeq = null) {
  // Valida estrutura básica
  if (
    !envelope.encryptedKey ||
    !envelope.ciphertext ||
    !envelope.iv ||
    !envelope.authTag
  ) {
    throw new Error("INVALID_ENVELOPE: Missing required fields");
  }

  if (!envelope.metadata) {
    throw new Error("INVALID_ENVELOPE: Missing metadata");
  }

  // Valida metadados
  const meta = envelope.metadata;
  if (!meta.senderId || !meta.recipientId || !meta.chatId) {
    throw new Error("INVALID_METADATA: Missing required fields");
  }

  // Valida que a mensagem é para o usuário atual
  if (meta.recipientId !== currentUserId) {
    throw new Error("INVALID_RECIPIENT: Message not for current user");
  }

  // Valida timestamp
  validateTimestamp(meta.timestamp);

  // Valida sequência se fornecida
  if (expectedSeq !== null && meta.sequence !== undefined) {
    validateSequence(meta.sequence, expectedSeq);
  }

  return true;
}

/**
 * ============================================================================
 * UTILITÁRIOS
 * ============================================================================
 */

/**
 * Serializa envelope para armazenamento/transmissão
 * @param {Object} envelope - Envelope a serializar
 * @returns {string} JSON string
 */
export function serializeEnvelope(envelope) {
  return JSON.stringify(envelope);
}

/**
 * Deserializa envelope de string JSON
 * @param {string} envelopeJson - Envelope serializado
 * @returns {Object} Envelope
 */
export function deserializeEnvelope(envelopeJson) {
  try {
    return JSON.parse(envelopeJson);
  } catch (error) {
    throw new Error("INVALID_ENVELOPE: Failed to parse JSON");
  }
}

// Exporta funções auxiliares também
export {
  generateSessionKey,
  generateIV,
  serializeMetadata,
  encryptWithAESGCM,
  decryptWithAESGCM,
  importPublicKeyRSA,
  importPrivateKeyRSA,
};
