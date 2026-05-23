const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs-extra');
const path = require('path');

const app = express();

// O Render define a porta automaticamente através de variáveis de ambiente
const PORT = process.env.PORT || 3000; 

const JWT_SECRET = process.env.JWT_SECRET || 'LacoVital_Secret_Key_2026_Secure_Hash';

// Ajustado para garantir compatibilidade com os Discos Persistentes do Render
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_FILE = path.join(DATA_DIR, 'database.json');

app.use(cors());
app.use(express.json());

// Diz ao Express para servir seus arquivos visuais (HTML, CSS, JS) da pasta public
app.use(express.static(path.join(__dirname, 'public')));

let db = { idosos: [], checkins: [], agenda: [] };

async function initDB() {
  try {
    if (await fs.pathExists(DB_FILE)) {
      db = await fs.readJson(DB_FILE);
    } else {
      const salt = await bcrypt.genSalt(10);
      const senhaAdminHash = await bcrypt.hash('123456', salt);
      const senhaIdosoHash = await bcrypt.hash('123456', salt);

      db.idosos.push({
        id: 'default_idoso',
        nome: 'Residente Demonstrativo',
        idade: 78,
        quarto: 'Quarto 102-A',
        email: 'idoso@laco.com',
        senha: senhaIdosoHash
      });
      await saveDB();
    }
  } catch (err) {
    console.error('Falha crítica ao inicializar persistência local:', err);
  }
}

async function saveDB() {
  await fs.writeJson(DB_FILE, db, { spaces: 2 });
}

function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ mensagem: "Token de acesso ausente." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ mensagem: "Sessão inválida ou expirada." });
    req.user = user;
    next();
  });
}

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ mensagem: "Preencha todos os campos." });
  }

  try {
    if (email === 'admin@laco.com' && password === '123456') {
      const token = jwt.sign({ email: 'admin@laco.com', role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
      return res.json({ token, user: { email: 'admin@laco.com', role: 'admin' } });
    }

    const idoso = db.idosos.find(i => i.email === email);
    if (!idoso) {
      return res.status(400).json({ mensagem: "Credenciais incorretas ou usuário instruído inexistente." });
    }

    const senhaValida = await bcrypt.compare(password, idoso.senha);
    if (!senhaValida) {
      return res.status(400).json({ mensagem: "Credenciais incorretas." });
    }

    const token = jwt.sign({ id: idoso.id, email: idoso.email, role: 'idoso' }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token, user: { id: idoso.id, email: idoso.email, role: 'idoso', nome: idoso.nome } });
  } catch (error) {
    res.status(500).json({ mensagem: "Erro interno no servidor." });
  }
});

app.get('/api/idosos', autenticarToken, (req, res) => {
  res.json(db.idosos);
});

app.post('/api/idosos', autenticarToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ mensagem: "Acesso restrito ao administrador." });
  }

  const { nome, idade, quarto, email, senha } = req.body;
  if (!nome || !idade || !email || !senha) {
    return res.status(400).json({ mensagem: "Campos obrigatórios ausentes." });
  }

  if (db.idosos.some(i => i.email === email)) {
    return res.status(400).json({ mensagem: "Este e-mail já está cadastrado no sistema." });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);

    const novoIdoso = {
      id: String(Date.now()),
      nome,
      idade: parseInt(idade, 10),
      quarto: quarto || "Não especificado",
      email,
      senha: senhaHash
    };

    db.idosos.push(novoIdoso);
    await saveDB();
    
    const { senha: _, ...idosoExposto } = novoIdoso;
    res.status(201).json(idosoExposto);
  } catch (err) {
    res.status(500).json({ mensagem: "Erro ao salvar residente." });
  }
});

app.delete('/api/idosos/:id', autenticarToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ mensagem: "Acesso não autorizado." });
  }

  const { id } = req.params;
  const index = db.idosos.findIndex(i => String(i.id) === String(id));

  if (index !== -1) {
    db.idosos.splice(index, 1);
    db.agenda = db.agenda.filter(a => String(a.idosoId) !== String(id));
    db.checkins = db.checkins.filter(c => String(c.idosoId) !== String(id));
    await saveDB();
    return res.json({ sucesso: true, message: "Registro removido com sucesso." });
  }
  res.status(404).json({ mensagem: "Residente não encontrado." });
});

app.get('/api/checkins', autenticarToken, (req, res) => {
  res.json(db.checkins);
});

app.post('/api/checkins', autenticarToken, async (req, res) => {
  const { idosoId, humorDia, alimentacao, interacaoSocial, visitas, observacoes } = req.body;
  
  if (!idosoId) {
    return res.status(400).json({ mensagem: "Identificação do idoso obrigatória." });
  }

  const novoCheckin = {
    id: String(Date.now()),
    data: new Date().toISOString(),
    idosoId,
    humorDia,
    alimentacao,
    interacaoSocial,
    visitas,
    observacoes
  };
  
  db.checkins.unshift(novoCheckin);
  await saveDB();
  res.status(201).json(novoCheckin);
});

app.post('/api/checkins/rapido', autenticarToken, async (req, res) => {
  const idosoIdEfetivo = req.user.id || 'default_idoso';
  
  const novoCheckinRapido = {
    id: String(Date.now()),
    idosoId: idosoIdEfetivo,
    data: new Date().toISOString(),
    humorDia: req.body.humorDia,
    alimentacao: "Autoavaliação",
    interacaoSocial: "Autoavaliação",
    visitas: "Não avaliado",
    observacoes: ""
  };

  db.checkins.unshift(novoCheckinRapido);
  await saveDB();
  res.status(201).json(novoCheckinRapido);
});

app.post('/api/checkins/relato', autenticarToken, async (req, res) => {
  try {
    const idosoIdEfetivo = req.user.id || 'default_idoso';
    const { observacaoIdoso } = req.body;

    const ultimoCheckin = db.checkins.find(c => String(c.idosoId) === String(idosoIdEfetivo));
    
    if (ultimoCheckin) {
      ultimoCheckin.observacoes = observacaoIdoso;
    } else {
      db.checkins.unshift({
        id: String(Date.now()),
        idosoId: idosoIdEfetivo,
        data: new Date().toISOString(),
        humorDia: "Bem",
        alimentacao: "Autoavaliação",
        interacaoSocial: "Autoavaliação",
        visitas: "Não avaliado",
        observacoes: observacaoIdoso
      });
    }
    
    await saveDB();
    return res.json({ sucesso: true, mensagem: "Relato salvo com sucesso." });
  } catch (error) {
    return res.status(500).json({ mensagem: "Erro ao salvar relato." });
  }
});

app.get('/api/agenda', autenticarToken, (req, res) => {
  res.json(db.agenda);
});

app.post('/api/agenda', autenticarToken, async (req, res) => {
  const novaTarefa = {
    id: String(Date.now()),
    ...req.body,
    concluido: false
  };
  db.agenda.push(novaTarefa);
  await saveDB();
  res.status(201).json(novaTarefa);
});

app.patch('/api/agenda/:id/status', autenticarToken, async (req, res) => {
  const { id } = req.params;
  const tarefa = db.agenda.find(t => String(t.id) === String(id));
  if (tarefa) {
    tarefa.concluido = !tarefa.concluido;
    await saveDB();
    return res.json(tarefa);
  }
  res.status(404).json({ mensagem: "Tarefa não localizada." });
});

app.delete('/api/agenda/:id', autenticarToken, async (req, res) => {
  const { id } = req.params;
  const index = db.agenda.findIndex(a => String(a.id) === String(id));

  if (index !== -1) {
    db.agenda.splice(index, 1);
    await saveDB();
    return res.json({ sucesso: true, mensagem: "Agendamento removido com sucesso." });
  }
  res.status(404).json({ mensagem: "Compromisso não localizado." });
});

// Rota "coringa" para garantir que qualquer link digitado abra o app visual
app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// MODIFICAÇÃO AQUI: Adicionado '0.0.0.0' para aceitar conexões vindas da internet externa no Render
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`Servidor rodando na porta ${PORT}`));
});