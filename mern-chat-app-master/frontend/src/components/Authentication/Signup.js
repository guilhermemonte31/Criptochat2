import { useToast } from "@chakra-ui/toast";
import axios from "axios";
import { useState } from "react";
import { useHistory } from "react-router";
const forge = require("node-forge");

const Signup = () => {
  const [show, setShow] = useState(false);
  const handleClick = () => setShow(!show);
  const toast = useToast();
  const history = useHistory();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmpassword, setConfirmpassword] = useState("");

  const submitHandler = async () => {
    if (!name || !email || !password || !confirmpassword) {
      toast({
        title: "Please Fill all the Fields",
        status: "warning",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
      return;
    }
    if (password !== confirmpassword) {
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
      const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
      const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);
      const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);

      console.log("** par de chaves gerado - chave publica enviada para o servidor: ", publicKeyPem);

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
          publicKey: publicKeyPem,
        },
        config
      );

      toast({
        title: "Registration Successful",
        status: "success",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });

      localStorage.setItem(`${name}_privateKey`, privateKeyPem);
      console.log("**chave privada armazenada no localstorage");
      localStorage.setItem("userInfo", JSON.stringify(data));
      history.push("/");
    } catch (error) {
      toast({
        title: "Error Occurred!",
        description: error.response?.data?.message || "Registration failed",
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
          onChange={(e) => setEmail(e.target.value)}
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


      <button
        className="btn btn-signup"
        onClick={submitHandler}
      >
        Sign Up
      </button>
    </>
  );
};

export default Signup;