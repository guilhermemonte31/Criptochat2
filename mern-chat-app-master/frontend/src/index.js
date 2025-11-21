import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { ChakraProvider, extendTheme } from "@chakra-ui/react";
import ChatProvider from "./Context/ChatProvider";
import { BrowserRouter } from "react-router-dom";
import "./chakra-override.css";

// Tema customizado com cores escuras e z-index corrigido
const theme = extendTheme({
  colors: {
    brand: {
      50: "#e6f7f5",
      100: "#b3e8e0",
      200: "#80d9cb",
      300: "#4dcab6",
      400: "#1abba1",
      500: "#00a88e",
      600: "#008a73",
      700: "#006b58",
      800: "#004d3e",
      900: "#002e23",
    },
    navy: {
      50: "#e8eaf6",
      100: "#c5cbe9",
      200: "#a1abdc",
      300: "#7e8ccf",
      400: "#5a6dc2",
      500: "#374ea8",
      600: "#2d3e86",
      700: "#232f65",
      800: "#192044",
      900: "#0f1123",
    },
  },
  config: {
    initialColorMode: "dark",
    useSystemColorMode: false,
  },
  styles: {
    global: {
      body: {
        bg: "navy.900",
        color: "white",
      },
    },
  },
  // IMPORTANTE: Definir z-index para os componentes
  zIndices: {
    hide: -1,
    auto: "auto",
    base: 0,
    docked: 10,
    dropdown: 1000,
    sticky: 1100,
    banner: 1200,
    overlay: 1300,
    modal: 1400,
    popover: 1500,
    skipLink: 1600,
    toast: 1700,
    tooltip: 1800,
  },
});

ReactDOM.render(
  <ChakraProvider theme={theme}>
    <BrowserRouter>
      <ChatProvider>
        <App />
      </ChatProvider>
    </BrowserRouter>
  </ChakraProvider>,
  document.getElementById("root")
);

reportWebVitals();
