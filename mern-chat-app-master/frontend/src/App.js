import "./App.css";
import Homepage from "./Pages/Homepage";
import { Route, Switch } from "react-router-dom";
import Chatpage from "./Pages/Chatpage";
import { ResetPassword } from "./Pages/ResetPassword";
import "./chakra-override.css";

function App() {
  return (
    <div className="App">
      <Switch>
        <Route path="/reset-password/:token" component={ResetPassword} />
        <Route path="/chats" component={Chatpage} />
        <Route path="/" component={Homepage} exact />
      </Switch>
    </div>
  );
}

export default App;