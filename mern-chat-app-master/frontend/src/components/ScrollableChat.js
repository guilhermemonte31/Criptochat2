import { Avatar } from "@chakra-ui/avatar";
import { Tooltip } from "@chakra-ui/tooltip";
import ScrollableFeed from "react-scrollable-feed";
import {
  isLastMessage,
  isSameSender,
  isSameSenderMargin,
  isSameUser,
} from "../config/ChatLogics";
import { ChatState } from "../Context/ChatProvider";

const ScrollableChat = ({ messages }) => {
  const { user } = ChatState();

  return (
    <ScrollableFeed>
      {messages &&
        messages.map((m, i) => (
          <div
            key={m._id}
            className={`message-wrapper ${
              m.sender._id === user._id ? "sent" : "received"
            }`}
          >
            {/* Avatar para mensagens recebidas */}
            {m.sender._id !== user._id &&
              (isSameSender(messages, m, i, user._id) ||
                isLastMessage(messages, i, user._id)) && (
                <Tooltip
                  label={m.sender.name}
                  placement="bottom-start"
                  hasArrow
                >
                  <Avatar
                    className="message-avatar"
                    name={m.sender.name}
                    src={m.sender.pic}
                    size="sm"
                  />
                </Tooltip>
              )}

            {/* Espaçamento quando não tem avatar */}
            {m.sender._id !== user._id &&
              !isSameSender(messages, m, i, user._id) &&
              !isLastMessage(messages, i, user._id) && (
                <div style={{ width: "40px" }}></div>
              )}

            {/* Bolha da mensagem */}
            <div className="message-bubble">{m.content}</div>
          </div>
        ))}
    </ScrollableFeed>
  );
};

export default ScrollableChat;
