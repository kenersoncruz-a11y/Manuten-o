// ============================================================
// CONFIGURAÇÕES DO SUPABASE
// ============================================================
const SUPABASE_URL = 'https://wcfrwsgnxochxvwhxnvy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjZnJ3c2dueG9jaHh2d2h4bnZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzExMDgsImV4cCI6MjA4MzIwNzEwOH0.Yb4cT5chXp3S8NZaWbLpv436HzxGCO7CZTruPpOPDdU';

// ============================================================
// MENU NA PLANILHA
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔧 Gestão a Vista')
    .addItem('📋 Importar Manutenção Predial',      'importarPredial')
    .addItem('🛠️ Importar Manutenção Equipamentos', 'importarEquipamentos')
    .addSeparator()
    .addItem('🔄 Importar Tudo', 'importarTudo')
    .addToUi();
}

function testarAcessoDrive() {
  try {
    var pasta = DriveApp.getFolderById('1e93C89QczoRpa7tayY9162pl-OV5UaY5oqKDtauOarmPCBlbDepk_Khz_S7conkp_0hlMvmT');
    Logger.log('✅ Pasta encontrada: ' + pasta.getName());
    Logger.log('ID: ' + pasta.getId());
  } catch(e) {
    Logger.log('❌ Erro: ' + e.message);
  }
}

function autorizarDrive() {
  DriveApp.getRootFolder();
  Logger.log('✅ Drive autorizado!');
}

function getMenuUrl(usuarioJson) {
  var baseUrl = ScriptApp.getService().getUrl();
  var encoded = encodeURIComponent(usuarioJson || '');
  return baseUrl + '?page=checklist&u=' + encoded;
}

function getLoginUrl() {
  return ScriptApp.getService().getUrl();
}

// ============================================================
// ROTEADOR DE PÁGINAS (doGet)
// ============================================================
function doGet(e) {
  const page    = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'login';
  const paginas = { 'login': 'login', 'checklist': 'checklist' };
  const arquivo = paginas[page] || 'login';
  return HtmlService
    .createHtmlOutputFromFile(arquivo)
    .setTitle('Sistema de Manutenção')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================
function fazerLogin(usuario, senha) {
  try {
    if (!usuario || !senha) {
      return { sucesso: false, erro: 'Preencha todos os campos!' };
    }

    const url = SUPABASE_URL
      + '/rest/v1/usuarios'
      + '?select=*'
      + '&usuario=eq.' + encodeURIComponent(usuario)
      + '&senha=eq.'   + encodeURIComponent(senha)
      + '&limit=1';

    const options = {
      method: 'GET',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type':  'application/json'
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const code     = response.getResponseCode();

    if (code !== 200) {
      return { sucesso: false, erro: 'Erro de comunicação com o banco (' + code + ').' };
    }

    const dados = JSON.parse(response.getContentText());

    if (!dados || dados.length === 0) {
      return { sucesso: false, erro: 'Usuário ou senha incorretos!' };
    }

    const user = Object.assign({}, dados[0]);
    delete user.senha;

    return { sucesso: true, usuario: user };

  } catch (e) {
    Logger.log('Erro em fazerLogin: ' + e.message);
    return { sucesso: false, erro: 'Erro interno. Tente novamente.' };
  }
}

// ============================================================
// HELPER: INSERIR NOTIFICAÇÃO NO SUPABASE
// Chamado sempre que o GAS gravar dados no Supabase para que
// todos os usuários logados recebam o pop-up em tempo real.
// ============================================================
function inserirNotificacao(tipo, titulo, mensagem, link) {
  try {
    var payload = {
      tipo:     tipo     || 'geral',
      titulo:   titulo   || '',
      mensagem: mensagem || '',
      link:     link     || null,
      lida:     false
    };

    var options = {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal'
      },
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/notificacoes', options);
    var code     = response.getResponseCode();

    if (code === 200 || code === 201) {
      Logger.log('[notificacao] ✅ Enviada: ' + titulo);
    } else {
      Logger.log('[notificacao] ❌ Erro ' + code + ': ' + response.getContentText());
    }
  } catch (e) {
    Logger.log('[notificacao] Exceção: ' + e.message);
  }
}

// ============================================================
// SALVAR IMAGENS NO GOOGLE DRIVE
// ============================================================
function salvarImagensNoDrive(payload) {
  try {
    var dataHoraAtual  = new Date();

    Logger.log('foto_base64 presente: ' + (payload.foto_base64 ? 'SIM - tamanho: ' + payload.foto_base64.length : 'NÃO'));
    Logger.log('assinatura_base64 presente: ' + (payload.assinatura_base64 ? 'SIM - tamanho: ' + payload.assinatura_base64.length : 'NÃO'));

    if (payload.foto_base64) {
      Logger.log('foto começa com: ' + payload.foto_base64.substring(0, 30));
    }

    var pastaPrincipal = DriveApp.getFolderById('13BPH8qOTj6NYT-TF6QLWerT-TQzEfbhJ');

    var nomeSubpasta = Utilities.formatDate(dataHoraAtual, Session.getScriptTimeZone(), 'MM-yyyy');
    var subpastas    = pastaPrincipal.getFoldersByName(nomeSubpasta);
    var subpasta     = subpastas.hasNext() ? subpastas.next() : pastaPrincipal.createFolder(nomeSubpasta);

    var prefixo = (payload.operador        || 'operador')
      + '_' + (payload.numero_maquina  || 'maquina')
      + '_' + (payload.turno           || 'turno')
      + '_' + Utilities.formatDate(dataHoraAtual, Session.getScriptTimeZone(), "dd-MM-yyyy_HH'h'mm");

    var linkFoto       = '';
    var linkAssinatura = '';

    if (payload.foto_base64 && payload.foto_base64.startsWith('data:image')) {
      try {
        var partesFoto   = payload.foto_base64.split(',');
        var mimeTypeFoto = partesFoto[0].match(/:(.*?);/)[1];
        var extensaoFoto = mimeTypeFoto.split('/')[1] || 'jpg';
        var blobFoto = Utilities.newBlob(
          Utilities.base64Decode(partesFoto[1]),
          mimeTypeFoto,
          'foto_' + prefixo + '.' + extensaoFoto
        );
        var arquivoFoto = subpasta.createFile(blobFoto);
        arquivoFoto.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        linkFoto = arquivoFoto.getUrl();
        Logger.log('✅ Foto salva no Drive: ' + linkFoto);
      } catch (eFoto) {
        Logger.log('❌ Erro ao salvar FOTO: ' + eFoto.message);
      }
    } else {
      Logger.log('⚠️ foto_base64 não está no formato esperado ou está vazio');
    }

    if (payload.assinatura_base64 && payload.assinatura_base64.startsWith('data:image')) {
      try {
        var partesAss   = payload.assinatura_base64.split(',');
        var mimeTypeAss = partesAss[0].match(/:(.*?);/)[1];
        var extensaoAss = mimeTypeAss.split('/')[1] || 'png';
        var blobAss = Utilities.newBlob(
          Utilities.base64Decode(partesAss[1]),
          mimeTypeAss,
          'assinatura_' + prefixo + '.' + extensaoAss
        );
        var arquivoAss = subpasta.createFile(blobAss);
        arquivoAss.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        linkAssinatura = arquivoAss.getUrl();
        Logger.log('✅ Assinatura salva no Drive: ' + linkAssinatura);
      } catch (eAss) {
        Logger.log('❌ Erro ao salvar ASSINATURA: ' + eAss.message);
      }
    } else {
      Logger.log('⚠️ assinatura_base64 não está no formato esperado ou está vazio');
    }

    return { sucesso: true, linkFoto: linkFoto, linkAssinatura: linkAssinatura };

  } catch (e) {
    Logger.log('❌ Erro geral em salvarImagensNoDrive: ' + e.message);
    return { sucesso: false, erro: e.message };
  }
}

// ============================================================
// SALVAR CHECKLIST VIA SERVIDOR
// ============================================================
function salvarChecklistServidor(payload) {
  try {
    // 1. Salva imagens no Drive
    var resultadoDrive = salvarImagensNoDrive(payload);
    var linkFoto       = (resultadoDrive.sucesso && resultadoDrive.linkFoto)       ? resultadoDrive.linkFoto       : '';
    var linkAssinatura = (resultadoDrive.sucesso && resultadoDrive.linkAssinatura) ? resultadoDrive.linkAssinatura : '';

    // 2. Monta objeto para o Supabase
    var dadosSupabase = {
      operador:             payload.operador        || '',
      matricula:            payload.matricula        || '',
      numero_maquina:       payload.numero_maquina   || '',
      turno:                payload.turno            || '',
      horimetro:            payload.horimetro        || '',
      data:                 payload.data             || '',
      hora:                 payload.hora             || '',
      usuario_id:           payload.usuario_id       || null,
      respostas:            payload.respostas        || {},
      total_problemas:      payload.total_problemas  || 0,
      comentario:           payload.comentario       || '',
      foto_drive_url:       linkFoto                 || null,
      assinatura_drive_url: linkAssinatura           || null
    };

    var url = SUPABASE_URL + '/rest/v1/checklist_diario';
    var options = {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal'
      },
      payload: JSON.stringify(dadosSupabase),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var code     = response.getResponseCode();

    if (code === 200 || code === 201) {
      // 3. Registra na planilha com os links do Drive
      payload._linkFoto       = linkFoto;
      payload._linkAssinatura = linkAssinatura;
      registrarNaPlanilha(payload);

      // 4. ── NOTIFICAÇÃO AUTOMÁTICA ──────────────────────────
      var totalProblemas = dadosSupabase.total_problemas || 0;
      var tituloNotif = totalProblemas > 0
        ? '⚠️ Check-list com ' + totalProblemas + ' problema(s)'
        : '✅ Check-list enviado';
      var msgNotif = 'Operador: ' + dadosSupabase.operador
        + ' | Máquina: ' + dadosSupabase.numero_maquina
        + ' | Turno: ' + dadosSupabase.turno
        + (totalProblemas > 0 ? ' | ' + totalProblemas + ' problema(s) encontrado(s).' : ' | Sem problemas.');

      inserirNotificacao('checklist_problema', tituloNotif, msgNotif, 'checklist-painel.html');
      // ──────────────────────────────────────────────────────

      return { sucesso: true, linkFoto: linkFoto, linkAssinatura: linkAssinatura };
    } else {
      return { sucesso: false, erro: 'Erro Supabase (' + code + '): ' + response.getContentText() };
    }

  } catch (e) {
    Logger.log('Erro em salvarChecklistServidor: ' + e.message);
    return { sucesso: false, erro: e.message };
  }
}

// ============================================================
// BUSCAR HISTÓRICO DO SUPABASE
// ============================================================
function buscarHistoricoServidor() {
  try {
    const url = SUPABASE_URL
      + '/rest/v1/checklist_diario'
      + '?select=*&order=created_at.desc&limit=10';

    const options = {
      method: 'GET',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type':  'application/json'
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const code     = response.getResponseCode();

    if (code === 200) {
      return { sucesso: true, dados: JSON.parse(response.getContentText()) };
    } else {
      return { sucesso: false, erro: 'Erro (' + code + '): ' + response.getContentText() };
    }

  } catch (e) {
    Logger.log('Erro em buscarHistoricoServidor: ' + e.message);
    return { sucesso: false, erro: e.message };
  }
}

// ============================================================
// REGISTRAR NA PLANILHA COMO LOG
// ============================================================
function registrarNaPlanilha(payload) {
  try {
    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    let   aba = ss.getSheetByName('Checklist_Log');

    if (!aba) {
      aba = ss.insertSheet('Checklist_Log');
      const cabecalho = [
        'Data/Hora Envio', 'Operador', 'Matrícula', 'Nº Máquina', 'Turno', 'Horímetro',
        'Data', 'Hora', 'Total Problemas', 'Comentário',
        'Foto', 'Assinatura',
        'Q1 - Vazamentos água/óleo?',    'Q2 - Cabine limpa?',
        'Q3 - Corrente c/ folgas/ruídos?','Q4 - Ruídos anormais?',
        'Q5 - Estrutura c/ rachaduras?', 'Q6 - Bateria com carga?',
        'Q7 - Nível água bateria ok?',   'Q8 - Cabos/terminais ok?',
        'Q9 - Buzina funciona?',         'Q10 - Luzes funcionando?',
        'Q11 - Alarme de ré funciona?',  'Q12 - Elevação/inclinação ok?',
        'Q13 - Vazamentos chão/mangueiras?','Q14 - Rodas firmes/seguras?',
        'Q15 - Rodas em bom estado?',    'Q16 - Freio serviço eficiente?',
        'Q17 - Freio estacionamento ok?','Q18 - Direção leve/sem folgas?',
        'Q19 - Possui cinto?',           'Q20 - Pedais/joystick ok?',
        'Q21 - Possui retrovisores?',    'Q22 - Retrovisores ok?',
        'Q23 - Código de erro no painel?','Q24 - Luz esgotamento/manômetro ok?',
        'Q25 - Deslocamento/freio ok?',  'Q26 - Proteções de segurança ok?',
        'Q27 - Pedal segurança/timão ok?','Q28 - Pintura ok?'
      ];
      aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
      aba.getRange(1, 1, 1, cabecalho.length)
        .setBackground('#5b21b6').setFontColor('#ffffff').setFontWeight('bold');
      aba.setFrozenRows(1);
    }

    const r          = payload.respostas || {};
    var   ultimaLinha = aba.getLastRow() + 1;

    const linha = [
      new Date().toLocaleString('pt-BR'),
      payload.operador        || '',
      payload.matricula       || '',
      payload.numero_maquina  || '',
      payload.turno           || '',
      payload.horimetro       || '',
      payload.data            || '',
      payload.hora            || '',
      payload.total_problemas || 0,
      payload.comentario      || '',
      payload._linkFoto       ? 'Ver Foto'       : 'Não enviada',
      payload._linkAssinatura ? 'Ver Assinatura' : 'Não enviada',
      r.q1  || '', r.q2  || '', r.q3  || '', r.q4  || '', r.q5  || '',
      r.q6  || '', r.q7  || '', r.q8  || '', r.q9  || '', r.q10 || '',
      r.q11 || '', r.q12 || '', r.q13 || '', r.q14 || '', r.q15 || '',
      r.q16 || '', r.q17 || '', r.q18 || '', r.q19 || '', r.q20 || '',
      r.q21 || '', r.q22 || '', r.q23 || '', r.q24 || '', r.q25 || '',
      r.q26 || '', r.q27 || '', r.q28 || ''
    ];

    aba.getRange(ultimaLinha, 1, 1, linha.length).setValues([linha]);

    if (payload._linkFoto) {
      aba.getRange(ultimaLinha, 11).setFormula('=HYPERLINK("' + payload._linkFoto + '")');
    }
    if (payload._linkAssinatura) {
      aba.getRange(ultimaLinha, 12).setFormula('=HYPERLINK("' + payload._linkAssinatura + '")');
    }

    aba.autoResizeColumns(1, linha.length);

  } catch (e) {
    Logger.log('Erro ao registrar na planilha: ' + e.message);
  }
}

// ============================================================
// IMPORTAR CHECKLIST DO SUPABASE PARA A PLANILHA
// ============================================================
function importarChecklist() {
  const ui = SpreadsheetApp.getUi();
  try {
    const dados = supabaseGet('checklist_diario');
    if (!dados || dados.length === 0) { ui.alert('Nenhum registro encontrado.'); return; }

    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    let   aba = ss.getSheetByName('Checklist');
    if (!aba) aba = ss.insertSheet('Checklist');
    else aba.clearContents();

    const cabecalho = [
      'ID', 'Operador', 'Matrícula', 'Nº Máquina', 'Turno', 'Horímetro',
      'Data', 'Hora', 'Total Problemas', 'Comentário',
      'Foto (Drive)', 'Assinatura (Drive)', 'Criado Em'
    ];

    const linhas = [cabecalho];
    dados.forEach(function(item) {
      linhas.push([
        item.id              || '',
        item.operador        || '',
        item.matricula       || '',
        item.numero_maquina  || '',
        item.turno           || '',
        item.horimetro       || '',
        item.data            || '',
        item.hora            || '',
        item.total_problemas || 0,
        item.comentario      || '',
        item.foto_drive_url       ? '📷 Ver Foto'       : 'Não',
        item.assinatura_drive_url ? '✍️ Ver Assinatura' : 'Não',
        item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : ''
      ]);
    });

    aba.getRange(1, 1, linhas.length, cabecalho.length).setValues(linhas);

    dados.forEach(function(item, i) {
      var row = i + 2;
      if (item.foto_drive_url) {
        aba.getRange(row, 11).setFormula('=HYPERLINK("' + item.foto_drive_url + '")');
      }
      if (item.assinatura_drive_url) {
        aba.getRange(row, 12).setFormula('=HYPERLINK("' + item.assinatura_drive_url + '")');
      }
    });

    aba.getRange(1, 1, 1, cabecalho.length)
      .setBackground('#5b21b6').setFontColor('#ffffff').setFontWeight('bold');
    aba.autoResizeColumns(1, cabecalho.length);
    aba.setFrozenRows(1);

    ui.alert('✅ Sucesso!', dados.length + ' registros importados na aba "Checklist".', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Erro', e.message, ui.ButtonSet.OK);
  }
}

// ============================================================
// FUNÇÃO AUXILIAR: REQUISIÇÃO GET SUPABASE
// ============================================================
function supabaseGet(tabela) {
  const url = SUPABASE_URL + '/rest/v1/' + tabela + '?select=*&order=created_at.desc';
  const options = {
    method: 'GET',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type':  'application/json'
    },
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('Erro ao buscar dados (' + code + '): ' + response.getContentText());
  }
  return JSON.parse(response.getContentText());
}

// ============================================================
// IMPORTAR MANUTENÇÃO PREDIAL
// ============================================================
function importarPredial() {
  const ui = SpreadsheetApp.getUi();
  try {
    const dados = supabaseGet('manutencao_predial');
    if (!dados || dados.length === 0) { ui.alert('Nenhum registro encontrado.'); return; }

    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    let   aba = ss.getSheetByName('Predial');
    if (!aba) aba = ss.insertSheet('Predial');
    else aba.clearContents();

    const cabecalho = [
      'ID','Código','Local','Tipo','Prioridade','Status',
      'Data Prevista','Data Conclusão','Descrição','Obs. Conclusão',
      'Criado Por','Concluído Por','Bloqueado','Criado Em'
    ];

    const linhas = [cabecalho];
    dados.forEach(function(item) {
      linhas.push([
        item.id||'', item.codigo||'', item.local||'', item.tipo||'',
        item.prioridade||'', item.status||'', item.data_prevista||'',
        item.data_conclusao||'', item.descricao||'',
        item.observacoes_conclusao||'', item.criado_por||'',
        item.concluido_por||'', item.bloqueado ? 'Sim' : 'Não',
        item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : ''
      ]);
    });

    aba.getRange(1,1,linhas.length,cabecalho.length).setValues(linhas);
    aba.getRange(1,1,1,cabecalho.length)
      .setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold');
    aba.autoResizeColumns(1, cabecalho.length);
    aba.setFrozenRows(1);
    ui.alert('✅ Sucesso!', dados.length + ' registros importados na aba "Predial".', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Erro', e.message, ui.ButtonSet.OK);
  }
}

// ============================================================
// IMPORTAR MANUTENÇÃO EQUIPAMENTOS
// ============================================================
function importarEquipamentos() {
  const ui = SpreadsheetApp.getUi();
  try {
    const dados = supabaseGet('manutencao_equipamentos');
    if (!dados || dados.length === 0) { ui.alert('Nenhum registro encontrado.'); return; }

    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    let   aba = ss.getSheetByName('Equipamentos');
    if (!aba) aba = ss.insertSheet('Equipamentos');
    else aba.clearContents();

    const cabecalho = [
      'ID','Código','Equipamento','Patrimônio','Tipo','Status',
      'Data Manutenção','Data Conclusão','Responsável','Observações',
      'Obs. Conclusão','Criado Por','Concluído Por','Bloqueado','Criado Em'
    ];

    const linhas = [cabecalho];
    dados.forEach(function(item) {
      linhas.push([
        item.id||'', item.codigo||'', item.equipamento||'',
        item.patrimonio||'', item.tipo||'', item.status||'',
        item.data_manutencao||'', item.data_conclusao||'',
        item.responsavel||'', item.observacoes||'',
        item.observacoes_conclusao||'', item.criado_por||'',
        item.concluido_por||'', item.bloqueado ? 'Sim' : 'Não',
        item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : ''
      ]);
    });

    aba.getRange(1,1,linhas.length,cabecalho.length).setValues(linhas);
    aba.getRange(1,1,1,cabecalho.length)
      .setBackground('#0f6e56').setFontColor('#ffffff').setFontWeight('bold');
    aba.autoResizeColumns(1, cabecalho.length);
    aba.setFrozenRows(1);
    ui.alert('✅ Sucesso!', dados.length + ' registros importados na aba "Equipamentos".', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Erro', e.message, ui.ButtonSet.OK);
  }
}

// ============================================================
// IMPORTAR TUDO
// ============================================================
function importarTudo() {
  importarPredial();
  importarEquipamentos();
  importarChecklist();
}
