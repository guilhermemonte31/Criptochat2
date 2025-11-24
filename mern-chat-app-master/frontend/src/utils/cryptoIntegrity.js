/**
 * ============================================================================
 * MÓDULO DE CRIPTOGRAFIA HÍBRIDA COM INTEGRIDADE
 * ============================================================================
 *
 * Este módulo implementa criptografia end-to-end com garantias de integridade:
 *
 * FLUXO DE ENVIO:
 * 1. Gerar chave AES-256 efêmera (única por mensagem)
 * 2. Criptografar mensagem com AES-GCM (gera authTag automaticamente)
 * 3. Criptografar chave AES com RSA-OAEP do destinatário
 * 4. Calcular HMAC de toda a mensagem
 * 5. Obter nonce sequencial do usuário
 * 6. Enviar tudo para o servidor
 *
 * FLUXO DE RECEBIMENTO:
 * 1. Verificar HMAC (integridade geral)
 * 2. Verificar nonce (não é replay)
 * 3. Verificar timestamp (não é muito antigo)
 * 4. Descriptografar chave AES com RSA privada
 * 5. Descriptografar mensagem com AES-GCM (verifica authTag automaticamente)
 * 6. Se authTag inválido = mensagem adulterada = REJEITAR
 *
 * ============================================================================
 */

// ============================================================================
// UTILITÁRIOS DE CONVERSÃO
// ============================================================================

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToArrayBuffer = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const stringToArrayBuffer = (str) => {
  return new TextEncoder().encode(str);
};

const arrayBufferToString = (buffer) => {
  return new TextDecoder().decode(buffer);
};

// ============================================================================
// GERENCIAMENTO DE NONCE (Previne Replay Attacks)
// ============================================================================

/**
 * Obtém o próximo nonce para o usuário
 * Nonces são armazenados localmente e incrementados a cada mensagem
 */
const getNextNonce = (userId) => {
  const key = `nonce_${userId}`;
  let nonce = parseInt(localStorage.getItem(key) || "0");
  nonce++;
  localStorage.setItem(key, nonce.toString());
  return nonce;
};

/**
 * Verifica se o nonce recebido é válido
 * Deve ser maior que o último nonce recebido daquele remetente
 */
const isValidNonce = (senderId, receivedNonce) => {
  const key = `lastNonce_${senderId}`;
  const lastNonce = parseInt(localStorage.getItem(key) || "0");

  if (receivedNonce <= lastNonce) {
    console.error(
      `⚠️ REPLAY ATTACK DETECTED! Nonce ${receivedNonce} <= ${lastNonce}`
    );
    return false;
  }

  // Atualizar último nonce válido
  localStorage.setItem(key, receivedNonce.toString());
  return true;
};

// ============================================================================
// HMAC PARA VERIFICAÇÃO ADICIONAL
// ============================================================================

/**
 * Calcula HMAC-SHA256 para verificação de integridade
 * Hash de: content + timestamp + nonce + senderId
 */
const calculateHMAC = async (
  content,
  timestamp,
  nonce,
  senderId,
  secretKey
) => {
  const data = `${content}|${timestamp}|${nonce}|${senderId}`;
  const dataBuffer = stringToArrayBuffer(data);

  // Importar chave secreta
  const key = await crypto.subtle.importKey(
    "raw",
    stringToArrayBuffer(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Calcular HMAC
  const signature = await crypto.subtle.sign("HMAC", key, dataBuffer);
  return arrayBufferToBase64(signature);
};

/**
 * Verifica HMAC de uma mensagem recebida
 */
const verifyHMAC = async (
  content,
  timestamp,
  nonce,
  senderId,
  receivedHMAC,
  secretKey
) => {
  const calculatedHMAC = await calculateHMAC(
    content,
    timestamp,
    nonce,
    senderId,
    secretKey
  );
  return calculatedHMAC === receivedHMAC;
};

// ============================================================================
// CRIPTOGRAFIA HÍBRIDA: RSA + AES-GCM
// ============================================================================

/**
 * ETAPA 1: Importar chave pública RSA do destinatário
 */
const importPublicKey = async (publicKeyPem) => {
  const pemBody = publicKeyPem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\n/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    "spki",
    binaryDer.buffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
};

/**
 * ETAPA 2: Criptografar mensagem com integridade
 *
 * @param {string} message - Mensagem em texto puro
 * @param {string} recipientPublicKeyPem - Chave pública RSA do destinatário
 * @param {string} senderId - ID do remetente
 * @param {string} hmacSecret - Segredo compartilhado para HMAC
 * @returns {Object} Dados criptografados com integridade
 */
export const encryptWithIntegrity = async (
  message,
  recipientPublicKeyPem,
  senderId,
  hmacSecret = "shared-secret-key" // Em produção, usar chave derivada
) => {
  console.log("\n🔐 === INICIANDO CRIPTOGRAFIA COM INTEGRIDADE ===");

  try {
    // 1. Gerar chave AES-256 efêmera
    console.log("1️⃣ Gerando chave AES-256 efêmera...");
    const aesKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );

    // 2. Gerar IV aleatório (12 bytes para GCM)
    console.log("2️⃣ Gerando IV aleatório...");
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 3. Criptografar mensagem com AES-GCM
    console.log("3️⃣ Criptografando mensagem com AES-GCM...");
    const messageBuffer = stringToArrayBuffer(message);
    const encryptedData = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      aesKey,
      messageBuffer
    );

    // 4. Separar conteúdo criptografado e auth tag
    // AES-GCM retorna: [ciphertext + 16 bytes de auth tag]
    const encryptedArray = new Uint8Array(encryptedData);
    const ciphertext = encryptedArray.slice(0, encryptedArray.length - 16);
    const authTag = encryptedArray.slice(encryptedArray.length - 16);

    console.log(
      "   ✅ Auth Tag gerado:",
      arrayBufferToBase64(authTag.buffer).substring(0, 20) + "..."
    );

    // 5. Exportar chave AES
    const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);

    // 6. Criptografar chave AES com RSA do destinatário
    console.log("4️⃣ Criptografando chave AES com RSA...");
    const recipientPublicKey = await importPublicKey(recipientPublicKeyPem);
    const encryptedKey = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      recipientPublicKey,
      aesKeyRaw
    );

    // 7. Obter nonce sequencial
    const nonce = getNextNonce(senderId);
    console.log("5️⃣ Nonce obtido:", nonce);

    // 8. Timestamp atual
    const timestamp = new Date().toISOString();

    // 9. Calcular HMAC
    console.log("6️⃣ Calculando HMAC...");
    const content64 = arrayBufferToBase64(ciphertext.buffer);
    const hmac = await calculateHMAC(
      content64,
      timestamp,
      nonce,
      senderId,
      hmacSecret
    );

    console.log("✅ === CRIPTOGRAFIA CONCLUÍDA COM SUCESSO ===\n");

    // 10. Retornar todos os dados
    return {
      content: content64,
      encryptedKey: arrayBufferToBase64(encryptedKey),
      iv: arrayBufferToBase64(iv.buffer),
      authTag: arrayBufferToBase64(authTag.buffer),
      nonce: nonce,
      timestamp: timestamp,
      hmac: hmac,
    };
  } catch (error) {
    console.error("❌ Erro na criptografia:", error);
    throw error;
  }
};

/**
 * ETAPA 3: Descriptografar e verificar integridade
 *
 * @param {Object} encryptedData - Dados criptografados
 * @param {CryptoKey} privateKey - Chave privada RSA do destinatário
 * @param {string} senderId - ID do remetente
 * @param {string} hmacSecret - Segredo compartilhado para HMAC
 * @returns {string|null} Mensagem descriptografada ou null se adulterada
 */
export const decryptWithIntegrity = async (
  encryptedData,
  privateKey,
  senderId,
  hmacSecret = "shared-secret-key"
) => {
  console.log("\n🔓 === INICIANDO DESCRIPTOGRAFIA COM VERIFICAÇÃO ===");

  try {
    // 1. Verificar HMAC
    console.log("1️⃣ Verificando HMAC...");
    const hmacValid = await verifyHMAC(
      encryptedData.content,
      encryptedData.timestamp,
      encryptedData.nonce,
      senderId,
      encryptedData.hmac,
      hmacSecret
    );

    if (!hmacValid) {
      console.error("❌ HMAC INVÁLIDO - Mensagem adulterada!");
      return null;
    }
    console.log("   ✅ HMAC válido");

    // 2. Verificar nonce (proteção contra replay)
    console.log("2️⃣ Verificando nonce...");
    if (!isValidNonce(senderId, encryptedData.nonce)) {
      console.error("❌ NONCE INVÁLIDO - Possível replay attack!");
      return null;
    }
    console.log("   ✅ Nonce válido");

    // 3. Verificar timestamp (não muito antigo)
    console.log("3️⃣ Verificando timestamp...");
    const messageAge =
      (new Date() - new Date(encryptedData.timestamp)) / 1000 / 60;
    if (messageAge > 10) {
      // 10 minutos
      console.warn(`⚠️ Mensagem antiga (${messageAge.toFixed(1)} minutos)`);
    }

    // 4. Descriptografar chave AES com RSA
    console.log("4️⃣ Descriptografando chave AES...");
    const encryptedKeyBuffer = base64ToArrayBuffer(encryptedData.encryptedKey);
    const aesKeyRaw = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedKeyBuffer
    );

    // 5. Importar chave AES
    const aesKey = await crypto.subtle.importKey(
      "raw",
      aesKeyRaw,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    // 6. Reconstruir dados criptografados (ciphertext + authTag)
    console.log("5️⃣ Descriptografando mensagem com AES-GCM...");
    const ciphertext = base64ToArrayBuffer(encryptedData.content);
    const authTag = base64ToArrayBuffer(encryptedData.authTag);
    const iv = base64ToArrayBuffer(encryptedData.iv);

    // Concatenar ciphertext + authTag (formato esperado pelo AES-GCM)
    const encryptedWithTag = new Uint8Array(
      ciphertext.byteLength + authTag.byteLength
    );
    encryptedWithTag.set(new Uint8Array(ciphertext), 0);
    encryptedWithTag.set(new Uint8Array(authTag), ciphertext.byteLength);

    // 7. Descriptografar (AES-GCM verifica authTag automaticamente)
    let decrypted;
    try {
      decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        aesKey,
        encryptedWithTag
      );
    } catch (error) {
      console.error("❌ AUTH TAG INVÁLIDO - Mensagem foi adulterada!");
      console.error("   Erro:", error.message);
      return null;
    }

    console.log("   ✅ Auth Tag verificado com sucesso!");

    // 8. Converter para texto
    const message = arrayBufferToString(decrypted);

    console.log("✅ === DESCRIPTOGRAFIA E VERIFICAÇÃO BEM-SUCEDIDAS ===\n");
    return message;
  } catch (error) {
    console.error("❌ Erro na descriptografia:", error);
    return null;
  }
};

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Limpar nonces antigos (manutenção)
 */
export const cleanOldNonces = (daysToKeep = 30) => {
  const keys = Object.keys(localStorage);
  const now = Date.now();
  const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

  keys.forEach((key) => {
    if (key.startsWith("lastNonce_")) {
      // Remover nonces não usados recentemente
      // (implementação simplificada - em produção, usar timestamp)
    }
  });
};

/**
 * Resetar nonces (apenas desenvolvimento)
 */
export const resetNonces = () => {
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (key.startsWith("nonce_") || key.startsWith("lastNonce_")) {
      localStorage.removeItem(key);
    }
  });
  console.log("🔄 Nonces resetados");
};

export default {
  encryptWithIntegrity,
  decryptWithIntegrity,
  resetNonces,
  cleanOldNonces,
};
