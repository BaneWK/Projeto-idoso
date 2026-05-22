(function(){
  // IMPORTANTE: Altere 'localhost' para o número IP do computador se for abrir no celular
  const API_BASE = 'http://localhost:3000/api';

  let idosos = [];
  let checkins = [];
  let usuarioLogado = null;
  let usuarioPerfil = null;

  // --- Elementos DOM ---
  const loginSection = document.getElementById('loginSection');
  const idosoSection = document.getElementById('idosoSection');
  const sidebar = document.getElementById('sidebar');
  const mainHeader = document.getElementById('mainHeader');
  const userStatus = document.getElementById('userStatus');
  const btnLogout = document.getElementById('btnLogout');

  const secoes = {
    dashboard: document.getElementById('dashboard'),
    cadastroIdoso: document.getElementById('cadastroIdoso'),
    listaIdosos: document.getElementById('listaIdosos'),
    checkin: document.getElementById('checkin'),
    alertas: document.getElementById('alertas')
  };

  // --- Navegação e Fluxo de Telas ---
  const switchSection = (id) => {
    Object.values(secoes).forEach(sec => { if(sec) sec.style.display = 'none'; });
    idosoSection.style.display = 'none';

    if (!usuarioLogado) {
      loginSection.style.display = 'block';
      sidebar.classList.add('d-none');
      mainHeader.classList.remove('d-flex');
      mainHeader.classList.add('d-none');
      return;
    }

    loginSection.style.display = 'none';
    mainHeader.classList.remove('d-none');
    mainHeader.classList.add('d-flex');

    if (usuarioPerfil === 'admin') {
      sidebar.classList.remove('d-none');
      if (secoes[id]) secoes[id].style.display = 'block';
    } else if (usuarioPerfil === 'idoso') {
      sidebar.classList.add('d-none');
      idosoSection.style.display = 'block';
    }
  };

  // --- Central de Requisições HTTP (API) ---
  async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('laco_token');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const resposta = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    if (resposta.status === 401 || resposta.status === 403) {
      executarLogout();
      throw new Error('Sessão expirada');
    }
    return resposta.json();
  }

  async function sincronizarDadosServidor() {
    if (!usuarioLogado || usuarioPerfil !== 'admin') return;
    try {
      idosos = await apiFetch('/idosos');
      checkins = await apiFetch('/checkins');
      
      carregarDashboard();
      carregarIdosos();
      carregarIdosoParaCheckin();
      carregarAlerts();
    } catch (err) {
      console.error('Erro na sincronização:', err);
    }
  }

  // --- Sistema de Autenticação ---
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    try {
      const resposta = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.mensagem || 'Falha no Login');

      localStorage.setItem('laco_token', dados.token);
      localStorage.setItem('laco_usuario', dados.user.email);
      localStorage.setItem('laco_perfil', dados.user.role);

      verificarAutenticacao();
    } catch (err) {
      errorDiv.textContent = err.message;
      errorDiv.classList.remove('d-none');
    }
  });

  function verificarAutenticacao() {
    usuarioLogado = localStorage.getItem('laco_usuario');
    usuarioPerfil = localStorage.getItem('laco_perfil');

    if (usuarioLogado) {
      userStatus.textContent = `${usuarioLogado} (${usuarioPerfil})`;
      if (usuarioPerfil === 'admin') {
        switchSection('dashboard');
        sincronizarDadosServidor();
      } else {
        switchSection('idosoSection');
      }
    } else {
      switchSection(null);
    }
  }

  function ejecutarLogout() {
    localStorage.clear();
    usuarioLogado = null;
    usuarioPerfil = null;
    verificarAutenticacao();
  }

  btnLogout.addEventListener('click', ejecutarLogout);

  // --- Painel do Idoso (Com trava Antispam e Relato Opcional) ---
  window.enviarStatusIdoso = async function(statusSelecionado) {
    const msg = document.getElementById('idosoStatusMsg');
    const botoesIdoso = document.querySelectorAll('.btn-idoso');
    const relatoInput = document.getElementById('idosoRelato');
    const campoOpcional = document.getElementById('campoSentimentoOpcional');
    
    try {
      // Bloqueia cliques duplicados instantaneamente
      botoesIdoso.forEach(btn => btn.disabled = true);
      relatoInput.value = '';

      // Posta humor inicial no servidor central
      await apiFetch('/checkins/rapido', {
        method: 'POST',
        body: JSON.stringify({ humorDia: statusSelecionado })
      });

      // Abre as janelas interativas de agradecimento e campo opcional
      msg.classList.remove('d-none');
      campoOpcional.classList.remove('d-none');

      document.getElementById('btnEnviarRelato').onclick = async () => {
        const relatoTexto = relatoInput.value.trim();
        if (relatoTexto) {
          await apiFetch('/checkins/relato', {
            method: 'POST',
            body: JSON.stringify({ observacaoIdoso: relatoTexto })
          });
        }
        fecharPainelAgradecimento();
      };

      document.getElementById('btnFecharRelato').onclick = () => {
        fecharPainelAgradecimento();
      };

    } catch (err) {
      alert('Erro de conexão ao salvar status.');
      botoesIdoso.forEach(btn => btn.disabled = false);
    }

    function fecharPainelAgradecimento() {
      msg.classList.add('d-none');
      botoesIdoso.forEach(btn => btn.disabled = false); // Libera os botões de humor de novo
    }
  };

  // --- Métodos de Criação e Remoção Administrativa ---
  document.getElementById('formCadastroIdoso').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = {
      nome: document.getElementById('cadNome').value,
      idade: parseInt(document.getElementById('cadIdade').value, 10),
      quarto: document.getElementById('cadQuarto').value,
      email: document.getElementById('cadEmail').value,
      senha: document.getElementById('cadSenha').value
    };

    try {
      await apiFetch('/idosos', { method: 'POST', body: JSON.stringify(dados) });
      document.getElementById('cadIdosoMsg').classList.remove('d-none');
      setTimeout(() => document.getElementById('cadIdosoMsg').classList.add('d-none'), 3000);
      document.getElementById('formCadastroIdoso').reset();
      sincronizarDadosServidor();
    } catch (err) {
      alert('Falha ao registrar.');
    }
  });

  window.deletarIdoso = async function(id) {
    if (confirm("Tem certeza que deseja remover permanentemente este idoso do sistema?")) {
      try {
        await apiFetch(`/idosos/${id}`, { method: 'DELETE' });
        alert("Cadastro removido com sucesso!");
        sincronizarDadosServidor();
      } catch (err) {
        alert("Erro ao remover registro.");
      }
    }
  };

  document.getElementById('formCheckin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const idosoId = document.getElementById('selectIdoso').value;
    if(!idosoId) return alert('Selecione um idoso.');

    const dados = {
      idosoId,
      humorDia: document.getElementById('checkinHumor').value,
      alimentacao: document.getElementById('checkinAlimento').value,
      interacaoSocial: document.getElementById('checkinSocial').value,
      visitas: document.getElementById('checkinVisitas').value,
      observacoes: document.getElementById('checkinObservacoes').value
    };

    try {
      await apiFetch('/checkins', { method: 'POST', body: JSON.stringify(dados) });
      document.getElementById('checkinMsg').classList.remove('d-none');
      setTimeout(() => document.getElementById('checkinMsg').classList.add('d-none'), 2500);
      document.getElementById('formCheckin').reset();
      sincronizarDadosServidor();
    } catch (err) {
      alert('Erro ao gravar log.');
    }
  });

  // --- Analisador de Índices Visuais ---
  function computeStatus(idosoId) {
    const idChecks = checkins.filter(c => c.idosoId === idosoId).slice(0, 7);
    if (idChecks.length === 0) return 'verde';
    let soma = 0;
    idChecks.forEach(c => {
      soma += (c.humorDia === 'Bem' ? 3 : c.humorDia === 'Atenção' ? 2 : 1);
    });
    const media = soma / idChecks.length;
    return media >= 2.5 ? 'verde' : media >= 1.8 ? 'amarelo' : 'vermelho';
  }

  function colorMap(status) {
    return status === 'verde' ? '#28a745' : status === 'amarelo' ? '#f2c94c' : '#e74c3c';
  }

  function carregarDashboard() {
    const totalIdosos = idosos.length;
    let alertasCount = idosos.filter(i => computeStatus(i.id) !== 'verde').length;
    const checkinsSemana = checkins.length;

    const cards = [
      { label: 'Idosos Cadastrados', value: totalIdosos, color: 'primary' },
      { label: 'Alertas Ativos', value: alertasCount, color: 'warning' },
      { label: 'Total de Logs Históricos', value: checkinsSemana, color: 'success' }
    ];

    const grid = document.getElementById('dashboardCards');
    grid.innerHTML = '';
    cards.forEach(c => {
      const col = document.createElement('div');
      col.className = 'col-12 col-md-4';
      col.innerHTML = `
        <div class="card p-3 shadow-sm bg-white border-0">
          <div class="d-flex align-items-center justify-content-between">
            <div>
              <div class="text-muted small">${c.label}</div>
              <div class="fs-4 fw-bold">${c.value}</div>
            </div>
            <div class="rounded-circle bg-${c.color} text-white d-flex align-items-center justify-content-center" style="width:40px;height:40px;">
              <i class="bi bi-heart-fill"></i>
            </div>
          </div>
        </div>`;
      grid.appendChild(col);
    });
  }

  function carregarIdosos() {
    const containers = [document.getElementById('idososGrid'), document.getElementById('geralIdosos')];
    containers.forEach(c => { if(c) c.innerHTML = ''; });

    [...idosos].sort((a, b) => a.nome.localeCompare(b.nome)).forEach(idObj => {
      const status = computeStatus(idObj.id);
      const corBorda = colorMap(status);

      const cardHTML = `
        <div class="card p-2 h-100 shadow-sm border-0" style="border-left: 5px solid ${corBorda} !important;">
          <div class="row g-0 align-items-center">
            <div class="col-8 ps-2">
              <strong class="d-block text-truncate">${idObj.nome}</strong>
              <span class="text-muted small">Idade: ${idObj.idade} • Quarto: ${idObj.quarto || 'N/A'}</span>
              <div class="mt-2 d-flex gap-2">
                <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="openCheckin('${idObj.id}')">
                  <i class="bi bi-clipboard-check"></i> Evoluir
                </button>
                <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="deletarIdoso('${idObj.id}')" title="Excluir Idoso">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
            <div class="col-4 text-end pe-2">
              <span class="badge bg-${status === 'verde' ? 'success' : status === 'amarelo' ? 'warning' : 'danger'} text-dark">
                ${status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>`;

      containers.forEach(container => {
        if (container) {
          const col = document.createElement('div');
          col.className = 'col-12 col-md-6 col-lg-4';
          col.innerHTML = cardHTML;
          container.appendChild(col);
        }
      });
    });
  }

  function carregarIdosoParaCheckin() {
    const select = document.getElementById('selectIdoso');
    if(!select) return;
    select.innerHTML = '<option value="">-- Selecione --</option>';
    idosos.forEach(i => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.textContent = i.nome;
      select.appendChild(opt);
    });
  }

  window.openCheckin = function(id) {
    switchSection('checkin');
    const select = document.getElementById('selectIdoso');
    if(select) select.value = id;
  };

  function carregarAlerts() {
    const container = document.getElementById('alertasList');
    if(!container) return;
    container.innerHTML = '';
    let filtrados = idosos.filter(i => computeStatus(i.id) !== 'verde');

    if(filtrados.length === 0){
      container.innerHTML = `<div class="col-12"><div class="alert alert-info">Sem alertas críticos no momento.</div></div>`;
      return;
    }

    filtrados.forEach(i => {
      const status = computeStatus(i.id);
      
      // Captura o último comentário textual se houver
      const ultimoCheck = checkins.find(c => c.idosoId === i.id && c.observacoes);
      const textoComplementar = ultimoCheck ? `<br><small class="text-dark"><b>Nota enviada:</b> "${ultimoCheck.observacoes}"</small>` : '';

      const card = document.createElement('div');
      card.className = 'col-12 col-md-6';
      card.innerHTML = `
        <div class="card p-3 shadow-sm border-0 bg-white" style="border-right: 4px solid ${colorMap(status)} !important;">
          <strong>${i.nome}</strong>
          <span class="text-muted small">Atenção requerida com base nas últimas respostas.${textoComplementar}</span>
        </div>`;
      container.appendChild(card);
    });
  }

  document.querySelectorAll('#sidebar button[data-section]').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.getAttribute('data-section')));
  });

  document.getElementById('btnAtualizar')?.addEventListener('click', sincronizarDadosServidor);

  // Varredura automática em background a cada 10 segundos
  setInterval(() => {
    if(usuarioLogado && usuarioPerfil === 'admin') sincronizarDadosServidor();
  }, 10000);

  window.addEventListener('load', verificarAutenticacao);
})();