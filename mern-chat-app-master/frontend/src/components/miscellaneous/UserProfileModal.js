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
  FormControl,
  FormLabel,
  Input,
  useToast,
  VStack,
  Avatar,
  Text,
  Box,
  InputGroup,
  InputRightElement,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
} from "@chakra-ui/react";
import { useState, useRef } from "react";
import axios from "axios";
import { useHistory } from "react-router-dom";
import { ChatState } from "../../Context/ChatProvider";
import "./UserProfileModal.css";

const UserProfileModal = ({ children }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const cancelRef = useRef();
  const toast = useToast();
  const history = useHistory();
  const { user, setUser } = ChatState();

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pic, setPic] = useState(user.pic);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const handleClick = () => setShow(!show);

  const postDetails = (pics) => {
    setLoading(true);
    if (pics === undefined) {
      toast({
        title: "Please Select an Image!",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      setLoading(false);
      return;
    }

    if (pics.type === "image/jpeg" || pics.type === "image/png") {
      const data = new FormData();
      data.append("file", pics);
      data.append("upload_preset", "chat-app");
      data.append("cloud_name", "piyushproj");
      fetch("https://api.cloudinary.com/v1_1/piyushproj/image/upload", {
        method: "post",
        body: data,
      })
        .then((res) => res.json())
        .then((data) => {
          setPic(data.url.toString());
          setLoading(false);
        })
        .catch((err) => {
          console.log(err);
          setLoading(false);
        });
    } else {
      toast({
        title: "Please Select an Image!",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      setLoading(false);
    }
  };

  const submitHandler = async () => {
    if (password && password !== confirmPassword) {
      toast({
        title: "Passwords Do Not Match",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      return;
    }

    try {
      setLoading(true);
      const config = {
        headers: {
          "Content-type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
      };

      const updateData = {
        name,
        email,
        pic,
      };

      if (password) {
        updateData.password = password;
      }

      const { data } = await axios.put("/api/user/profile", updateData, config);

      toast({
        title: "Profile Updated Successfully",
        status: "success",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });

      setUser(data);
      localStorage.setItem("userInfo", JSON.stringify(data));

      if (user.name !== data.name) {
        const oldPrivateKey = localStorage.getItem(`${user.name}_privateKey`);
        if (oldPrivateKey) {
          localStorage.setItem(`${data.name}_privateKey`, oldPrivateKey);
          localStorage.removeItem(`${user.name}_privateKey`);
        }
      }

      setLoading(false);
      setIsEditing(false);
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast({
        title: "Error Occurred!",
        description:
          error.response?.data?.message || "Failed to update profile",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      setLoading(false);
    }
  };

  const deleteHandler = async () => {
    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };

      await axios.delete("/api/user/profile", config);

      toast({
        title: "Account Deleted Successfully",
        status: "success",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });

      localStorage.removeItem("userInfo");
      localStorage.removeItem(`${user.name}_privateKey`);

      history.push("/");
    } catch (error) {
      toast({
        title: "Error Occurred!",
        description:
          error.response?.data?.message || "Failed to delete account",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    }
  };

  const onDeleteClose = () => setIsDeleteOpen(false);

  return (
    <>
      <span onClick={onOpen}>{children}</span>

      <Modal size="lg" onClose={onClose} isOpen={isOpen} isCentered>
        <ModalOverlay className="profile-modal-overlay" />
        <ModalContent className="profile-modal-content">
          <ModalHeader className="profile-modal-header">My Profile</ModalHeader>
          <ModalCloseButton className="profile-modal-close" />
          <ModalBody className="profile-modal-body">
            {!isEditing ? (
              // View Mode
              <VStack spacing={6} className="profile-view-container">
                <Avatar
                  size="2xl"
                  name={user.name}
                  src={user.pic}
                  className="profile-avatar-large"
                />
                <Box textAlign="center" className="profile-info">
                  <Text className="profile-name">{user.name}</Text>
                  <Text className="profile-email">{user.email}</Text>
                </Box>
                <VStack spacing={3} w="100%">
                  <Button
                    className="profile-action-btn btn-edit"
                    onClick={() => setIsEditing(true)}
                    w="100%"
                  >
                    Edit Profile
                  </Button>
                  <Button
                    className="profile-action-btn btn-delete"
                    onClick={() => setIsDeleteOpen(true)}
                    w="100%"
                  >
                    Delete Account
                  </Button>
                </VStack>
              </VStack>
            ) : (
              // Edit Mode
              <VStack spacing={4} className="profile-edit-container">
                <Avatar
                  size="xl"
                  name={name}
                  src={pic}
                  className="profile-avatar-medium"
                />

                <FormControl className="form-control-profile">
                  <FormLabel className="form-label-profile">Name</FormLabel>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="form-input-profile"
                  />
                </FormControl>

                <FormControl className="form-control-profile">
                  <FormLabel className="form-label-profile">Email</FormLabel>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="form-input-profile"
                  />
                </FormControl>

                <FormControl className="form-control-profile">
                  <FormLabel className="form-label-profile">
                    New Password (leave blank to keep current)
                  </FormLabel>
                  <InputGroup className="input-group-profile">
                    <Input
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="form-input-profile"
                    />
                    <InputRightElement className="input-right-element-profile">
                      <Button
                        h="1.75rem"
                        size="sm"
                        onClick={handleClick}
                        className="show-password-profile"
                      >
                        {show ? "Hide" : "Show"}
                      </Button>
                    </InputRightElement>
                  </InputGroup>
                </FormControl>

                {password && (
                  <FormControl className="form-control-profile">
                    <FormLabel className="form-label-profile">
                      Confirm New Password
                    </FormLabel>
                    <InputGroup className="input-group-profile">
                      <Input
                        type={show ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="form-input-profile"
                      />
                      <InputRightElement className="input-right-element-profile">
                        <Button
                          h="1.75rem"
                          size="sm"
                          onClick={handleClick}
                          className="show-password-profile"
                        >
                          {show ? "Hide" : "Show"}
                        </Button>
                      </InputRightElement>
                    </InputGroup>
                  </FormControl>
                )}

                <FormControl className="form-control-profile">
                  <FormLabel className="form-label-profile">
                    Update Profile Picture
                  </FormLabel>
                  <Input
                    type="file"
                    p={1.5}
                    accept="image/*"
                    onChange={(e) => postDetails(e.target.files[0])}
                    className="file-input-profile"
                  />
                </FormControl>

                <VStack spacing={3} w="100%">
                  <Button
                    className="profile-action-btn btn-save"
                    onClick={submitHandler}
                    isLoading={loading}
                    w="100%"
                  >
                    Save Changes
                  </Button>
                  <Button
                    className="profile-action-btn btn-cancel"
                    onClick={() => {
                      setIsEditing(false);
                      setName(user.name);
                      setEmail(user.email);
                      setPic(user.pic);
                      setPassword("");
                      setConfirmPassword("");
                    }}
                    w="100%"
                  >
                    Cancel
                  </Button>
                </VStack>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter className="profile-modal-footer">
            <Button onClick={onClose} className="btn-close-modal">
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        isOpen={isDeleteOpen}
        leastDestructiveRef={cancelRef}
        onClose={onDeleteClose}
      >
        <AlertDialogOverlay className="alert-dialog-overlay">
          <AlertDialogContent className="alert-dialog-content">
            <AlertDialogHeader className="alert-dialog-header">
              Delete Account
            </AlertDialogHeader>

            <AlertDialogBody className="alert-dialog-body">
              Are you sure you want to delete your account? This action cannot
              be undone. All your chats and messages will be permanently
              deleted.
            </AlertDialogBody>

            <AlertDialogFooter className="alert-dialog-footer">
              <Button
                ref={cancelRef}
                onClick={onDeleteClose}
                className="btn-alert-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={deleteHandler}
                className="btn-alert-delete"
                ml={3}
              >
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  );
};

export default UserProfileModal;
