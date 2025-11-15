import { Button } from "@chakra-ui/button";
import { FormControl, FormLabel } from "@chakra-ui/form-control";
import { Input, InputGroup, InputRightElement } from "@chakra-ui/input";
import { VStack } from "@chakra-ui/layout";
import { useToast } from "@chakra-ui/toast";
import axios from "axios";
import { useState } from "react";
import { useHistory } from "react-router";

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

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [publicKey, setPublicKey] = useState();
  const [privateKey, setPrivateKey] = useState();
  const [confirmpassword, setConfirmpassword] = useState("");
  const [password, setPassword] = useState("");
  const [pic, setPic] = useState();
  const [picLoading, setPicLoading] = useState(false);

  const [emailError, setEmailError] = useState(false);
  const [passwordLengthError, setPasswordLengthError] = useState(false);
  const [passwordCharError, setPasswordCharError] = useState(false);

    
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
    const pem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----`;

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
  // Pelo menos 6 caracteres
  const isLengthValid = password.length >= 6;
  // Pelo menos uma letra (maiuscula ou minuscula)
  const hasLetter = /[a-zA-Z]/.test(password);
  // Pelo menos um número
  const hasNumber = /[0-9]/.test(password);

  return { isLengthValid, hasLetter, hasNumber };
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

    if(!isEmailValid(email)) {
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
      return; // Para a execução se houver erros de validação
    }

    if (password !== confirmpassword) {
      toast({
        title: "Passwords Do Not Match",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      setPicLoading(false);
      return;
    }
    console.log("Todos os campos são válidos, continuando cadastro");
    console.log(name, email, password, pic);
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

      
      //ArrayBuffer -> base64 -> PEM (public + private)
      const spki = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
      const publicB64 = arrayBufferToBase64(spki);
      const publicPem = `-----BEGIN PUBLIC KEY-----\n${publicB64.match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----`;

      const pkcs8 = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
      const privateB64 = arrayBufferToBase64(pkcs8);
      const privatePem = `-----BEGIN PRIVATE KEY-----\n${privateB64.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`;

      console.log("=== PUBLIC KEY (PEM) ===\n", publicPem);
      console.log("=== PRIVATE KEY (PEM) ===\n", privatePem); 


      const publicKeyPem = await exportPublicKeyToPem(keyPair.publicKey);
      const privateKeyBytes = await exportPrivateKeyBytes(keyPair.privateKey);
      //console.log("[DEBUG] PRIVATECHAVE PRIVADA EM BYTES", privateKeyBytes);
      const encryptedPrivate = await encryptPrivateKey(privateKeyBytes, password);
      //console.log("[DEBUG] PRIVATECHAVE PRIVADA ENCRYPTED", encryptedPrivate);



      const testedecrypt = await decryptPrivateKey(encryptedPrivate, password);
      //console.log("[abc] TESTE DE DECRYPT DA PRIVATE KEY", testedecrypt);
      

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
      data.rawPassword = password; // Armazena a senha original para uso futuro

      clearOldPrivateKeys(name);

      localStorage.setItem(`${name}_privateKey`, JSON.stringify(encryptedPrivate));

      localStorage.setItem("userInfo", JSON.stringify(data));
      //console.log("[DEBUG] DATA RETORNADO NO SIGNUP:", data);

      console.log(data);
      toast({
        title: "Registration Successful",
        status: "success",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      //localStorage.setItem("superprivatekey", privateKey);

      setPicLoading(false);
      history.push("/chats");
      
    } catch (error) {
      toast({
        title: "Error Occured!",
        description: error.response.data.message,
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      setPicLoading(false);
    }
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

  return (
    <>
      <div className="form-group">
        <label className="form-label">Name *</label>
        <input
          className="form-input"
          placeholder="Enter Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Email Address *</label>
        <input
          className="form-input"
          type="email"
          placeholder="Enter Your Email Address"
          value={email}
          onChange={(e) => {setEmail(e.target.value); setEmailError(false);}
        }
        />
      </div>

      <div className="form-group">
        <label className="form-label">Password *</label>
        <div className="input-with-button">
          <input
            className="form-input"
            type={show ? "text" : "password"}
            placeholder="Enter Password"
            value={password}
            onChange={(e) => {setPassword(e.target.value); setPasswordLengthError(false); setPasswordCharError(false);}}
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
        <label className="form-label">Confirm Password *</label>
        <div className="input-with-button">
          <input
            className="form-input"
            type={show ? "text" : "password"}
            placeholder="Confirm password"
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
        <label className="form-label">Upload your Picture</label>
        <div className="file-input-wrapper">
          <input
            type="file"
            id="pic-upload"
            accept="image/*"
            onChange={(e) => postDetails(e.target.files[0])}
          />
          <label htmlFor="pic-upload" className="file-input-label">
            {pic ? "Image Selected ✓" : "Choose File"}
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
    </>
  );
};

export default Signup;