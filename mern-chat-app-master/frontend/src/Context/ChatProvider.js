import React, { createContext, useContext, useEffect, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";

const ChatContext = createContext();

const ChatProvider = ({ children }) => {
  const [selectedChat, setSelectedChat] = useState();
  const [user, setUser] = useState();
  const [notification, setNotification] = useState([]);
  const [chats, setChats] = useState();

  const history = useHistory();
  const location = useLocation();

  // Rotas que NÃO exigem autenticação
  const publicRoutes = [
    "/reset-password",
    "/forgot-password",
    "/" // login é público também
  ];

  useEffect(() => {
    const userInfo = JSON.parse(localStorage.getItem("userInfo") || "null");
    setUser(userInfo);

    const isPublicRoute = publicRoutes.some(route =>
      location.pathname.startsWith(route)
    );

    if (!userInfo && !isPublicRoute) {
      console.log("No user, redirecting to login");
      history.push("/");
    }
  }, [history, location.pathname]);

  return (
    <ChatContext.Provider
      value={{
        selectedChat,
        setSelectedChat,
        user,
        setUser,
        notification,
        setNotification,
        chats,
        setChats,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const ChatState = () => {
  return useContext(ChatContext);
};

export default ChatProvider;
