import { useState, useEffect } from "react";
import { useHistory, useLocation } from "react-router";
import Login from "../components/Authentication/Login";
import Signup from "../components/Authentication/Signup";
import "./Homepage.css";

function Homepage() {
  const history = useHistory();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("login");

  return (
    <div className="homepage-container">
      <div className="login-card">
        <h1 className="login-title">CriptoChat 2.0</h1>

        <div className="tabs-container">
          <button
            className={`tab-button ${activeTab === "login" ? "active" : ""}`}
            onClick={() => setActiveTab("login")}
          >
            Login
          </button>
          <button
            className={`tab-button ${activeTab === "signup" ? "active" : ""}`}
            onClick={() => setActiveTab("signup")}
          >
            Sign Up
          </button>
        </div>

        <div className="form-container">
          {activeTab === "login" ? <Login /> : <Signup />}
        </div>
      </div>
    </div>
  );
}

export default Homepage;