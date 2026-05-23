const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const mongoose = require('mongoose'); // Importação do Mongoose para o MongoDB

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'LacoVital_Secret_Key_2026_Secure_Hash';
const MONGODB_URI = process.env.MONGODB_URI; // Sua variável de ambiente da Vercel

app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do front-end na Vercel
app.use(express.static(path.join(process.cwd(), 'public')));

// ==========================================
// 1. CONEXÃO COM O BANCO DE DADOS (MONGODB)
// ==========================================
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("Conectado ao MongoDB com sucesso!");
    initDBInDatabase(); // Inicializa os dados demonstrativos no banco real
  })
  .catch(err => console.error("Erro crítico ao conectar ao MongoDB:", err));

// ==========================================
// 2. DEFINIÇÃO DOS MODELOS (SCHEMAS)
// ==========================================

const IdosoSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  idade: { type: Number, required: true },
  quarto: { type: String, default: "Não especificado" },
  email: { type: String, required: true, unique: true },
  senha: { type: String, required: true }
});
const Idoso = mongoose.model('Idoso', IdosoSchema);

const CheckinSchema = new mongoose.Schema({
  data: { type: String, required: true },
  idosoId: { type: String, required: true },
  humorDia: { type: String },
  alimentacao: { type: String },
  interacaoSocial: { type: String },
  visitas: { type: String },
  observacoes: { type: String, default: "" }
});
const Checkin = mongoose.model('Checkin', CheckinSchema);

const AgendaSchema = new mongoose.Schema({
  idosoId: { type: String, required: true },
  titulo: { type: String, required: true },
  descricao: { type: String },
  data: { type: String },
  concluido: { type: Boolean, default: false }
});
const Agenda = mongoose.model('Agenda', AgendaSchema);

// ==========================================
// 3. INICIALIZADOR DE DADOS DEMONSTRATIVOS
// ==========================================
async function initDBInDatabase() {
  try {
    const totalIdosos = await Idoso.countDocuments();
    if (totalIdosos === 0) {
      const salt = bcrypt.genSaltSync(10);
      const senhaIdosoHash = bcrypt.hashSync('123456', salt);

      await Idoso.create({
        nome: 'Residente Demonstrativo',
        idade: 78,
        quarto: 'Quarto 102-A',
        email: 'idoso@laco.com',
        senha: senhaIdosoHash
      });
      console.log("Usuário idoso demonstrativo criado no MongoDB.");
    }
  } catch (error) {
    console.error("Erro ao inicializar dados demonstrativos:", error);
  }
}

// ==========================================
// 4. MIDDLEWARE DE AUTENTICAÇÃO (JWT)
// ==========================================
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

// ==========================================
// 5. ROTAS DA API
// ==========================================

// Autenticação / Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ mensagem: "Preencha todos os campos." });
  }

  try {
    // Login do Administrador (Fixo)
    if (email === 'admin@laco.com' && password === '123456') {
      const token = jwt.sign({ email: 'admin@laco.com', role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
      return res.json({ token, user: { email: 'admin@laco.com', role: 'admin' } });
    }

    // Login do Idoso buscando no MongoDB
    const idoso = await Idoso.findOne({ email });
    if (!oso) {
      return res.status(400).json({ mensagem: "Credenciais incorretas ou usuário instruído inexistente." });
    }

    const senhaValida = await bcrypt.compare(password, idoso.senha);
    if (!senhaValida) {
      return res.status(400).json({ mensagem: "Credenciais incorretas." }); // Corrigido a chave de retorno para 'mensagem'
    }

    const token = jwt.sign({ id: idoso._id, email: idoso.email, role: 'idoso' }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token, user: { id: idoso._id, email: idoso.email, role: 'idoso', nome: idoso.nome } });
  } catch (error) {
    res.status(500).json({ mensagem: "Erro interno no servidor ao tentar logar." });
  }
});

// Listar Idosos
app.get('/api/idosos', autenticarToken, async (req, res) => {
  try {
    const idosos = await Idoso.find().select('-senha'); // Retorna todos exceto o campo senha
    res.json(idosos);
  } catch (error) {
    res.status(500).json({ mensagem: "Erro ao buscar residentes." });
  }
});

// Cadastrar Novo Idoso
app.post('/api/idosos', autenticarToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ mensagem: "Acesso restrito ao administrador." });
  }

  const { nome, idade, quarto, email, senha } = req.body;
  if (!nome || !idade || !email || !senha) {
    return res.status(400).json({ mensagem: "Campos obrigatórios ausentes." });
  }

  try {
    const idosoExiste = await Idoso.findOne({ email });
    if (idosoExiste) {
      return res.status(400).json({ mensagem: "Este e-mail já está cadastrado no sistema." });
    }

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);

    const novoIdoso = await Idoso.create({
      nome,
      idade: parseInt(idade, 10),
      quarto: quarto || "Não especificado",
      email,
      senha: senhaHash
    });

    res.status(201).json({ id: novoIdoso._id, nome, idade, quarto: novoIdoso.quarto, email });
  } catch (err) {
    res.status(500).json({ mensagem: "Erro ao salvar residente." });
  }
});

// Deletar Idoso e seus registros vinculados
app.delete('/api/idosos/:id', autenticarToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ mensagem: "Acesso não autorizado." });
  }

  const { id } = req.params;

  try {
    const idosoDeletado = await Idoso.findByIdAndDelete(id);

    if (idosoDeletado) {
      // Limpa os registros vinculados a esse idoso automaticamente
      await Agenda.deleteMany({ idosoId: id });
      await Checkin.deleteMany({ idosoId: id });
      return res.json({ sucesso: true, message: "Registro e históricos removidos com sucesso." });
    }
    res.status(404).json({ mensagem: "Residente não encontrado." });
  } catch (error) {
    res.status(500).json({ mensagem: "Erro ao remover residente." });
  }
});

// Listar Check-ins
app.get('/api/checkins', autenticarToken, async (req, res) => {
  try {
    const checkins = await Checkin.find().sort({ data: -1 }); // Traz os mais recentes primeiro
    res.json(checkins);
  } catch (error) {
    res.status(500).json({ mensagem: "Erro ao carregar check-ins." });
  }
});

// Criar Check-in Completo
app.post('/api/checkins', autenticarToken, async (req, res) => {
  const { idosoId, humorDia, alimentacao, interacaoSocial, visitas, observacoes } = req.body;
  
  if (!idosoId) {
    return res.status(400).json({ mensagem: "Identificação do idoso obrigatória." });
  }

  try {
    const novoCheckin = await Checkin.create({
      data: new Date().toISOString(),
      idosoId,
      humorDia,
      alimentacao,
      interacaoSocial,
      visitas,
      observacoes: observacoes || ""
    });
    res.status(201).json(novoCheckin);
  } catch (error) {
    res.status(500).json({ mensagem: "Erro ao registrar check-in." });
  }
});

// Criar Check-in Rápido (Autoavaliação do Idoso)
app.post('/api/checkins/rapido', autenticarToken, async (req, res) => {
  const idosoIdEfetivo = req.user.id || 'default_idoso';
  
  try {
    const novoCheckinRapido = await Checkin.create({
      idosoId: idosoIdEfetivo,
      data: new Date().toISOString(),
      humorDia: req.body.humorDia,
      alimentacao: "Autoavaliação",
      interacaoSocial: "Autoavaliação",
      visitas: "Não avaliado",
      observacoes: ""
    });
    res.status(201).json(novoCheckinRapido);
  } catch (error) {
    res.status(500).json({ mensagem: "Erro ao realizar check-in rápido." });
  }
});

// Adicionar Relato/Observação ao Último Check-in
app.post('/api/checkins/relato', autenticarToken, async (req, res) => {
  try {
    const idosoIdEfetivo = req.user.id || 'default_idoso';
    const { observacaoIdoso } = req.body;

    // Busca o último check-in feito por esse idoso específico
    const ultimoCheckin = await Checkin.findOne({ idosoId: idosoIdEfetivo }).sort({ data: -1 });
    
    if (ultimoCheckin) {
      ultimoCheckin.observacoes = observacaoIdoso;
      await ultimoCheckin.save();
    } else {
      await Checkin.create({
        idosoId: idosoIdEfetivo,
        data: new Date().toISOString(),
        humorDia: "Bem",
        alimentacao: "Autoavaliação",
        interacaoSocial: "Autoavaliação",
        visitas: "Não avaliado",
        observacoes: observacaoIdoso
      });
    }
    
    return res.json({ sucesso: true, mensagem: "Relato salvo com sucesso." });
  } catch (error) {
    return res.status(500).json({ mensagem: "Erro ao salvar relato." });
  }
});

// Listar Agenda / Compromissos
app.get('/api/agenda', autenticarToken, async (req, res) => {
  try {
    const tarefas = await Agenda.find();
    res.json(tarefas);
  } catch (error) {
    res.status(500).json({ mensagem: "Erro ao buscar agenda." });
  }
});

// Adicionar à Agenda
app.post('/api/agenda', autenticarToken, async (req, res) => {
  try {
    const novaTarefa = await Agenda.create({
      ...req.body,
      concluido: false
    });
    res.status(201).json(novaTarefa);
  } catch (error) {
    res.status(500).json({ mensagem: "Erro ao agendar compromisso." });
  }
});

// Alternar status de concluído da tarefa
app.patch('/api/agenda/:id/status', autenticarToken, async (req, res) => {
  const { id } = req.params;
  try {
    const tarefa = await Agenda.findById(id);
    if (tarefa) {
      tarefa.concluido = !tarefa.concluido;
      await tarefa.save();
      return res.json(tarefa);
    }
    res.status(404).json({ mensagem: "Tarefa não localizada." });
  } catch (error) {
    res.status(500).json({ mensagem: "Erro ao atualizar tarefa." });
  }
});

// Remover da Agenda
app.delete('/api/agenda/:id', autenticarToken, async (req, res) => {
  const { id } = req.params;
  try {
    const tarefaDeletada = await Agenda.findByIdAndDelete(id);
    if (tarefaDeletada) {
      return res.json({ sucesso: true, mensagem: "Agendamento removido com sucesso." });
    }
    res.status(404).json({ mensagem: "Compromisso não localizado." });
  } catch (error) {
    res.status(500).json({ mensagem: "Erro ao deletar compromisso." });
  }
});

// Roteamento SPA para a Vercel (Captura rotas do front-end)
app.get('/:split(*)', (req, res, next) => {
  if (req.url.startsWith('/api')) return next();
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

module.exports = app;