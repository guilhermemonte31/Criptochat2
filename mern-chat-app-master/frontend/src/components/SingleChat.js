import { FormControl } from "@chakra-ui/form-control";
import { Input } from "@chakra-ui/input";
import { Box, Text } from "@chakra-ui/layout";
import "./styles.css";
import { IconButton, Spinner, useToast } from "@chakra-ui/react";
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

// RECUPERAr E DECIFRAr A CHAVE PRIVADA CIFRADA
const decryptStoredPrivateKey = async (password) => {
  try {
    const encryptedData = localStorage.getItem("cryptoreal_privateKey");
    if (!encryptedData) {
      console.warn("⚠️ Nenhuma chave privada encontrada no localStorage.");
      return null;
    }

    const { cipher, iv, salt, iterations, hash } = JSON.parse(encryptedData);

    const aesKey = await deriveAesKeyForDecryption(
      password,
      new Uint8Array(arrayBufferFromBase64(salt)),
      iterations,
      hash
    );

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(arrayBufferFromBase64(iv)) },
      aesKey,
      arrayBufferFromBase64(cipher)
    );

    const privateKey = await window.crypto.subtle.importKey(
      "pkcs8",
      decrypted,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      true,
      ["decrypt"]
    );

    console.log("✅ Chave privada descriptografada com sucesso");
    return privateKey;
  } catch (err) {
    console.error("❌ Erro ao descriptografar a chave privada:", err);
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

  const toast = useToast();

  const defaultOptions = {
    loop: true,
    autoplay: true,
    animationData: animationData,
    rendererSettings: {
      preserveAspectRatio: "xMidYMid slice",
    },
  };
  const { selectedChat, setSelectedChat, user, notification, setNotification } =
    ChatState();

  const fetchMessages = async () => {
    if (!selectedChat) {
      console.log("fetchMessages: Nenhum chat selecionado");
      return;
    }

    console.log("fetchMessages: Buscando mensagens para chat:", selectedChat._id);

    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };

      const { data } = await axios.get(`/api/message/${selectedChat._id}`, config);
      console.log("fetchMessages: Mensagens recebidas:", data.length);

      // 🚫 Removido: descriptografia antiga com localStorage e decryptMessage()
      // Vamos exibir as mensagens originais até a descriptografia real ser implementada
      setMessages(data);
      socket.emit("join chat", selectedChat._id);

    } catch (error) {
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

  const sendMessage = async (event) => {
    if (event.key === "Enter" && newMessage) {
      console.log("\n=== ENVIANDO MENSAGEM ===");
      console.log("Conteúdo:", newMessage);
      console.log("Chat ID:", selectedChat._id);
      
      socket.emit("stop typing", selectedChat._id);
      try {
        const config = {
          headers: {
            "Content-type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
        };
        setNewMessage("");
        console.log("Teste2: ", newMessage, " t", selectedChat._id);
        const {data} = await axios.post(
          "/api/message",
          {
            content: newMessage,
            chatId: selectedChat,
          },
          config
        );
        
        console.log("sendMessage: Resposta recebida do servidor:", data);

        // 🚫 Removido: decryptMessage com chave localStorage
        setMessages((prev) => [...prev, data]);

        socket.emit("new message", { room: selectedChat._id });
        console.log("=== ENVIO CONCLUÍDO ===\n");
        
      } catch (error) {
        console.error("sendMessage: ERRO ao enviar mensagem:", error);
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

  useEffect(() => {
    const userInfo = JSON.parse(localStorage.getItem("userInfo"));
    const password = userInfo?.password;

    if (password) {
      decryptStoredPrivateKey(password).then((key) => {
        if (key) {
          console.log("Chave privada pronta para uso no chat.");
          setPrivateKey(key);
        }
      });
    } else {
      console.warn("Senha não disponível para descriptografia da chave privada.");
    }

    socket = io(ENDPOINT);
    socket.emit("setup", user);

    socket.on("connected", () => {
      console.log("useEffect: Socket conectado");
      setSocketConnected(true);
    });
    
    socket.on("connected", () => setSocketConnected(true));
    socket.on("typing", () => setIsTyping(true));
    socket.on("stop typing", () => setIsTyping(false));

    return () => {
      console.log("useEffect: Limpando listeners do socket");
      socket.off("connected");
      socket.off("typing");
      socket.off("stop typing");
    };
    // eslint-disable-next-line
  }, []);


  useEffect(() => {
    fetchMessages();
    socket.on("refresh messages", () => {
      fetchMessages();
    });
    selectedChatCompare = selectedChat;
    // eslint-disable-next-line
  }, [selectedChat]);

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