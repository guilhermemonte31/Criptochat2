import { AddIcon } from "@chakra-ui/icons";
import { useToast } from "@chakra-ui/toast";
import axios from "axios";
import { useEffect, useState } from "react";
import { getSender } from "../config/ChatLogics";
import ChatLoading from "./ChatLoading";
import GroupChatModal from "./miscellaneous/GroupChatModal";
import { Avatar } from "@chakra-ui/react";
import { ChatState } from "../Context/ChatProvider";
import "./MyChats.css";

const MyChats = ({ fetchAgain }) => {
  const [loggedUser, setLoggedUser] = useState();
  const [availableUsers, setAvailableUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [activeTab, setActiveTab] = useState("chats"); // Adicionar estado para controlar a aba ativa

  const { selectedChat, setSelectedChat, user, chats, setChats } = ChatState();

  const toast = useToast();

  const fetchChats = async () => {
    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };

      const { data } = await axios.get("/api/chat", config);
      setChats(data);
    } catch (error) {
      toast({
        title: "Error Occurred!",
        description: "Failed to Load the chats",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom-left",
      });
    }
  };

  const fetchAvailableUsers = async () => {
    try {
      setLoadingUsers(true);
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };

      const { data } = await axios.get("/api/user", config);
      setAvailableUsers(data);
      setLoadingUsers(false);
    } catch (error) {
      toast({
        title: "Error Occurred!",
        description: "Failed to Load available users",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom-left",
      });
      setLoadingUsers(false);
    }
  };

  const accessChat = async (userId) => {
    try {
      const config = {
        headers: {
          "Content-type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      };
      const { data } = await axios.post(`/api/chat`, { userId }, config);

      if (!chats.find((c) => c._id === data._id)) setChats([data, ...chats]);
      setSelectedChat(data);

      toast({
        title: "Chat Started!",
        status: "success",
        duration: 3000,
        isClosable: true,
        position: "bottom",
      });
    } catch (error) {
      toast({
        title: "Error fetching the chat",
        description: error.message,
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom-left",
      });
    }
  };

  useEffect(() => {
    setLoggedUser(JSON.parse(localStorage.getItem("userInfo")));
    fetchChats();
    fetchAvailableUsers();
    // eslint-disable-next-line
  }, [fetchAgain]);

  return (
    <div className="mychats-container">
      {/* Header */}
      <div className="mychats-header">
        <h2 className="mychats-title">My Chats</h2>
        <GroupChatModal>
          <button className="new-group-btn">
            <AddIcon />
            <span>New Group</span>
          </button>
        </GroupChatModal>
      </div>

      {/* Tabs */}
      <div className="chats-tabs">
        <div className="tabs-list">
          <button
            className={`tab-btn ${activeTab === "chats" ? "active" : ""}`}
            onClick={() => setActiveTab("chats")}
          >
            Chats ({chats ? chats.length : 0})
          </button>
          <button
            className={`tab-btn ${activeTab === "users" ? "active" : ""}`}
            onClick={() => setActiveTab("users")}
          >
            Users ({availableUsers.length})
          </button>
        </div>
      </div>

      {/* Lista de Chats/Usuários */}
      <div className="chats-list-container">
        {activeTab === "chats" ? (
          // Aba de Chats
          <>
            {chats && chats.length > 0 ? (
              chats.map((chat) => (
                <div
                  key={chat._id}
                  className={`chat-item ${
                    selectedChat === chat ? "active" : ""
                  }`}
                  onClick={() => setSelectedChat(chat)}
                >
                  <div className="chat-avatar">
                    {!chat.isGroupChat
                      ? getSender(loggedUser, chat.users)?.[0]?.toUpperCase()
                      : chat.chatName[0]?.toUpperCase()}
                  </div>
                  <div className="chat-info">
                    <div className="chat-name">
                      {!chat.isGroupChat
                        ? getSender(loggedUser, chat.users)
                        : chat.chatName}
                    </div>
                    {chat.latestMessage && (
                      <div className="chat-last-message">
                        <b>{chat.latestMessage.sender.name}: </b>
                        {chat.latestMessage.content.length > 40
                          ? chat.latestMessage.content.substring(0, 41) + "..."
                          : chat.latestMessage.content}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                No chats yet. Go to Users tab to start a conversation!
              </div>
            )}
          </>
        ) : (
          // Aba de Usuários
          <>
            {loadingUsers ? (
              <ChatLoading />
            ) : availableUsers.length > 0 ? (
              availableUsers.map((availableUser) => (
                <div
                  key={availableUser._id}
                  className="chat-item"
                  onClick={() => accessChat(availableUser._id)}
                >
                  <Avatar
                    size="sm"
                    name={availableUser.name}
                    src={availableUser.pic}
                    className="chat-avatar"
                  />
                  <div className="chat-info">
                    <div className="chat-name">{availableUser.name}</div>
                    <div className="chat-last-message">
                      {availableUser.email}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No users available</div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MyChats;
