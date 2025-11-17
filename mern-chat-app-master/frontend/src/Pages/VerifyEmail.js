import { useEffect, useState } from "react";
import { useToast } from "@chakra-ui/react";
import axios from "axios";
import { useLocation, useHistory } from "react-router-dom";

export default function VerifyEmail() {
  const toast = useToast();
  const location = useLocation();
  const history = useHistory();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    const id = params.get("id");

    async function verify() {
      try {
        await axios.get(`/api/user/verify-email?token=${token}&id=${id}`);

        toast({
          title: "Email verificado!",
          description: "Agora você já pode fazer login.",
          status: "success",
          duration: 6000,
          isClosable: true,
          position: "bottom",
        });

        history.push("/");
      } catch (error) {
        toast({
          title: "Falha na verificação",
          description: error.response?.data?.message || "Token inválido",
          status: "error",
          duration: 7000,
          isClosable: true,
          position: "bottom",
        });

        history.push("/");
      } finally {
        setLoading(false);
      }
    }

    verify();
  }, [location, toast, history]);

  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      {loading ? <h2>Verificando seu e-mail...</h2> : <h2>Processando...</h2>}
    </div>
  );
}
