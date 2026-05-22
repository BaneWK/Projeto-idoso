(function(){
  // IMPORTANTE: Mude 'localhost' para o IP da sua máquina se for testar no Wi-Fi pelo celular
  const API_BASE = 'http://localhost:3000/api';

  let idosos = [];
  let checkins = [];
  let agenda = [];
  let usuarioLogado = null;
  let usuarioPerfil = null;

  const loginSection = document.getElementById('loginSection');
  const idosoSection = document.getElementById('idosoSection');
  const sidebar = document.getElementById('sidebar');
  const mainHeader = document.getElementById('mainHeader');
  const userStatus = document.getElementById('userStatus');
  const btnLogout = document.getElementById('btnLogout');

  const secoes = {
    dashboard: document.getElementById('dashboard'),
    calendario: document.getElementById('calendario'),
    cadastroIdoso: document.getElementById('cadastroIdoso'),
    listaIdosos: document.getElementById('listaIdosos'),
    checkin: document.getElementById('checkin'),
    alertas: document.getElementById('alertas')
  };

  // Função de alternância de telas corrigida e protegida contra elementos nulos
  const switchSection = (id) => {
    Object.values(secoes).forEach(sec => { 
      if (sec) sec.style.display = 'none'; 
    });
    
    if (idosoSection) idosoSection.style.display = 'none';

    if (!usuarioLogado) {
      if (loginSection) loginSection.style.display = 'block';
      if (sidebar) sidebar.classList.add('d-none');
      if (mainHeader) {
        mainHeader.classList.remove('d-flex');
        mainHeader.classList.add('d-none');
      }
      return;
    }

    if (loginSection) loginSection.style.display = 'none';
    if (mainHeader) {
      mainHeader.classList.remove('d-none');
      mainHeader.classList.add('d-flex');
    }

    if (usuarioPerfil === 'admin') {
      if (sidebar) sidebar.classList.remove('d-none');
      if (secoes[id]) secoes[id].style.display = 'block';
    } else if (usuarioPerfil === 'idoso') {
      if (sidebar) sidebar.classList.add('d-none');
      if (idosoSection) idosoSection.style.display = 'block';
    }
  };

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
      agenda = await apiFetch('/agenda');
      
      carregarDashboard();
      carregarIdosos();
      carregarIdosoParaCheckin();
      carregarIdososParaAgenda();
      carregarTabelaAgenda();
      carregarAlerts();
    } catch (err) {
      console.error('Erro na sincronização:', err);
    }
  }

  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPassword')?.value;
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
      if (errorDiv) {
        errorDiv.textContent = err.message;
        errorDiv.classList.remove('d-none');
      }
    }
  });

  function verificarAutenticacao() {
    usuarioLogado = localStorage.getItem('laco_usuario');
    usuarioPerfil = localStorage.getItem('laco_perfil');

    if (usuarioLogado) {
      if (userStatus) userStatus.textContent = `${usuarioLogado} (${usuarioPerfil})`;
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

  btnLogout?.addEventListener('click', ejecutarLogout);

  window.enviarStatusIdoso = async function(statusSelecionado) {
    const msg = document.getElementById('idosoStatusMsg');
    const botoesIdoso = document.querySelectorAll('.btn-idoso');
    const relatoInput = document.getElementById('idosoRelato');
    const campoOpcional = document.getElementById('campoSentimentoOpcional');
    
    try {
      botoesIdoso.forEach(btn => btn.disabled = true);
      if (relatoInput) relatoInput.value = '';

      await apiFetch('/checkins/rapido', {
        method: 'POST',
        body: JSON.stringify({ humorDia: statusSelecionado })
      });

      if (msg) msg.classList.remove('d-none');
      if (campoOpcional) campoOpcional.classList.remove('d-none');

      const btnEnviar = document.getElementById('btnEnviarRelato');
      if (btnEnviar) {
        btnEnviar.onclick = async () => {
          const relatoTexto = relatoInput ? relatoInput.value.trim() : "";
          if (relatoTexto) {
            await apiFetch('/checkins/relato', {
              method: 'POST',
              body: JSON.stringify({ observacaoIdoso: relatoTexto })
            });
          }
          fecharPainelAgradecimento();
        };
      }

      const btnFechar = document.getElementById('btnFecharRelato');
      if (btnFechar) {
        btnFechar.onclick = () => {
          fecharPainelAgradecimento();
        };
      }

    } catch (err) {
      alert('Erro de conexão ao salvar status.');
      botoesIdoso.forEach(btn => btn.disabled = false);
    }

    function fecharPainelAgradecimento() {
      if (msg) msg.classList.add('d-none');
      botoesIdoso.forEach(btn => btn.disabled = false);
    }
  };

  document.getElementById('formCadastroIdoso')?.addEventListener('submit', async (e) => {
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
      const msgSucesso = document.getElementById('cadIdosoMsg');
      if (msgSucesso) {
        msgSucesso.classList.remove('d-none');
        setTimeout(() => msgSucesso.classList.add('d-none'), 3000);
      }
      document.getElementById('formCadastroIdoso').reset();
      sincronizarDadosServidor();
    } catch (err) {
      alert('Falha ao registrar.');
    }
  });

  window.deletarIdoso = async function(id) {
    if (confirm("Tem certeza que deseja remover permanentemente este idoso?")) {
      try {
        const resposta = await apiFetch(`/idosos/${id}`, { method: 'DELETE' });
        if (resposta && (resposta.sucesso || !resposta.mensagem)) {
          alert("Idoso removido com sucesso!");
          sincronizarDadosServidor();
        } else {
          alert(`Não foi possível remover: ${resposta.mensagem}`);
        }
      } catch (err) {
        alert("Erro ao remover registro.");
      }
    }
  };

  document.getElementById('formCheckin')?.addEventListener('submit', async (e) => {
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
      const msgCheckin = document.getElementById('checkinMsg');
      if (msgCheckin) {
        msgCheckin.classList.remove('d-none');
        setTimeout(() => msgCheckin.classList.add('d-none'), 2500);
      }
      document.getElementById('formCheckin').reset();
      sincronizarDadosServidor();
    } catch (err) {
      alert('Erro ao gravar log.');
    }
  });

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
    if (!grid) return;
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
      const ultimoCheck = checkins.find(c => c.idosoId === i.id);
      
      let horarioFormatado = "Horário indisponível";
      let textoComplementar = "";

      if (ultimoCheck) {
        const dataObjeto = new Date(ultimoCheck.data);
        horarioFormatado = dataObjeto.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + 
                           ' em ' + dataObjeto.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        
        if (ultimoCheck.observacoes && ultimoCheck.observacoes.trim() !== "") {
          textoComplementar = `
            <div class="mt-2 p-2 bg-light rounded border-start border-3 border-secondary text-start">
              <i class="bi bi-chat-left-quote text-muted me-1"></i> 
              <span class="text-dark font-monospace small">"${ultimoCheck.observacoes}"</span>
            </div>`;
        }
      }

      const card = document.createElement('div');
      card.className = 'col-12 col-md-6';
      card.innerHTML = `
        <div class="card p-3 shadow-sm border-0 bg-white" style="border-left: 4px solid ${colorMap(status)} !important;">
          <div class="d-flex justify-content-between align-items-start">
            <strong>${i.nome}</strong>
            <span class="badge bg-light text-muted border small"><i class="bi bi-clock me-1"></i>${horarioFormatado}</span>
          </div>
          <span class="text-muted small d-block mt-1 text-start">Atenção requerida com base nas respostas.</span>
          ${textoComplementar}
        </div>`;
      container.appendChild(card);
    });
  }

  function carregarIdososParaAgenda() {
    const select = document.getElementById('agendaIdoso');
    if(!select) return;
    select.innerHTML = '<option value="">-- Selecione o Residente --</option>';
    idosos.forEach(i => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.textContent = i.nome;
      select.appendChild(opt);
    });
  }

  function carregarTabelaAgenda() {
    const corpoTabela = document.getElementById('tabelaAgendaCorpo');
    if (!corpoTabela) return;
    corpoTabela.innerHTML = '';

    if (agenda.length === 0) {
      corpoTabela.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhum compromisso agendado.</td></tr>';
      return;
    }

    const agendaOrdenada = [...agenda].sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));

    agendaOrdenada.forEach(ev => {
      const idoso = idosos.find(i => i.id === ev.idosoId);
      const nomeIdoso = idoso ? idoso.nome : "Não encontrado";
      const [ano, mes, dia] = ev.data.split('-');

      const linha = document.createElement('tr');
      if (ev.concluido) linha.className = 'table-light text-decoration-line-through text-muted';

      linha.innerHTML = `
        <td><input type="checkbox" class="form-check-input ms-2" ${ev.concluido ? 'checked' : ''} onclick="alternarStatusAgenda('${ev.id}')"></td>
        <td class="fw-bold">${nomeIdoso}</td>
        <td><span class="badge bg-secondary me-1">${ev.tipo}</span> ${ev.descricao}</td>
        <td><i class="bi bi-clock me-1"></i>${ev.hora} - ${dia}/${mes}</td>
      `;
      corpoTabela.appendChild(linha);
    });
  }

  document.getElementById('formAgenda')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = {
      idosoId: document.getElementById('agendaIdoso').value,
      tipo: document.getElementById('agendaTipo').value,
      descricao: document.getElementById('agendaDescricao').value,
      data: document.getElementById('agendaData').value,
      hora: document.getElementById('agendaHora').value
    };

    try {
      await apiFetch('/agenda', { method: 'POST', body: JSON.stringify(dados) });
      document.getElementById('formAgenda').reset();
      sincronizarDadosServidor();
    } catch (err) {
      alert('Erro ao salvar agendamento.');
    }
  });

  window.alternarStatusAgenda = async function(id) {
    try {
      await apiFetch(`/agenda/${id}/status`, { method: 'PATCH' });
      sincronizarDadosServidor();
    } catch (err) {
      alert('Erro ao atualizar status do compromisso.');
    }
  };

  document.querySelectorAll('#sidebar button[data-section]').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.getAttribute('data-section')));
  });

  document.getElementById('btnAtualizar')?.addEventListener('click', sincronizarDadosServidor);

  // Sincronização em segundo plano automática a cada 10 segundos
  setInterval(() => {
    if(usuarioLogado && usuarioPerfil === 'admin') sincronizarDadosServidor();
  }, 10000);

  window.addEventListener('load', verificarAutenticacao);
})();