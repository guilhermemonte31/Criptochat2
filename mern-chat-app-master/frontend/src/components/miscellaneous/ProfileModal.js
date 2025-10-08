import { ViewIcon } from "@chakra-ui/icons";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  useDisclosure,
  IconButton,
  Text,
  Image,
} from "@chakra-ui/react";
import "./UserProfileModal.css";

const ProfileModal = ({ user, children }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      {children ? (
        <span onClick={onOpen}>{children}</span>
      ) : (
        <IconButton
          display={{ base: "flex" }}
          icon={<ViewIcon />}
          onClick={onOpen}
          bg="transparent"
          color="#00a88e"
          _hover={{ bg: "rgba(0, 168, 142, 0.1)" }}
        />
      )}
      <Modal size="lg" onClose={onClose} isOpen={isOpen} isCentered>
        <ModalOverlay className="profile-modal-overlay" />
        <ModalContent className="profile-modal-content">
          <ModalHeader className="profile-modal-header">
            {user.name}
          </ModalHeader>
          <ModalCloseButton className="profile-modal-close" />
          <ModalBody className="profile-modal-body">
            <div className="profile-view-container">
              <Image
                borderRadius="full"
                boxSize="150px"
                src={user.pic}
                alt={user.name}
                className="profile-avatar-large"
              />
              <div className="profile-info">
                <Text className="profile-name">{user.name}</Text>
                <Text className="profile-email">Email: {user.email}</Text>
              </div>
            </div>
          </ModalBody>
          <ModalFooter className="profile-modal-footer">
            <button className="btn-close-modal" onClick={onClose}>
              Close
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default ProfileModal;
