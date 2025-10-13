import { Button } from "@chakra-ui/button";
import { FormControl, FormLabel } from "@chakra-ui/form-control";
import { Input, InputGroup, InputRightElement } from "@chakra-ui/input";
import { VStack } from "@chakra-ui/layout";
import { useState } from "react";
import axios from "axios";
import { useToast } from "@chakra-ui/react";
import { useHistory } from "react-router-dom";
import { ChatState } from "../../Context/ChatProvider";

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

  const history = useHistory();
  const { setUser } = ChatState();

  const submitHandler = async () => {
    setLoading(true);
    if (!email || !password) {
      toast({
        title: "Please Fill all the Feilds",
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

      const encryptedPrivateKeyJson = localStorage.getItem(`${data.name}_privateKey`);
        if (!encryptedPrivateKeyJson) {
          toast({
          title: "Private Key Not Found",
          description: "Please sign up again to generate encryption keys.",
          status: "error",
          duration: 8000,
          isClosable: true,
          position: "bottom",
        });
        setLoading(false);
        return;
      }

      const encryptedPrivateKey = JSON.parse(encryptedPrivateKeyJson);

      // Descriptografa a chave privada com a senha
      let privateKey;
      try {
      privateKey = await decryptPrivateKey(encryptedPrivateKey, password);
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
      title: "Login Successful",
      status: "success",
      duration: 5000,
      isClosable: true,
      position: "bottom",
      });

      // Guarda o usuário e a chave descriptografada na memória
      setUser({ ...data, privateKey });

      if (data.publicKey) {
        const publicKey = await crypto.subtle.importKey(
          "spki",
          Uint8Array.from(atob(data.publicKey), c => c.charCodeAt(0)),
          { name: "RSA-OAEP", hash: "SHA-256" },
          true,
          ["encrypt"]
        );
        setUser({ ...data, privateKey, publicKey });
      }

      localStorage.setItem("userInfo", JSON.stringify(data));
      setLoading(false);
      history.push("/chats");
      } catch (error) {
        toast({
          title: "Error Occurred!",
          description: error.response?.data?.message || "Login failed",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom",
        });
        setLoading(false);
      }
    };

  const handleGuestLogin = () => {
    setEmail("guest@example.com");
    setPassword("123456");
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

      <button
        className="btn btn-primary"
        onClick={submitHandler}
        disabled={loading}
      >
        {loading && <span className="spinner"></span>}
        Login
      </button>
    </>
  );
};

export default Login;