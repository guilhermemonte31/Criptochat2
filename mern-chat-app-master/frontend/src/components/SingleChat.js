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

const ENDPOINT =
  window.location.hostname === "localhost"
    ? "http://localhost:5001"
    : window.location.origin;

let socket;
let selectedChatCompare;

const arrayBufferFromBase64 = (b64) => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const decryptStoredPrivateKey = async () => {
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
  const [socketInstance, setSocketInstance] = useState(null);

  const toast = useToast();
  const { selectedChat, setSelectedChat, user, notification, setNotification } = ChatState();

  useEffect(() => {
    if (!socketInstance) {
      console.log("🔌 Inicializando conexão socket...");
      const socketConn = io(ENDPOINT, {
        transports: ["websocket"],
        withCredentials: true,
      });

      socketConn.on("connect", () => {
        console.log("🟢 Conectado ao servidor Socket.IO");
        setSocketConnected(true);
        socketConn.emit("setup", user);
      });

      socketConn.on("disconnect", () => {
        console.warn("🔴 Desconectado do Socket.IO");
        setSocketConnected(false);
      });

      socketConn.on("typing", () => setIsTyping(true));
      socketConn.on("stop typing", () => setIsTyping(false));

      setSocketInstance(socketConn);
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const key = await decryptStoredPrivateKey();
      if (mounted && key) setPrivateKey(key);

      if (!socket) {
        console.log("🔌 Inicializando Socket.IO ->", ENDPOINT);
        socket = io(ENDPOINT, {
          transports: ["polling", "websocket"],
          withCredentials: true,
        });

        socket.on("connect", () => {
          console.log("🟢 Conectado ao servidor Socket.IO");
          setSocketConnected(true);
        });

        socket.on("disconnect", () => {
          console.warn("🔴 Desconectado do Socket.IO");
          setSocketConnected(false);
        });

        socket.on("connected", () => setSocketConnected(true));
        socket.on("typing", () => setIsTyping(true));
        socket.on("stop typing", () => setIsTyping(false));
      }

      if (socket && user) {
        socket.emit("setup", user);
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, [user]);

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
        if (!msg.destinatario || (!msg.sender && !msg.chat)) continue;
        if (
          msg.destinatario?._id !== user._id &&
          msg.sender?._id !== user._id
        )
          continue;

        const clear = await decryptMessage(msg.content, privateKey);
        decryptedMessages.push({
          ...msg,
          decrypted: clear || "[Falha ao descriptografar mensagem]",
        });
      }

      setMessages(
        decryptedMessages.filter(
          (m) =>
            !(
              m.sender._id === user._id &&
              (m.decrypted?.includes("Falha ao descriptografar") ||
                m.content?.includes("Falha ao descriptografar"))
            )
        )
      );

      if (!isRefresh && socket && socketConnected) {
        socket.emit("join chat", selectedChat._id);
      }

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

  useEffect(() => {
    if (selectedChat && privateKey) {
      fetchMessages(false);
      selectedChatCompare = selectedChat;
    }
  }, [selectedChat, privateKey]);

  useEffect(() => {
    if (!socketInstance) return;
    const handleIncoming = async (newMsg) => {
      console.log("💬 Nova mensagem recebida via socket:", newMsg);

      if (!selectedChatCompare || selectedChatCompare._id !== newMsg.chat._id) {
        if (!notification.find((n) => n._id === newMsg._id)) {
          setNotification([newMsg, ...notification]);
          setFetchAgain(!fetchAgain);
        }
        return;
      }

      const clear = await decryptMessage(newMsg.content, privateKey);
      const finalMsg = { ...newMsg, decrypted: clear || "[Falha ao descriptografar]" };

      setMessages((prev) => {
        if (prev.some((m) => m._id === finalMsg._id)) return prev;
        return [...prev, finalMsg];
      });
    };

    socketInstance.on("message received", handleIncoming);
    socketInstance.on("refresh messages", () => fetchMessages(true));

    return () => {
      socketInstance.off("message received", handleIncoming);
      socketInstance.off("refresh messages");
    };
  }, [socketInstance, selectedChat, privateKey]);

  const sendMessage = async (event) => {
    const isEnter = event?.key === "Enter";
    if (!isEnter && event?.type === "click" && !newMessage) return;

    if ((isEnter || event?.type === "click") && newMessage) {
      console.log("\n=== INICIANDO ENVIO DE MENSAGEM CIFRADA ===");

      if (socket && socketConnected) {
        socket.emit("stop typing", selectedChat._id);
      }

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

        const encryptedMessages = [];

        for (const member of chatInfo.users) {
          // ⛔ Evita enviar mensagem para si mesmo (remetente)
          if (member._id === user._id) continue;

          const encrypted = await encryptMessageForUser(newMessage, member.publicKey);
          encryptedMessages.push({
            destinatarioId: member._id,
            content: encrypted,
          });
        }

        const createdMessages = await Promise.all(
          encryptedMessages.map(async (msg) => {
            const { data } = await axios.post(
              "/api/message",
              {
                content: msg.content,
                chatId: selectedChat._id,
                destinatarioId: msg.destinatarioId,
              },
              config
            );
            return data;
          })
        );

        setNewMessage("");
        createdMessages.forEach((m) => socketInstance?.emit("new message", m));

        setMessages((prev) => [
          ...prev,
          ...createdMessages
            .filter((m) => !prev.some((p) => p._id === m._id))
            .map((m) => ({ ...m, decrypted: newMessage })),
        ]);
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
      if (timeNow - lastTypingTime >= timerLength && typing) {
        socket.emit("stop typing", selectedChat._id);
        setTyping(false);
      }
    }, timerLength);
  };

  return (
    <>
      {selectedChat ? (
        <div className="singlechat-container">
          <div className="chat-header">
            <div className="chat-header-left">
              <button className="back-button" onClick={() => setSelectedChat("")}>
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

          <div className="messages-container">
            {loading ? (
              <div className="messages-loading">
                <Spinner size="xl" color="#00a88e" />
              </div>
            ) : (
              <ScrollableChat messages={messages} />
            )}
            {istyping && (
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            )}
          </div>

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
                onClick={(e) => sendMessage({ ...e, key: "Enter", type: "click" })}
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
          <div className="empty-chat-text">Click on a user to start chatting</div>
        </div>
      )}
    </>
  );
};

export default SingleChat;
