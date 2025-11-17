// Fluxo do codigo: submithandler (verifica os campos) -> sendverificationEmail (gera código e envia email) -> handleVerification (verifica se o código informado é o correto) -> finalRegister (cria chaves) -> registerUser (cria conta)

import { Button } from "@chakra-ui/button";
import { FormControl, FormLabel } from "@chakra-ui/form-control";
import { Input, InputGroup, InputRightElement } from "@chakra-ui/input";
import { VStack } from "@chakra-ui/layout";
import { useToast } from "@chakra-ui/toast";
import axios from "axios";
import { useState } from "react";
import { useHistory } from "react-router";
// Importações sugeridas para o modal do Chakra UI:
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure, // Hook para gerenciar o estado do modal
} from "@chakra-ui/react";

function clearOldPrivateKeys(currentUserName) {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.endsWith("_privateKey") && key !== `${currentUserName}_privateKey`) {
      localStorage.removeItem(key);
      i--; // ajusta o índice porque removemos um item
    }
  }
}

const Signup = () => {
  const [show, setShow] = useState(false);
  const handleClick = () => setShow(!show);
  const toast = useToast();
  const history = useHistory();

  // Estados existentes
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmpassword, setConfirmpassword] = useState("");
  const [password, setPassword] = useState("");
  const [pic, setPic] = useState();
  const [picLoading, setPicLoading] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [passwordLengthError, setPasswordLengthError] = useState(false);
  const [passwordCharError, setPasswordCharError] = useState(false);

  // === NOVOS ESTADOS PARA VERIFICAÇÃO DE EMAIL ===
  const { isOpen, onOpen, onClose } = useDisclosure(); // Gerencia o Modal
  const [verificationCode, setVerificationCode] = useState(""); // Código inserido pelo usuário
  const [generatedOtp, setGeneratedOtp] = useState(""); // Código OTP gerado (DEVE SER GERADO NO BACK-END)
  const [isVerifying, setIsVerifying] = useState(false); // Loading do botão de verificação
  // ===============================================

  // [ Funções auxiliares (arrayBufferToBase64, base64ToArrayBuffer, exportPublicKeyToPem, exportPrivateKeyBytes, deriveAesKey, encryptPrivateKey, decryptPrivateKey, isEmailValid, isPasswordStrong, postDetails) permanecem as mesmas ]

  // ... (coloque as funções auxiliares aqui: arrayBufferToBase64, base64ToArrayBuffer, exportPublicKeyToPem, exportPrivateKeyBytes, deriveAesKey, encryptPrivateKey, decryptPrivateKey, isEmailValid, isPasswordStrong, postDetails)

  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";

    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
  };

  const base64ToArrayBuffer = (b64) => {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
  };

  const exportPublicKeyToPem = async (publicKey) => {
    const spki = await window.crypto.subtle.exportKey("spki", publicKey);
    const b64 = arrayBufferToBase64(spki);
    const pem = `-----BEGIN PUBLIC KEY-----\n${b64
      .match(/.{1,64}/g)
      .join("\n")}\n-----END PUBLIC KEY-----`;

    return pem;
  };

  const exportPrivateKeyBytes = async (privateKey) => {
    return await window.crypto.subtle.exportKey("pkcs8", privateKey);
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
    const salt = Uint8Array.from(atob(encryptedData.salt), (c) =>
      c.charCodeAt(0)
    );
    const iv = Uint8Array.from(atob(encryptedData.iv), (c) => c.charCodeAt(0));
    const cipherBytes = Uint8Array.from(atob(encryptedData.cipher), (c) =>
      c.charCodeAt(0)
    );

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

  const isEmailValid = (email) => {
    // Regex simples para verificar formato de email (ex: user@domain.com)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Função de validação para a complexidade da senha
  const isPasswordStrong = (password) => {
    const isLengthValid = password.length >= 6;

    const hasLetter = /[a-zA-Z]/.test(password);

    const hasNumber = /[0-9]/.test(password);

    return { isLengthValid, hasLetter, hasNumber };
  };

  const postDetails = (pics) => {
    setPicLoading(true);
    if (pics === undefined) {
      toast({
        title: "Please Select an Image!",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      return;
    }
    console.log(pics);
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
          console.log(data.url.toString());
          setPicLoading(false);
        })
        .catch((err) => {
          console.log(err);
          setPicLoading(false);
        });
    } else {
      toast({
        title: "Please Select an Image!",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      setPicLoading(false);
      return;
    }
  };

  
  const registerUser = async (publicKeyPem, encryptedPrivate) => {
    try {
      const config = {
        headers: {
          "Content-type": "application/json",
        },
      };

      
      const { data } = await axios.post(
        "/api/user",
        {
          name,
          email,
          password,
          pic,
          publicKey: publicKeyPem,
        },
        config
      );
      data.rawPassword = password;
      

      
      clearOldPrivateKeys(name);

      
      localStorage.setItem(`${name}_privateKey`, JSON.stringify(encryptedPrivate));
      localStorage.setItem("userInfo", JSON.stringify(data));

      toast({
        title: "Registration Successful",
        status: "success",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });

      
      history.push("/chats");
    } catch (error) {
      toast({
        title: "Error Occured!",
        description: error.response?.data?.message || "Registration failed.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    } finally {
      setPicLoading(false);
      setIsVerifying(false);
      
    }
  };

  
  

  const finalRegister = async () => {
    setPicLoading(true);

    try {
      
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

      
      const publicKeyPem = await exportPublicKeyToPem(keyPair.publicKey);

      
      const privateKeyBytes = await exportPrivateKeyBytes(keyPair.privateKey);
      const encryptedPrivate = await encryptPrivateKey(privateKeyBytes, password);

      
      await registerUser(publicKeyPem, encryptedPrivate);
    } catch (error) {
      toast({
        title: "Key Generation Error!",
        description: "Failed to generate cryptographic keys.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      setPicLoading(false);
    }
  };

  const handleVerification = async () => {
    if (!verificationCode) {
      toast({
        title: "Please enter the code",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      return;
    }

    setIsVerifying(true);

    try {

      if (verificationCode === generatedOtp) {
        toast({
          title: "Email Verified Successfully!",
          status: "success",
          duration: 3000,
          isClosable: true,
          position: "bottom",
        });
        
        onClose(); 
        
        await finalRegister(); 
        
      } else {
        toast({
          title: "Invalid Verification Code",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom",
        });
      }
    } catch (error) {
      toast({
        title: "Verification Failed",
        description: error.response?.data?.message || "An error occurred during verification.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    } finally {
      setIsVerifying(false);
    }
    // --------------------------------------------------------
  };


  const sendVerificationEmail = async () => {
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(otp);
    
    try {
      
      console.log("Email to send OTP to: ", email, otp);
      const datateste = await axios.post("/api/user/checkemail", { email, otpcode: otp });
      console.log("Datateste: ", datateste);

      console.log(`[SIMULAÇÃO] Enviando OTP (${otp}) para: ${email}`);
      toast({
        title: "Verification code sent!",
        description: `Check your email: ${email}`,
        status: "info",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      onOpen(); 
    } catch (error) {
      toast({
        title: "Error sending email!",
        description: error.response?.data?.message || "Could not send verification email.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    }
  };


  const submitHandler = async () => {
    setPicLoading(true);

    
    let temErro = false;
    setEmailError(false);
    setPasswordLengthError(false);
    setPasswordCharError(false);

    if (!name || !email || !password || !confirmpassword) {
      toast({
        title: "Please Fill all the Feilds",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      setPicLoading(false);
      return;
    }

    if (!isEmailValid(email)) {
      toast({
        title: "Please enter a valid email address",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      setEmailError(true);
      temErro = true;
    }

    const passwordValidation = isPasswordStrong(password);
    if (!passwordValidation.isLengthValid) {
      toast({
        title: "Password must be at least 6 characters long",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      setPasswordLengthError(true);
      temErro = true;
    }
    if (!passwordValidation.hasLetter || !passwordValidation.hasNumber) {
      toast({
        title: "Password must contain at least one letter and one number",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      setPasswordCharError(true);
      temErro = true;
    }

    if (password !== confirmpassword) {
      toast({
        title: "Passwords Do Not Match",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      temErro = true;
    }
    
    if (temErro) {
      toast({
        title: "Validation Error",
        description: "Some fields are invalid.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      setPicLoading(false);
      return;
      
    }

    
    console.log("Todos os campos são válidos, iniciando verificação de e-mail.");
    await sendVerificationEmail(); 
    

    setPicLoading(false);
  };

  return (
    <>
    
      <div className="form-group">
        <label className="form-label">Nome *</label>
        <input
          className="form-input"
          placeholder="Digite seu nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Email *</label>
        <input
          className="form-input"
          type="email"
          placeholder="Digite seu Email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(false);
          }}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Senha *</label>
        <div className="input-with-button">
          <input
            className="form-input"
            type={show ? "text" : "password"}
            placeholder="Digite sua senha"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordLengthError(false);
              setPasswordCharError(false);
            }}
          />
          <button
            className="show-password-btn"
            onClick={handleClick}
            type="button"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Confirmar Senha *</label>
        <div className="input-with-button">
          <input
            className="form-input"
            type={show ? "text" : "password"}
            placeholder="Confirme sua senha"
            value={confirmpassword}
            onChange={(e) => setConfirmpassword(e.target.value)}
          />
          <button
            className="show-password-btn"
            onClick={handleClick}
            type="button"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Envie sua Foto</label>
        <div className="file-input-wrapper">
          <input
            type="file"
            id="pic-upload"
            accept="image/*"
            onChange={(e) => postDetails(e.target.files[0])}
          />
          <label htmlFor="pic-upload" className="file-input-label">
            {pic ? "Imagem Selecionada ✓" : "Escolher Arquivo"}
          </label>
        </div>
      </div>

      <button
        className="btn btn-signup"
        onClick={submitHandler}
        disabled={picLoading}
      >
        {picLoading && <span className="spinner"></span>}
        Sign Up
      </button>

      {/* === MODAL DE VERIFICAÇÃO DE EMAIL === */}
      {/* Usando componentes Chakra UI, que você importou, para um modal */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Verificação de Email</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <p style={{ marginBottom: "15px" }}>
              Um código de verificação foi enviado para: <br></br>{email}<br></br> Por favor, insira o
              código abaixo para completar seu registro.
            </p>
            <FormControl>
              <FormLabel>Código de Verificação</FormLabel>
              <Input
                placeholder="Digite o código de 6 dígitos"
                maxLength={6}
                onChange={(e) => setVerificationCode(e.target.value)}
                value={verificationCode}
              />
            </FormControl>
          </ModalBody>

          <ModalFooter>
            <Button
              colorScheme="blue"
              isLoading={isVerifying}
              onClick={handleVerification}
            >
              Confirmar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default Signup;