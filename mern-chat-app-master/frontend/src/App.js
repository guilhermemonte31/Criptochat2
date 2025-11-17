import "./App.css";
import Homepage from "./Pages/Homepage";
import { Route } from "react-router-dom";
import Chatpage from "./Pages/Chatpage";
import VerifyEmail from "./Pages/VerifyEmail";
import "./chakra-override.css";

function App() {
  return (
    <div className="App">
      <Route path="/" component={Homepage} exact />
      <Route path="/chats" component={Chatpage} />
      <Route path="/verify-email" component={VerifyEmail} />
    </div>
  );
}

export default App;