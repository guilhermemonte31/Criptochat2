const jwt = require("jsonwebtoken");
const chave = 'piyush'

const generateToken = (id) => {
  return jwt.sign({ id }, chave, {
    expiresIn: "30d",
  });
};

module.exports = generateToken;
