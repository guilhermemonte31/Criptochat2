import { useState } from "react";
import axios from "axios";
import { useToast } from "@chakra-ui/react";
import { useHistory } from "react-router-dom";
import { ChatState } from "../../Context/ChatProvider";

import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter
} from "@chakra-ui/react";
import { FormControl, FormLabel, Input, Button } from "@chakra-ui/react";

// Função auxiliar para derivar a chave AES da senha
async function deriveAesKey(password, salt) {
  const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

// Função para descriptografar a chave privada armazenada
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


const Login = () => {
  const [show, setShow] = useState(false);
  const handleClick = () => setShow(!show);
  const toast = useToast();
  const [email, setEmail] = useState();
  const [password, setPassword] = useState();
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [loadingReset, setLoadingReset] = useState(false);

  const history = useHistory();
  const { setUser } = ChatState();

  const submitHandler = async () => {
    setLoading(true);
    if (!email || !password) {
      toast({
        title: "Por favor, preencha todos os campos.",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      setLoading(false);
      return;
    }

    try {
      const config = {
        headers: {
          "Content-type": "application/json",
        },
      };

      const { data } = await axios.post(
        "/api/user/login",
        { email, password },
        config
      );

      let encryptedPrivateKeyJson = null;
      let encryptedPrivateKey = null;

      if (encryptedPrivateKeyJson) {
        encryptedPrivateKey = JSON.parse(encryptedPrivateKeyJson);
      } else {
        // 2. Não existe localmente → usa o que vem do servidor
        encryptedPrivateKey = {
            cipher: data.encryptedPrivateKey,
            iv: data.encryptedPrivateKeyIV,
            salt: data.encryptedPrivateKeySalt,
        };

        // Opcional: salvar no localStorage como cache
        localStorage.setItem(`${data.name}_privateKey`, JSON.stringify(encryptedPrivateKey));
      }

      // Descriptografa a chave privada com a senha
      let privateKey;
      try {
        privateKey = await decryptPrivateKey(encryptedPrivateKey, password);
        console.log("superteste: ", privateKey);

        const privateKeyJwk = await crypto.subtle.exportKey("jwk", privateKey);

        sessionStorage.setItem("privateKeyJwk", JSON.stringify(privateKeyJwk));
        console.log("💾 Chave privada armazenada no SessionStorage.");

      } catch (e) {
        console.error("Decryption failed:", e);
        toast({
          description: `Falha ao descriptografar: ${e.message}`,
          status: "error",
          duration: 7000,
          isClosable: true,
          position: "bottom",
        });
        setLoading(false);
        return;
      }

      toast({
        title: "Login bem sucedido!",
        status: "success",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      // Guarda o usuário e a chave descriptografada na memória
      setUser({ ...data, privateKey });
      localStorage.setItem("userInfo", JSON.stringify(data));
      setLoading(false);
      history.push("/chats");
      } catch (error) {
        toast({
          title: "Erro!",
          description: error.response?.data?.message || "Login falhou.",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom",
        });
        setLoading(false);
      }
    };

  const handleForgotPassword = async () => {
    if (!resetEmail) {
      toast({
        title: "Informe seu e-mail.",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: "bottom",
      });
      return;
    }

    try {
      await axios.post("/api/user/request-password-reset", { email: resetEmail });

      toast({
        title: "Verifique seu e-mail",
        description: "Se houver uma conta com esse e-mail, enviaremos as instruções.",
        status: "success",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });

      setShowForgot(false);
    } catch (e) {
      toast({
        title: "Erro",
        description: "Falha ao solicitar redefinição.",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    }
  };

  return (
    <>
      <div className="form-group">
        <label className="form-label">Email Address *</label>
        <input
          className="form-input"
          type="email"
          placeholder="Enter Your Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Password *</label>
        <div className="input-with-button">
          <input
            className="form-input"
            type={show ? "text" : "password"}
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

      <div className="forgot-password">
        <span onClick={() => setShowForgot(true)}>
          Esqueceu a senha?
        </span>
      </div>

      <button
        className="btn btn-primary"
        onClick={submitHandler}
        disabled={loading}
      >
        {loading && <span className="spinner"></span>}
        Login
      </button>

      <Modal isOpen={showForgot} onClose={() => setShowForgot(false)} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Redefinir senha</ModalHeader>
          <ModalCloseButton />

          <ModalBody>
            <p style={{ marginBottom: "15px" }}>
              Digite seu e-mail para enviarmos o link de redefinição de senha.
            </p>

            <FormControl>
              <FormLabel>E-mail</FormLabel>
              <Input
                type="email"
                placeholder="Digite seu e-mail"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
            </FormControl>
          </ModalBody>

          <ModalFooter>
            <Button
              colorScheme="blue"
              mr={3}
              isLoading={loadingReset}
              onClick={handleForgotPassword}
            >
              Enviar
            </Button>

            <Button variant="ghost" onClick={() => setShowForgot(false)}>
              Cancelar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default Login;