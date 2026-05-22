const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'CHAVE_ULTRA_SECRETA_LACO';

// Banco de Dados em Memória Compartilhada (Acesso Centralizado)
let idosos = [
  { id: "1", nome: "Ana Oliveira", idade: 79, quarto: "101A", email: "ana@laco.com", senha: "123" },
  { id: "2", nome: "Carlos Souza", idade: 82, quarto: "202B", email: "carlos@laco.com", senha: "123" }
];

let checkins = [
  { idosoId: "1", data: new Date().toISOString(), humorDia: "Bem", alimentacao: "Completa", interacaoSocial: "Regular" }
];

// --- Middleware de Proteção de Token ---
function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ mensagem: "Acesso negado" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ mensagem: "Sessão inválida" });
    req.user = user;
    next();
  });
}

// --- ROTAS DA API ---

// 1. Endpoint de Login Real
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  // Login de Administrador Padrão
  if (email === 'admin@laco.com' && password === 'admin123') {
    const token = jwt.sign({ email, role: 'admin' }, JWT_SECRET);
    return res.json({ token, user: { email, role: 'admin' } });
  }

  // Login Dinâmico de Idosos Cadastrados no Sistema
  const idoso = idosos.find(i => i.email === email && i.senha === password);
  if (idoso) {
    const token = jwt.sign({ email: idoso.email, id: idoso.id, role: 'idoso' }, JWT_SECRET);
    return res.json({ token, user: { email: idoso.email, id: idoso.id, role: 'idoso' } });
  }

  res.status(400).json({ mensagem: "E-mail ou senha incorretos!" });
});

// 2. Buscar Lista de Idosos (Apenas Admin)
app.get('/api/idosos', autenticarToken, (req, res) => {
  res.json(idosos);
});

// 3. Cadastrar Idoso (Apenas Admin)
app.post('/api/idosos', autenticarToken, (req, res) => {
  const { nome, idade, quarto, email, senha } = req.body;
  const novoIdoso = { id: String(Date.now()), nome, idade, quarto, email, senha };
  idosos.push(novoIdoso);
  res.status(21).json(novoIdoso);
});

// 4. Buscar Todos os Check-ins (Apenas Admin)
app.get('/api/checkins', autenticarToken, (req, res) => {
  res.json(checkins);
});

// 5. Registrar Check-in Técnico de Evolução (Admin)
app.post('/api/checkins', autenticarToken, (req, res) => {
  const log = { ...req.body, data: new Date().toISOString() };
  checkins.unshift(log);
  res.json({ sucesso: true });
});

// 6. Enviar Status pelo próprio Idoso (Aperto de botão grande na tela dele)
app.post('/api/checkins/rapido', autenticarToken, (req, res) => {
  if (req.user.role !== 'idoso') return res.status(403).json({ mensagem: "Acesso restrito" });
  
  const log = {
    idosoId: req.user.id,
    data: new Date().toISOString(),
    humorDia: req.body.humorDia,
    alimentacao: "Informado pelo próprio",
    interacaoSocial: "Regular"
  };
  checkins.unshift(log);
  res.json({ sucesso: true });
});

app.listen(3000, () => console.log('Servidor Central Laço rodando na porta 3000'));