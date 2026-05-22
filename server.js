const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'CHAVE_ULTRA_SECRETA_LACO';

let idosos = [
  { id: "1", nome: "Ana Oliveira", idade: 79, quarto: "101A", email: "ana@laco.com", senha: "123" },
  { id: "2", nome: "Carlos Souza", idade: 82, quarto: "202B", email: "carlos@laco.com", senha: "123" }
];

let checkins = [
  { idosoId: "1", data: new Date().toISOString(), humorDia: "Bem", alimentacao: "Completa", interacaoSocial: "Regular", observacoes: "" }
];

let agendaEventos = [
  { id: "101", idosoId: "1", tipo: "Medicamento", descricao: "Vitamina D", data: "2026-05-25", hora: "08:00", concluido: false }
];

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

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (email === 'admin@laco.com' && password === 'admin123') {
    const token = jwt.sign({ email, role: 'admin' }, JWT_SECRET);
    return res.json({ token, user: { email, role: 'admin' } });
  }

  const idoso = idosos.find(i => i.email === email && i.senha === password);
  if (idoso) {
    const token = jwt.sign({ email: idoso.email, id: idoso.id, role: 'idoso' }, JWT_SECRET);
    return res.json({ token, user: { email: idoso.email, id: idoso.id, role: 'idoso' } });
  }

  res.status(400).json({ mensagem: "E-mail ou senha incorretos!" });
});

app.get('/api/idosos', autenticarToken, (req, res) => { res.json(idosos); });

app.post('/api/idosos', autenticarToken, (req, res) => {
  const { nome, idade, quarto, email, senha } = req.body;
  const novoIdoso = { id: String(Date.now()), nome, idade, quarto, email, senha };
  idosos.push(novoIdoso);
  res.status(201).json(novoIdoso);
});

app.delete('/api/idosos/:id', autenticarToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ mensagem: "Acesso restrito" });
  const { id } = req.params;
  const index = idosos.findIndex(i => i.id === id);
  if (index !== -1) {
    idosos.splice(index, 1);
    checkins = checkins.filter(c => c.idosoId !== id);
    agendaEventos = agendaEventos.filter(e => e.idosoId !== id);
    return res.json({ sucesso: true });
  }
  res.status(404).json({ mensagem: "Não encontrado" });
});

app.get('/api/checkins', autenticarToken, (req, res) => { res.json(checkins); });

app.post('/api/checkins', autenticarToken, (req, res) => {
  const log = { ...req.body, data: new Date().toISOString() };
  checkins.unshift(log);
  res.json({ sucesso: true });
});

app.post('/api/checkins/rapido', autenticarToken, (req, res) => {
  if (req.user.role !== 'idoso') return res.status(403).json({ message: "Negado" });
  const log = {
    idosoId: req.user.id,
    data: new Date().toISOString(),
    humorDia: req.body.humorDia,
    alimentacao: "Informado pelo próprio",
    interacaoSocial: "Regular",
    observacoes: ""
  };
  checkins.unshift(log);
  res.json({ sucesso: true });
});

app.post('/api/checkins/relato', autenticarToken, (req, res) => {
  if (req.user.role !== 'idoso') return res.status(403).json({ mensagem: "Restrito" });
  const ultimoCheckin = checkins.find(c => c.idosoId === req.user.id);
  if (ultimoCheckin) {
    ultimoCheckin.observacoes = req.body.observacaoIdoso;
    return res.json({ sucesso: true });
  }
  res.status(400).json({ mensagem: "Nenhum log recente." });
});

app.get('/api/agenda', autenticarToken, (req, res) => { res.json(agendaEventos); });

app.post('/api/agenda', autenticarToken, (req, res) => {
  const { idosoId, tipo, descricao, data, hora } = req.body;
  const novoEvento = { id: String(Date.now()), idosoId, tipo, descricao, data, hora, concluido: false };
  agendaEventos.push(novoEvento);
  res.status(201).json(novoEvento);
});

app.patch('/api/agenda/:id/status', autenticarToken, (req, res) => {
  const { id } = req.params;
  const evento = agendaEventos.find(e => e.id === id);
  if (evento) {
    evento.concluido = !evento.concluido;
    return res.json({ sucesso: true, concluido: evento.concluido });
  }
  res.status(404).json({ mensagem: "Não encontrado" });
});

app.listen(3000, () => console.log('Servidor Central Laço rodando na porta 3000'));