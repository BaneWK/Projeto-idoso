(function(){
  const API_BASE = 'http://localhost:3000/api';

  let idosos = [];
  let checkins = [];
  let agenda = [];
  let usuarioLogado = null;
  let usuarioPerfil = null;

  const loginSection = document.getElementById('loginSection');
  const appContainer = document.getElementById('appContainer');
  const idosoSection = document.getElementById('idosoSection');
  const sidebar = document.getElementById('sidebar');
  const userStatus = document.getElementById('userStatus');
  const btnLogout = document.getElementById('btnLogout');
  const btnAtualizar = document.getElementById('btnAtualizar');
  const idosoMainInterface = document.getElementById('idosoMainInterface');
  const idosoCooldownScreen = document.getElementById('idosoCooldownScreen');
  const badgeAlertCount = document.getElementById('badgeAlertCount');

  const secoes = {
    dashboard: document.getElementById('dashboard'),
    calendario: document.getElementById('calendario'),
    cadastroIdoso: document.getElementById('cadastroIdoso'),
    listaIdosos: document.getElementById('listaIdosos'),
    checkin: document.getElementById('checkin'),
    alertas: document.getElementById('alertas')
  };

  function sanitize(string) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', "/": '&#x2F;' };
    return String(string).replace(/[&<>"'/]/g, m => map[m]);
  }

  const switchSection = (sectionId) => {
    Object.values(secoes).forEach(sec => { if (sec) sec.style.display = 'none'; });
    if (idosoSection) idosoSection.style.display = 'none';

    if (!usuarioLogado) {
      loginSection?.classList.remove('d-none');
      appContainer?.classList.add('d-none');
      return;
    }

    loginSection?.classList.add('d-none');
    appContainer?.classList.remove('d-none');

    if (usuarioPerfil === 'admin') {
      sidebar?.classList.remove('d-none');
      if (secoes[sectionId]) secoes[sectionId].style.display = 'block';
      
      document.querySelectorAll('#sidebar .sidebar-item').forEach(btn => {
        if(btn.getAttribute('data-section') === sectionId) btn.classList.add('active');
        else btn.classList.remove('active');
      });
    } else if (usuarioPerfil === 'idoso') {
      sidebar?.classList.add('d-none');
      if (idosoSection) idosoSection.style.display = 'block';
      idosoMainInterface?.classList.remove('d-none');
      idosoCooldownScreen?.classList.add('d-none');
    }
  };

  function ejecutarLogout() {
    localStorage.clear();
    usuarioLogado = null;
    usuarioPerfil = null;
    verificarAutenticacao();
  }

  btnLogout?.addEventListener('click', ejecutarLogout);

  async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('laco_token');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    try {
      const resposta = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      
      if (resposta.status === 401 || resposta.status === 403) {
        ejecutarLogout();
        throw new Error('Sessão expirada.');
      }
      
      const contentType = resposta.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textoErro = await resposta.text();
        console.error("Resposta não-JSON recebida do servidor:", textoErro);
        throw new Error("O servidor retornou uma resposta inválida (HTML/Texto). Verifique as rotas do backend.");
      }

      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.mensagem || 'Erro na comunicação.');
      return dados;
    } catch (err) {
      console.error(`Erro em [${endpoint}]:`, err.message);
      throw err;
    }
  }

  async function sincronizarDadosServidor() {
    if (!usuarioLogado || usuarioPerfil !== 'admin') return;
    try {
      const [dadosIdosos, dadosCheckins, dadosAgenda] = await Promise.all([
        apiFetch('/idosos'),
        apiFetch('/checkins'),
        apiFetch('/agenda')
      ]);

      idosos = dadosIdosos;
      checkins = dadosCheckins;
      agenda = dadosAgenda;
      
      carregarDashboard();
      carregarIdosos();
      carregarIdosoParaCheckin();
      carregarIdososParaAgenda();
      carregarTabelaAgenda();
      carregarAlerts();
    } catch (err) {
      console.error('Falha na sincronização:', err);
    }
  }

  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPassword')?.value;
    const errorDiv = document.getElementById('loginError');

    try {
      const dados = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      localStorage.setItem('laco_token', dados.token);
      localStorage.setItem('laco_usuario', dados.user.email);
      localStorage.setItem('laco_perfil', dados.user.role);

      errorDiv?.classList.add('d-none');
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
      if (userStatus) userStatus.textContent = `${usuarioLogado} (${usuarioPerfil.toUpperCase()})`;
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

      msg?.classList.remove('d-none');
      campoOpcional?.classList.remove('d-none');

      const btnEnviar = document.getElementById('btnEnviarRelato');
      if (btnEnviar) {
        btnEnviar.onclick = async () => {
          const relatoTexto = relatoInput ? relatoInput.value.trim() : "";
          if (relatoTexto) {
            try {
              await apiFetch('/checkins/relato', {
                method: 'POST',
                body: JSON.stringify({ observacaoIdoso: relatoTexto })
              });
            } catch (e) {
              console.error(e);
            }
          }
          finalizarFluxoIdoso();
        };
      }

      const btnFechar = document.getElementById('btnFecharRelato');
      if (btnFechar) {
        btnFechar.onclick = () => finalizarFluxoIdoso();
      }

    } catch (err) {
      alert('Erro de rede ao processar.');
      botoesIdoso.forEach(btn => btn.disabled = false);
    }

    function finalizarFluxoIdoso() {
      idosoMainInterface?.classList.add('d-none');
      idosoCooldownScreen?.classList.remove('d-none');
      msg?.classList.add('d-none');
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
      document.getElementById('formCadastroIdoso').reset();
      sincronizarDadosServidor();
      alert('Residente registrado.');
    } catch (err) {
      alert(err.message);
    }
  });

  window.deletarIdoso = async function(id) {
    if (confirm("Remover permanentemente este residente?")) {
      try {
        await apiFetch(`/idosos/${id}`, { method: 'DELETE' });
        sincronizarDadosServidor();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  document.getElementById('formCheckin')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idosoId = document.getElementById('selectIdoso').value;
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
      document.getElementById('formCheckin').reset();
      await sincronizarDadosServidor();
      alert('Prontuário salvo com sucesso.');
      switchSection('dashboard');
    } catch (err) {
      alert('Erro operacional ao salvar prontuário.');
    }
  });

  function computeStatus(idosoId) {
    const idChecks = checkins.filter(c => String(c.idosoId) === String(idosoId)).slice(0, 5);
    if (idChecks.length === 0) return 'verde';
    let soma = 0;
    idChecks.forEach(c => {
      soma += (c.humorDia === 'Bem' ? 3 : c.humorDia === 'Atenção' ? 2 : 1);
    });
    return (soma / idChecks.length) >= 2.4 ? 'verde' : (soma / idChecks.length) >= 1.7 ? 'amarelo' : 'vermelho';
  }

  function colorMap(status) {
    return status === 'verde' ? '#27ae60' : status === 'amarelo' ? '#f39c12' : '#c0392b';
  }

  function carregarDashboard() {
    const grid = document.getElementById('dashboardCards');
    if (!grid) return;
    grid.innerHTML = `
      <div class="col-6 col-md-4"><div class="card p-3 shadow-custom border-0 bg-white">⏱️ Residentes: <b>${idosos.length}</b></div></div>
      <div class="col-6 col-md-4"><div class="card p-3 shadow-custom border-0 bg-white">⚠️ Alertas: <b>${idosos.filter(i=>computeStatus(i.id)!=='verde').length}</b></div></div>
      <div class="col-12 col-md-4"><div class="card p-3 shadow-custom border-0 bg-white">📋 Prontuários: <b>${checkins.length}</b></div></div>
    `;
  }

  function carregarIdosos() {
    const containers = [document.getElementById('idososGrid'), document.getElementById('geralIdosos')];
    containers.forEach(c => { if(c) c.innerHTML = ''; });

    idosos.forEach(idObj => {
      const status = computeStatus(idObj.id);
      const cor = colorMap(status);
      const ultimoCheck = checkins.find(c => String(c.idosoId) === String(idObj.id));
      const txtRelato = (ultimoCheck && ultimoCheck.observacoes) ? `<br><small class="text-secondary">💬 "${sanitize(ultimoCheck.observacoes)}"</small>` : "";

      const html = `
        <div class="card p-3 shadow-custom border-0 bg-white" style="border-left: 5px solid ${cor} !important;">
          <strong class="text-primary fs-5">${sanitize(idObj.nome)}</strong>
          <span class="text-muted small">Quarto: ${sanitize(idObj.quarto)}</span>
          ${txtRelato}
          <div class="mt-2"><button class="btn btn-sm btn-outline-primary" onclick="openCheckin('${idObj.id}')">Evoluir</button>
          <button class="btn btn-sm btn-link text-danger" onclick="deletarIdoso('${idObj.id}')">Excluir</button></div>
        </div>`;
      
      containers.forEach(c => {
        if(c) {
          const div = document.createElement('div'); div.className = 'col-12 col-md-6 col-lg-4'; div.innerHTML = html; c.appendChild(div);
        }
      });
    });
  }

  function carregarIdosoParaCheckin() {
    const select = document.getElementById('selectIdoso');
    if(!select) return;
    
    const valorAtual = select.value;
    select.innerHTML = '<option value="">-- Selecione --</option>';
    
    idosos.forEach(i => { 
      select.innerHTML += `<option value="${i.id}">${sanitize(i.nome)}</option>`; 
    });
    
    if (valorAtual) {
      select.value = valorAtual;
    }
  }

  window.openCheckin = function(id) { switchSection('checkin'); const s = document.getElementById('selectIdoso'); if(s) s.value = id; };

  function carregarAlerts() {
    const container = document.getElementById('alertasList');
    if(!container) return;
    container.innerHTML = '';

    let filtrados = idosos.filter(i => {
      const statusNaoVerde = computeStatus(i.id) !== 'verde';
      const u = checkins.find(c => String(c.idosoId) === String(i.id));
      return statusNaoVerde || (u && u.observacoes && u.observacoes.trim() !== "");
    });

    if(badgeAlertCount) {
      badgeAlertCount.textContent = filtrados.length;
      badgeAlertCount.className = filtrados.length > 0 ? "badge bg-danger ms-auto" : "d-none";
    }

    if(filtrados.length === 0) {
      container.innerHTML = '<p class="text-muted p-2">Nenhum alerta ativo no momento.</p>';
      return;
    }

    filtrados.forEach(i => {
      const status = computeStatus(i.id);
      const u = checkins.find(c => String(c.idosoId) === String(i.id));
      const msgTexto = (u && u.observacoes) ? `<div class="p-2 bg-light rounded text-danger mt-2"><b>Recado do Idoso:</b> "${sanitize(u.observacoes)}"</div>` : "";

      container.innerHTML += `
        <div class="col-12 col-md-6">
          <div class="card p-3 shadow-custom border-0 bg-white" style="border-left: 5px solid ${colorMap(status)} !important;">
            <strong>${sanitize(i.nome)} (Quarto ${sanitize(i.quarto)})</strong>
            <span>Status Clínico: <b style="color:${colorMap(status)}">${status.toUpperCase()}</b></span>
            ${msgTexto}
          </div>
        </div>`;
    });
  }

  function carregarIdososParaAgenda() {
    const s = document.getElementById('agendaIdoso'); if(s) { 
      const valorAtual = s.value;
      s.innerHTML = ''; 
      idosos.forEach(i => { s.innerHTML += `<option value="${i.id}">${sanitize(i.nome)}</option>`; }); 
      if (valorAtual) s.value = valorAtual;
    }
  }

  function carregarTabelaAgenda() {
    const corpo = document.getElementById('tabelaAgendaCorpo'); if(!corpo) return; corpo.innerHTML = '';
    agenda.forEach(ev => {
      const idoso = idosos.find(i => String(i.id) === String(ev.idosoId));
      corpo.innerHTML += `
        <tr class="${ev.concluido ? 'table-light text-decoration-line-through' : ''}">
          <td><input type="checkbox" ${ev.concluido ? 'checked' : ''} onclick="alternarStatusAgenda('${ev.id}')"></td>
          <td><b>${sanitize(idoso?.nome || 'Residente')}</b></td>
          <td>${sanitize(ev.descricao)}</td>
          <td>${sanitize(ev.data)} às ${sanitize(ev.hora)}</td>
          <td><button class="btn btn-sm btn-link text-danger p-0 btn-deletar-agenda" data-id="${ev.id}"><i class="bi bi-trash"></i> Excluir</button></td>
        </tr>`;
    });

    document.querySelectorAll('.btn-deletar-agenda').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const id = this.getAttribute('data-id');
        window.deletarAgenda(id);
      });
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
    await apiFetch('/agenda', { method: 'POST', body: JSON.stringify(dados) });
    document.getElementById('formAgenda').reset();
    sincronizarDadosServidor();
  });

  window.alternarStatusAgenda = async function(id) { await apiFetch(`/agenda/${id}/status`, { method: 'PATCH' }); sincronizarDadosServidor(); };

  window.deletarAgenda = async function(id) {
    if (confirm("Deseja remover este agendamento da escala?")) {
      try {
        await apiFetch(`/agenda/${id}`, { method: 'DELETE' });
        sincronizarDadosServidor();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  document.querySelectorAll('#sidebar [data-section]').forEach(btn => {
    btn.addEventListener('click', () => { switchSection(btn.getAttribute('data-section')); sidebar?.classList.toggle('show'); });
  });

  document.getElementById('toggleSidebar')?.addEventListener('click', () => sidebar?.classList.toggle('show'));
  btnAtualizar?.addEventListener('click', sincronizarDadosServidor);

  setInterval(() => { if(usuarioLogado && usuarioPerfil === 'admin') sincronizarDadosServidor(); }, 10000);
  window.addEventListener('load', verificarAutenticacao);
})();