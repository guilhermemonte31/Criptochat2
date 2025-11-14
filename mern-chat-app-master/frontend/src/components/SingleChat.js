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

let checkRotate=0;


// // const ChangeKeys = async (oldPrivateKey, userName, userID, userToken, password) => {
// async function ChangeKeys() {
//   //console.log("Mudando chaves... ", oldPrivateKey);

//   // console.log("Parametros:", userName, userID, userToken, password);

//   const userInfos = JSON.parse(localStorage.getItem("userInfo"));
//   const userName = userInfos.name;
//   const userID = userInfos._id;
//   const userToken = userInfos.token;
//   const password = userInfos.rawPassword;
//   const oldPrivateKey = privateKey;


//   const config = { headers: { Authorization: `Bearer ${userToken}` }, };


//   const newKeyPair = await window.crypto.subtle.generateKey(
//     {
//       name: "RSA-OAEP",
//       modulusLength: 2048,
//       publicExponent: new Uint8Array([1, 0, 1]),
//       hash: "SHA-256",
//     },
//     true,
//     ["encrypt", "decrypt"]
//   );

//   const spki = await window.crypto.subtle.exportKey("spki", newKeyPair.publicKey);
//   const publicB64 = arrayBufferToBase64(spki);
//   const newpublicPem = `-----BEGIN PUBLIC KEY-----\n${publicB64.match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----`;
//   const pkcs8 = await window.crypto.subtle.exportKey("pkcs8", newKeyPair.privateKey);
//   const privateB64 = arrayBufferToBase64(pkcs8);
//   const newprivatePem = `-----BEGIN PRIVATE KEY-----\n${privateB64.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`;
//   console.log("[DEBUG] Nova chave pública PEM:\n", newpublicPem);
//   console.log("[DEBUG] Nova chave privada PEM:\n", newprivatePem);
//   console.log("nova chave privada no formato cryptokey ", newKeyPair.privateKey);

//   const allMessagesParaUsuario = await axios.get(`/api/message/getmessages/${userID}`, config);

//   for(const mensagem of allMessagesParaUsuario.data){
//     console.log("Mensagem ",mensagem._id, " antes:" , mensagem.content);
//     const testeClear = await decryptMessage(mensagem.content, oldPrivateKey);
//     console.log("Mensagem ",mensagem._id, " depois de ser decifrada:", testeClear);
//     const clearEncrypted = await encryptMessageForUser(testeClear, newpublicPem);
//     console.log("Mensagem ",mensagem._id, " depois de ser recriptografada:", clearEncrypted);
    
//     // console.log("testeee mensagem recriptada: ", clearEncrypted);
//     // const test  = await decryptMessage(clearEncrypted, newKeyPair.privateKey);
//     // console.log("testeee mensagem recriptada e depois decriptada: ", test);
//     try{
//       const sendRecrypted = await axios.post("/api/message/editmessage",
//         {
//           msgID: mensagem._id,
//           content: clearEncrypted,
//         },
//          config);
//       console.log("Mensagem de id: ", mensagem._id, " recriptada com nova chave e salva no servidor. ", sendRecrypted);

//     }catch(e){
//       console.error("Erro ao recriptografar mensagem ", mensagem._id, ": ", e.message);
//     }
//   }

//   console.log("Todas mensagens para o usuario foram atualizadas com a nova chave.");

//   console.log("Atualizando chave publica PEM no banco...");

//   try{
//       await axios.post("/api/user/rotatekeys", {
//         newPublicKey: newpublicPem,
//       }, config);
//       console.log("Chave pública atualizada no servidor.");
//     }catch (e){
//       console.log("Erro na atualização da chave pública no servidor. ", e);
//     }
  
//   console.log("Atualizando chave privada no localstorage...");


//   const privateKeyBytes = await window.crypto.subtle.exportKey("pkcs8", newKeyPair.privateKey);
//   const encryptedPrivate = await encryptPrivateKey(privateKeyBytes, password);
//   localStorage.setItem(`${userName}_privateKey`, JSON.stringify(encryptedPrivate));

  
//   console.log("atualizando chave privada no sessionstorage...");
//   const privateKeyJwk = await crypto.subtle.exportKey("jwk", newKeyPair.privateKey);
//   sessionStorage.setItem("privateKeyJwk", JSON.stringify(privateKeyJwk));

//   console.log("Atualizando chave privada no script...");
//   setPrivateKey(newKeyPair.privateKey);


// }


// FUNÇÕES DE SUPORTE PARA DECIFRAR A CHAVE PRIVADA SALVA
const arrayBufferFromBase64 = (b64) => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

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


async function decryptPrivateKey(encryptedData, password) {
  console.log("decryptPrivateKey called with:", encryptedData, password);
  const salt = Uint8Array.from(atob(encryptedData.salt), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));
  const cipherBytes = Uint8Array.from(atob(encryptedData.cipher), c => c.charCodeAt(0));

  const aesKey = await deriveAesKey(password, salt);
  let decrypted;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      cipherBytes
    );
    console.log("[abc] DECRYPTED PRIVATE KEY ARRAY BUFFER:", decrypted);
  } catch (e) {
    console.error("Decryption failed:", e);
    throw e;
  }

  // Importa diretamente o ArrayBuffer descriptografado
  return await crypto.subtle.importKey(
    "pkcs8",
    decrypted,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );
}

function clearOldPrivateKeys(currentUserName) {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.endsWith("_privateKey") && key !== `${currentUserName}_privateKey`) {
      localStorage.removeItem(key);
      i--; // ajusta o índice porque removemos um item
    }
  }
}



// Recuperando e decifrando a chave privada do sessionStorage
const decryptStoredPrivateKey = async (password) => {
  try {
    console.log("decryptStoredPrivateKey called with password:", password);
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



const encryptMessageForUser = async (message, publicKeyPem) => {
  console.log("xyz criptografando mensagem: ", message, " com chave: ", publicKeyPem);
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

    
    const encryptedBytes = new Uint8Array(arrayBufferFromBase64(encryptedB64));
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedBytes
    );
    const decoded = new TextDecoder().decode(decrypted);
    return decoded;
  } catch (err) {
    console.error("❌ Falha na descriptografia:", err);
    //return null;
  }
};


const recryptMessage = async (message, oldPrivateKey, newPublicKey) => {
  // Descriptografa com a chave antiga
  const decrypted = await decryptMessage(message, oldPrivateKey);
  console.log("testeee ", decrypted);
  if (!decrypted) return null;

  // Criptografa com a nova chave
  const recrypted = await encryptMessageForUser(decrypted, newPublicKey);
  console.log("testeee recriptado ", recrypted);
  return recrypted;
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
    console.log("useeffect");
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
    const testePrivKey = privateKey;
    console.log("ssdfChave privada usada para decifrar mensagens: ", testePrivKey);

    try {
      const config = {
        headers: { Authorization: `Bearer ${user.token}` },
      };

      const { data } = await axios.get(`/api/message/${selectedChat._id}`, config);
     

      const decryptedMessages = [];
      for (const msg of data) {
        
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

        const clear = await decryptMessage(msg.content, privateKey);

        console.log(" clear: ", clear);

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


      // if(checkRotate===1){
      //   console.log("Iniciando mudança de chaves após refresh...", user.name, user._id);
      //   const passw = JSON.parse(localStorage.getItem("userInfo")).rawPassword;
      //   ChangeKeys(testePrivKey, user.name, user._id, user.token, passw);
      //   checkRotate = 0;
      // }

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

  const changeKeys = async () => {
    const config = {
      headers: { Authorization: `Bearer ${user.token}` },
    };
    await fetchMessages(true);

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
    //console.log("Mudando chaves... ", oldPrivateKey);

    // console.log("Parametros:", userName, userID, userToken, password);
    setIsRotatingKeys(true);
    const userInfos = JSON.parse(localStorage.getItem("userInfo"));
    const userName = userInfos.name;
    const userID = userInfos._id;
    const userToken = userInfos.token;
    const password = userInfos.rawPassword;
    const oldPrivateKey = privateKey;




    const newKeyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );

    const spki = await window.crypto.subtle.exportKey("spki", newKeyPair.publicKey);
    const publicB64 = arrayBufferToBase64(spki);
    const newpublicPem = `-----BEGIN PUBLIC KEY-----\n${publicB64.match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----`;
    const pkcs8 = await window.crypto.subtle.exportKey("pkcs8", newKeyPair.privateKey);
    const privateB64 = arrayBufferToBase64(pkcs8);
    const newprivatePem = `-----BEGIN PRIVATE KEY-----\n${privateB64.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`;
    console.log("[DEBUG] Nova chave pública PEM:\n", newpublicPem);
    console.log("[DEBUG] Nova chave privada PEM:\n", newprivatePem);
    console.log("nova chave privada no formato cryptokey ", newKeyPair.privateKey);

    const allMessagesParaUsuario = await axios.get(`/api/message/getmessages/${userID}`, config);

    for(const mensagem of allMessagesParaUsuario.data){
      console.log("Mensagem ",mensagem._id, " antes:" , mensagem.content);
      const testeClear = await decryptMessage(mensagem.content, oldPrivateKey);
      console.log("Mensagem ",mensagem._id, " depois de ser decifrada:", testeClear);
      const clearEncrypted = await encryptMessageForUser(testeClear, newpublicPem);
      console.log("Mensagem ",mensagem._id, " depois de ser recriptografada:", clearEncrypted);
      
      try{
        const sendRecrypted = await axios.post("/api/message/editmessage",
          {
            msgID: mensagem._id,
            content: clearEncrypted,
          },
          config);
        console.log("Mensagem de id: ", mensagem._id, " recriptada com nova chave e salva no servidor. ", sendRecrypted);

      }catch(e){
        console.error("Erro ao recriptografar mensagem ", mensagem._id, ": ", e.message);
      }
    }

    console.log("Todas mensagens para o usuario foram atualizadas com a nova chave.");

    console.log("Atualizando chave publica PEM no banco...");

    try{
        await axios.post("/api/user/rotatekeys", {
          newPublicKey: newpublicPem,
        }, config);
        console.log("Chave pública atualizada no servidor.");
      }catch (e){
        console.log("Erro na atualização da chave pública no servidor. ", e);
      }
    
    console.log("Atualizando chave privada no localstorage...");


    const privateKeyBytes = await window.crypto.subtle.exportKey("pkcs8", newKeyPair.privateKey);
    const encryptedPrivate = await encryptPrivateKey(privateKeyBytes, password);
    localStorage.setItem(`${userName}_privateKey`, JSON.stringify(encryptedPrivate));

    
    console.log("atualizando chave privada no sessionstorage...");
    const privateKeyJwk = await crypto.subtle.exportKey("jwk", newKeyPair.privateKey);
    sessionStorage.setItem("privateKeyJwk", JSON.stringify(privateKeyJwk));

    console.log("Atualizando chave privada no script...");
    setPrivateKey(newKeyPair.privateKey);
    toast({
      title: "Sucesso!",
      description: "Chaves rotacionadas com sucesso.",
      status: "success",
      duration: 5000,
      isClosable: true,
      position: "bottom",
    });
    console.log("Rotação de chaves concluída com sucesso!");
    setIsRotatingKeys(false);
  }

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
                  onClick={changeKeys}
                  isLoading={isRotatingKeys}
                  loadingText="Rotacionando..."
                  size="sm"
                  colorScheme="blue"
                  
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