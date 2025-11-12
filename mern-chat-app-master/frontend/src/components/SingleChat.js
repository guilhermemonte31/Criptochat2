import { FormControl } from "@chakra-ui/form-control";
import { Input } from "@chakra-ui/input";
import { Box, Text } from "@chakra-ui/layout";
import "./styles.css";
import { IconButton, Spinner, useToast, Button } from "@chakra-ui/react";
import { getSender, getSenderFull } from "../config/ChatLogics";
import { useEffect, useState } from "react";
import { useHistory } from "react-router";
import axios from "axios";
import { ArrowBackIcon } from "@chakra-ui/icons";
import ProfileModal from "./miscellaneous/ProfileModal";
import ScrollableChat from "./ScrollableChat";
import Lottie from "react-lottie";
import animationData from "../animations/typing.json";
import Cookies from "js-cookie";
import io from "socket.io-client";
import UpdateGroupChatModal from "./miscellaneous/UpdateGroupChatModal";
import { ChatState } from "../Context/ChatProvider";
import "./SingleChat.css";

const ENDPOINT = "http://localhost:5000";
var socket, selectedChatCompare;

// FUNÇÕES DE SUPORTE PARA DECIFRAR A CHAVE PRIVADA SALVA
const arrayBufferFromBase64 = (b64) => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

function clearOldPrivateKeys(currentUserName) {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.endsWith("_privateKey") && key !== `${currentUserName}_privateKey`) {
      localStorage.removeItem(key);
      i--; // ajusta o índice porque removemos um item
    }
  }
}

  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";

    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
  };

  
  const deriveAesKey = async (password, salt) => {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    return await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  };


const deriveAesKeyForDecryption = async (password, salt, iterations, hash) => {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
};

// Recuperando e decifrando a chave privada do sessionStorage
const decryptStoredPrivateKey = async (password) => {
  try {
    const privateKeyJwkStr = sessionStorage.getItem("privateKeyJwk");
    if (!privateKeyJwkStr) {
      console.warn("Nenhuma chave privada encontrada na sessão.");
      return;
    }

    const privateKeyJwk = JSON.parse(privateKeyJwkStr);

    const privateKey = await window.crypto.subtle.importKey(
      "jwk",
      privateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["decrypt"]
    );

    console.log("✅ Chave privada importada com sucesso da sessão.");
    return privateKey;
  } catch (err) {
    console.error("❌ Erro ao importar chave privada:", err);
    return null;
  }
};


const encryptPrivateKey = async (privateKeyArrayBuffer, password) => {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const aesKey = await deriveAesKey(password, salt);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    privateKeyArrayBuffer
  );

  return {
    cipher: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer),
    salt: arrayBufferToBase64(salt.buffer),
  };
};


// Funções para rotação de chaves
const generateNewKeyPair = async () => {
  console.log("🔄 Iniciando geração do novo par de chaves...");
  
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  console.log("✅ Novo par de chaves gerado com sucesso!");
  return keyPair;
};

const exportPublicKeyToPEM = async (publicKey) => {
  const exported = await window.crypto.subtle.exportKey("spki", publicKey);
  const exportedAsBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  return `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64}\n-----END PUBLIC KEY-----`;
};

const exportPrivateKeyToJWK = async (privateKey) => {
  return await window.crypto.subtle.exportKey("jwk", privateKey);
};

const exportPrivateKeyToPkcs8 = async (privateKey) => {
  const exported = await window.crypto.subtle.exportKey("pkcs8", privateKey);
  const exportedAsBase64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  return `-----BEGIN PRIVATE KEY-----\n${exportedAsBase64}\n-----END PRIVATE KEY-----`;
}

const recryptMessage = async (message, oldPrivateKey, newPublicKey) => {
  // Descriptografa com a chave antiga
  const decrypted = await decryptMessage(message, oldPrivateKey);
  if (!decrypted) return null;

  // Criptografa com a nova chave
  const recrypted = await encryptMessageForUser(decrypted, newPublicKey);
  return recrypted;
};

const encryptMessageForUser = async (message, publicKeyPem) => {
  console.log("1 - Iniciando criptografia para destinatário...");
  console.log("Chave publica do destinatário:\n", publicKeyPem);
  const pemBody = publicKeyPem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\n/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const publicKey = await window.crypto.subtle.importKey(
    "spki",
    binaryDer.buffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );

  const encoded = new TextEncoder().encode(message);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    encoded
  );
  const encryptedB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  console.log("✅ Mensagem criptografada com sucesso.");
  return encryptedB64;
};

const decryptMessage = async (encryptedB64, privateKey) => {
  try {
    console.log("Tentando descriptografar mensagem...");
    const encryptedBytes = new Uint8Array(arrayBufferFromBase64(encryptedB64));
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedBytes
    );
    const decoded = new TextDecoder().decode(decrypted);
    console.log("✅ Mensagem descriptografada:", decoded);
    return decoded;
  } catch (err) {
    console.warn("⚠️ Falha na descriptografia (mensagem não destinada a este usuário).");
    return null;
  }
};



const SingleChat = ({ fetchAgain, setFetchAgain }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [istyping, setIsTyping] = useState(false);
  const [privateKey, setPrivateKey] = useState(null);
  const [isRotatingKeys, setIsRotatingKeys] = useState(false);

  const toast = useToast();

  const defaultOptions = {
    loop: true,
    autoplay: true,
    animationData: animationData,
    rendererSettings: {
      preserveAspectRatio: "xMidYMid slice",
    },
  };

  const { selectedChat, setSelectedChat, user, notification, setNotification } = ChatState();

  useEffect(() => {
    (async () => {
      const key = await decryptStoredPrivateKey();
      if (key) setPrivateKey(key);
    })();

    socket = io(ENDPOINT);
    socket.emit("setup", user);
    socket.on("connected", () => setSocketConnected(true));
    socket.on("typing", () => setIsTyping(true));
    socket.on("stop typing", () => setIsTyping(false));

    return () => {
      socket.off("connected");
      socket.off("typing");
      socket.off("stop typing");
    };
  }, []);

  const fetchMessages = async (isRefresh = false) => {
    if (!selectedChat || !privateKey) return;
    console.log(isRefresh ? "\n🔄 Atualizando mensagens..." : "\n=== BUSCANDO MENSAGENS CIFRADAS ===");

    try {
      const config = {
        headers: { Authorization: `Bearer ${user.token}` },
      };

      const { data } = await axios.get(`/api/message/${selectedChat._id}`, config);
      console.log(`📦 ${data.length} mensagens recebidas do servidor.`);

      const decryptedMessages = [];
      for (const msg of data) {
        console.log("\nProcessando mensagem:", msg._id);

        // Evita processar mensagens que não são do chat atual
        if (!msg.destinatario || (!msg.sender && !msg.chat)) continue;

        if (
          msg.destinatario?._id !== user._id && // não é destinatário
          msg.sender?._id !== user._id // nem remetente
        ) {
          console.log(`Ignorando mensagem ${msg._id}: não pertence a ${user.name}`);
          continue;
        }

        // Evita mostrar cópia duplicada do mesmo conteúdo enviado
        if (
          msg.sender?._id === user._id && // sou o remetente
          msg.destinatario?._id !== user._id // mas não é a versão "minha"
        ) {
          console.log(`Ignorando duplicata da mensagem enviada: ${msg._id}`);
          continue;
        }

        // Evita descriptografia se a chave ainda não foi carregada
        if (!privateKey) {
          console.warn("⚠️ Chave privada ainda não disponível, adiando descriptografia.");
          continue;
        }

        console.log("[DEBUG] teste chave privada: ", privateKey);

        const clear = await decryptMessage(msg.content, privateKey);

        decryptedMessages.push({
          ...msg,
          decrypted: clear || "[Falha ao descriptografar mensagem]",
        });
      }

      // Ordena por data e evita duplicação de mensagens já exibidas
      const allMessages = isRefresh
        ? [...messages, ...decryptedMessages].filter(
            (v, i, arr) => arr.findIndex(m => m._id === v._id) === i
          )
        : decryptedMessages;
      
      const uniqueMessages = decryptedMessages.filter(
        (msg, index, self) =>
          index === self.findIndex(
            (m) =>
              m.sender._id === msg.sender._id &&
              m.decrypted === msg.decrypted &&
              Math.abs(new Date(m.createdAt) - new Date(msg.createdAt)) < 2000 // margem de 2s
          )
      );

      setMessages(uniqueMessages);

      // setMessages(decryptedMessages);
      if (!isRefresh) socket.emit("join chat", selectedChat._id);

      console.log("✅ Todas as mensagens processadas e exibidas no chat.");
    } catch (error) {
      console.error("❌ Erro ao buscar mensagens:", error);
      toast({
        title: "Erro!",
        description: "Falha ao carregar mensagens.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    }
  };

  // 1️⃣ Busca mensagens sempre que o chat selecionado mudar
  useEffect(() => {
    if (selectedChat && privateKey) {
      fetchMessages(false);
      selectedChatCompare = selectedChat;
    }
  }, [selectedChat, privateKey]);

  // 2️⃣ Atualiza quando o socket pedir refresh
  useEffect(() => {
    if (!socket) return;
    socket.on("refresh messages", () => fetchMessages(true));
    return () => socket.off("refresh messages");
  }, [socket, privateKey, selectedChat]);

  const sendMessage = async (event) => {
    if (event.key === "Enter" && newMessage) {
      console.log("\n=== INICIANDO ENVIO DE MENSAGEM CIFRADA ===");
      socket.emit("stop typing", selectedChat._id);

      try {
        const config = {
          headers: {
            "Content-type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
        };

        const { data: chatInfo } = await axios.get(
          `/api/chat/${selectedChat._id}`,
          config
        );

        console.log("👥 Usuários no chat:", chatInfo.users.map(u => u.email).join(", "));

        const encryptedMessages = [];
        for (const member of chatInfo.users) {
          console.log(`🔐 Criptografando mensagem para ${member.email}...`);
          console.log("[DEBUG] Chave pública do destinatário: ", member.publicKey);
          const encrypted = await encryptMessageForUser(newMessage, member.publicKey);
          encryptedMessages.push({
            destinatarioId: member._id,
            content: encrypted,
          });
        }

        // Enviar cada versão criptografada
        await Promise.all(
          encryptedMessages.map(msg =>
            axios.post(
              "/api/message",
              {
                content: msg.content,
                chatId: selectedChat._id,
                destinatarioId: msg.destinatarioId,
              },
              config
            )
          )
        );

        console.log("✅ Todas as mensagens cifradas enviadas com sucesso!");
        setNewMessage("");
        socket.emit("new message", { room: selectedChat._id });
      } catch (error) {
        console.error("❌ Erro ao enviar mensagem:", error);
        toast({
          title: "Erro!",
          description: "Falha ao enviar mensagem.",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom",
        });
      }
    }
  };

  const typingHandler = (e) => {
    setNewMessage(e.target.value);
    if (!socketConnected) return;
    if (!typing) {
      setTyping(true);
      socket.emit("typing", selectedChat._id);
    }
    let lastTypingTime = new Date().getTime();
    var timerLength = 3000;
    setTimeout(() => {
      var timeNow = new Date().getTime();
      var timeDiff = timeNow - lastTypingTime;
      if (timeDiff >= timerLength && typing) {
        socket.emit("stop typing", selectedChat._id);
        setTyping(false);
      }
    }, timerLength);
  };

  const rotateKeys = async () => {

    if (!privateKey) {
      toast({
        title: "Erro!",
        description: "Chave privada atual não encontrada.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      return;
    }

    try {
      setIsRotatingKeys(true);
      console.log("INICIANDO PROCESSO DE ROTAÇÃO DE CHAVES");
      console.log("Chave privada atual:", await window.crypto.subtle.exportKey("jwk", privateKey));

      // Gera novo par de chaves
      const newKeyPair = await generateNewKeyPair();
      const newPublicKeyPEM = await exportPublicKeyToPEM(newKeyPair.publicKey);
      const newPrivateKeyJWK = await exportPrivateKeyToJWK(newKeyPair.privateKey);
      const newPrivateKeyPEM = await exportPrivateKeyToPkcs8(newKeyPair.privateKey);
      const newPrivateKeyBytes = await window.crypto.subtle.exportKey("pkcs8", newKeyPair.privateKey);
      const encryptedNewPrivate = await encryptPrivateKey(newPrivateKeyBytes, user.password);


      console.log("🔑 Nova chave pública gerada:", newPublicKeyPEM);
      console.log("🔑 Nova chave privada gerada:", newPrivateKeyPEM);

      
      const teste = localStorage.getItem("userInfo");
      sessionStorage.setItem("privateKeyJwk", JSON.stringify(newPrivateKeyJWK));
      console.log("Nova chave privada JWK armazenada na sessão. ", newPrivateKeyJWK);

      // Atualiza chave no backend
      const config = {
        headers: {
          "Content-type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      };

      console.log("[DEBUG] Enviando nova chave pública para o servidor...");
      await axios.post("/api/user/rotate-keys", {
        newPublicKey: newPublicKeyPEM
      }, config);



      // Re-criptografa mensagens existentes
      console.log("Iniciando re-criptografia das mensagens...");


      const newEncryptedMessages = [];






      const messagesToUpdate = messages.filter(m => m.destinatario._id === user._id);

      console.log("[DEBUG] Mensagens para re-criptografar:", messagesToUpdate.map(m => m.content));
      
      for (const msg of messagesToUpdate) {
        const recryptedContent = await recryptMessage(
          msg.content,
          privateKey,
          newPublicKeyPEM
        );
        console.log(`[DEBUG] Mensagem ${msg._id} re-criptografada:`, recryptedContent);

        if (recryptedContent) {
          await axios.put(`/api/message/edit/${msg._id}`, {
            content: recryptedContent
          }, config);
          console.log(`✅ Mensagem ${msg._id} re-criptografada com sucesso`);
        }
      }

     

      console.log("Rotação de chaves concluída com sucesso!");
      toast({
        title: "Sucesso!",
        description: "Chaves rotacionadas com sucesso.",
        status: "success",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });

      const testename = JSON.parse(teste).name;
      // Atualiza chaves no storage
      clearOldPrivateKeys(testename);

      localStorage.setItem(`${testename}_privateKey`, JSON.stringify(encryptedNewPrivate));

      //localStorage.setItem("userInfo", JSON.stringify(data));
      setPrivateKey(newKeyPair.privateKey);

      // Recarrega mensagens com nova chave
      await fetchMessages(true);

    } catch (error) {
      console.error("Erro na rotação de chaves:", error);
      toast({
        title: "Erro!",
        description: "Falha ao rotacionar chaves.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    } finally {
      setIsRotatingKeys(false);
    }
  };

  return (
    <>
      {selectedChat ? (
        <div className="singlechat-container">
          {/* Header do chat */}
          <div className="chat-header">
            <div className="chat-header-left">
              <button
                className="back-button"
                onClick={() => setSelectedChat("")}
              >
                <ArrowBackIcon />
              </button>
              <h2 className="chat-header-title">
                {!selectedChat.isGroupChat
                  ? getSender(user, selectedChat.users)
                  : selectedChat.chatName.toUpperCase()}
              </h2>
            </div>
            <div className="chat-header-actions">
              <div style={{ display: 'flex', gap: '10px' }}>
                {!selectedChat.isGroupChat ? (
                  <ProfileModal user={getSenderFull(user, selectedChat.users)}>
                    <button className="header-icon-btn">
                      <i className="fas fa-info-circle"></i>
                    </button>
                  </ProfileModal>
                ) : (
                  <UpdateGroupChatModal
                    fetchMessages={fetchMessages}
                    fetchAgain={fetchAgain}
                    setFetchAgain={setFetchAgain}
                  >
                    <button className="header-icon-btn">
                      <i className="fas fa-cog"></i>
                    </button>
                  </UpdateGroupChatModal>
                )}
                <Button
                  onClick={rotateKeys}
                  isLoading={isRotatingKeys}
                  loadingText="Rotacionando..."
                  size="sm"
                  colorScheme="blue"
                  leftIcon={<i className="fas fa-key"></i>}
                >
                  Rotacionar Chaves
                </Button>
              </div>
            </div>
          </div>

          {/* Área de mensagens */}
          <div className="messages-container">
            {loading ? (
              <div className="messages-loading">
                <Spinner size="xl" color="#00a88e" />
              </div>
            ) : (
              <ScrollableChat messages={messages} />
            )}

            {/* Indicador de digitação */}
            {istyping && (
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            )}
          </div>

          {/* Input de mensagem */}
          <div className="message-input-container">
            <div className="message-input-wrapper">
              <input
                className="message-input"
                placeholder="Enter a message..."
                value={newMessage}
                onChange={typingHandler}
                onKeyDown={sendMessage}
              />
              <button
                className="send-button"
                onClick={(e) => {
                  e.key = "Enter";
                  sendMessage(e);
                }}
                disabled={!newMessage.trim()}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-chat-state">
          <div className="empty-chat-icon">💬</div>
          <div className="empty-chat-text">
            Click on a user to start chatting
          </div>
        </div>
      )}
    </>
  );
};

export default SingleChat;