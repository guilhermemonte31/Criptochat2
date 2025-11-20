// ResetPassword.js
import { useState } from "react";
import {
  FormControl,
  FormLabel,
  Input,
  Button,
  useToast,
  Box,
} from "@chakra-ui/react";

import { useEffect } from "react";
import { useHistory, useParams, useLocation } from "react-router-dom";
import axios from "axios";

export function ResetPassword() {

  const { token } = useParams();
  const location = useLocation();

  useEffect(() => {
    console.log("ResetPassword mounted");
    console.log("location.pathname:", location.pathname);
    console.log("useParams token:", token);
  }, [token, location]);

  //const { token } = useParams(); // token vindo da URL
  const [newPassword, setNewPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const history = useHistory();

  const handleReset = async () => {
    if (!newPassword || !confirmPass) {
      toast({ title: "Por favor, preencha todos os campos.", status: "warning" });
      return;
    }

    if (newPassword !== confirmPass) {
      toast({ title: "As senhas não coincidem.", status: "error" });
      return;
    }

    setLoading(true);

    try {
      await axios.post(`/api/user/reset-password/${token}`, {
        password: newPassword,
      });

      toast({
        title: "Senha redefinida com sucesso!",
        status: "success",
        duration: 4000,
        isClosable: true,
      });

      history.push("/");
    } catch (error) {
      toast({
        title: "Erro ao redefinir senha",
        description: error.response?.data?.message,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }

    setLoading(false);
  };

  return (
    <Box
      maxW="400px"
      margin="40px auto"
      padding="25px"
      borderRadius="8px"
      boxShadow="md"
    >
      <h2 style={{ fontSize: "22px", marginBottom: "20px", textAlign: "center" }}>
        Redefinir Senha
      </h2>

      <FormControl mb={4}>
        <FormLabel>Nova senha</FormLabel>
        <Input
          type="password"
          placeholder="Digite a nova senha"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </FormControl>

      <FormControl mb={6}>
        <FormLabel>Confirmar nova senha</FormLabel>
        <Input
          type="password"
          placeholder="Confirme sua nova senha"
          value={confirmPass}
          onChange={(e) => setConfirmPass(e.target.value)}
        />
      </FormControl>

      <Button
        colorScheme="blue"
        width="100%"
        isLoading={loading}
        onClick={handleReset}
      >
        Redefinir senha
      </Button>
    </Box>
  );
}
