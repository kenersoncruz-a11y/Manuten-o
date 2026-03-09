const SUPABASE_URL = 'https://wcfrwsgnxochxvwhxnvy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjZnJ3c2dueG9jaHh2d2h4bnZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzExMDgsImV4cCI6MjA4MzIwNzEwOH0.Yb4cT5chXp3S8NZaWbLpv436HzxGCO7CZTruPpOPDdU';

let db;
let currentUser = null;

function initSupabase() {
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase não carregado.');
        return null;
    }
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

function checkSession() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        return JSON.parse(savedUser);
    }
    return null;
}

function saveSession(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
    currentUser = user;
}

function clearSession() {
    localStorage.removeItem('currentUser');
    currentUser = null;
}

function protectPage() {
    const user = checkSession();
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }
    currentUser = user;
    return user;
}

function hasPermission(permission) {
    if (!currentUser) return false;
    if (currentUser.perfil === 'admin') return true;
    return currentUser[permission] === true;
}

function showAlert(elementId, message, type) {
    const alertBox = document.getElementById(elementId);
    if (alertBox) {
        alertBox.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
        setTimeout(() => alertBox.innerHTML = '', 5000);
    }
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function generateCode(prefix) {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}-${date}-${random}`;
}

async function handleLogin(event) {
    event.preventDefault();
    
    const usuario = document.getElementById('loginUsuario').value.trim();
    const senha = document.getElementById('loginSenha').value;

    if (!usuario || !senha) {
        showAlert('alertLogin', 'Preencha todos os campos!', 'error');
        return;
    }

    const btnLogin = document.getElementById('btnLogin');
    btnLogin.disabled = true;
    btnLogin.textContent = 'Entrando...';

    try {
        const { data, error } = await db
            .from('usuarios')
            .select('*')
            .eq('usuario', usuario)
            .eq('senha', senha)
            .eq('ativo', true)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            showAlert('alertLogin', 'Usuário ou senha incorretos!', 'error');
            btnLogin.disabled = false;
            btnLogin.textContent = 'Entrar';
            return;
        }

        saveSession(data);
        window.notifInit?.();  // ← adicionar
        window.pushInit?.();   // ← adicionar
        window.location.href = 'ocorrencias.html';

    } catch (error) {
        console.error('Erro:', error);
        showAlert('alertLogin', 'Erro ao fazer login. Tente novamente.', 'error');
        btnLogin.disabled = false;
        btnLogin.textContent = 'Entrar';
    }
}

function handleLogout() {
    if (confirm('Deseja realmente sair?')) {
        clearSession();
        window.location.href = 'login.html';
    }
}

async function handleCadastroUsuario(event) {
    event.preventDefault();
    
    if (!hasPermission('perm_usuarios_criar')) {
        showAlert('alertUsuarios', 'Você não tem permissão para criar usuários!', 'error');
        return;
    }

    const nome = document.getElementById('usuarioNome').value.trim();
    const usuario = document.getElementById('usuarioLogin').value.trim();
    const senha = document.getElementById('usuarioSenha').value;
    const perfil = document.getElementById('usuarioPerfil').value;

    if (!nome || !usuario || !senha || !perfil) {
        showAlert('alertUsuarios', 'Preencha todos os campos obrigatórios!', 'error');
        return;
    }

    if (senha.length < 6) {
        showAlert('alertUsuarios', 'A senha deve ter pelo menos 6 caracteres!', 'error');
        return;
    }

    try {
        const { data: existing } = await db
            .from('usuarios')
            .select('usuario')
            .eq('usuario', usuario)
            .maybeSingle();

        if (existing) {
            showAlert('alertUsuarios', 'Este nome de usuário já está em uso!', 'error');
            return;
        }

        const permissoes = getDefaultPermissions(perfil);

        const { error } = await db
            .from('usuarios')
            .insert([{ nome, usuario, senha, perfil, ...permissoes }]);

        if (error) throw error;

        showAlert('alertUsuarios', 'Usuário cadastrado com sucesso!', 'success');
        document.getElementById('formUsuario').reset();
        loadUsuarios();

    } catch (error) {
        console.error('Erro:', error);
        showAlert('alertUsuarios', 'Erro ao cadastrar usuário: ' + error.message, 'error');
    }
}

function getDefaultPermissions(perfil) {
    if (perfil === 'admin') {
        return {
            perm_usuarios_visualizar: true,
            perm_usuarios_criar: true,
            perm_usuarios_editar: true,
            perm_usuarios_excluir: true,
            perm_usuarios_permissoes: true,
            perm_predial_visualizar: true,
            perm_predial_criar: true,
            perm_predial_editar: true,
            perm_equipamentos_visualizar: true,
            perm_equipamentos_criar: true,
            perm_equipamentos_editar: true
        };
    } else if (perfil === 'tecnico') {
        return {
            perm_usuarios_visualizar: false,
            perm_usuarios_criar: false,
            perm_usuarios_editar: false,
            perm_usuarios_excluir: false,
            perm_usuarios_permissoes: false,
            perm_predial_visualizar: true,
            perm_predial_criar: true,
            perm_predial_editar: true,
            perm_equipamentos_visualizar: true,
            perm_equipamentos_criar: true,
            perm_equipamentos_editar: true
        };
    } else {
        return {
            perm_usuarios_visualizar: false,
            perm_usuarios_criar: false,
            perm_usuarios_editar: false,
            perm_usuarios_excluir: false,
            perm_usuarios_permissoes: false,
            perm_predial_visualizar: true,
            perm_predial_criar: false,
            perm_predial_editar: false,
            perm_equipamentos_visualizar: true,
            perm_equipamentos_criar: false,
            perm_equipamentos_editar: false
        };
    }
}

async function loadUsuarios() {
    if (!hasPermission('perm_usuarios_visualizar')) {
        document.getElementById('listaUsuarios').innerHTML = 
            '<p class="loading">Você não tem permissão para visualizar usuários.</p>';
        return;
    }

    try {
        const { data, error } = await db
            .from('usuarios')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const lista = document.getElementById('listaUsuarios');
        
        if (!data || data.length === 0) {
            lista.innerHTML = '<p class="loading">Nenhum usuário cadastrado.</p>';
            return;
        }

        let html = `
            <div class="search-box">
                <input type="text" class="search-input" id="searchUsuarios" placeholder="🔍 Buscar usuário por nome ou perfil...">
            </div>
            <div class="table-container">
            <table id="tabelaUsuarios">
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Usuário</th>
                        <th>Perfil</th>
                        <th>Status</th>
                        <th>Cadastro</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.forEach(user => {
            const date = new Date(user.created_at).toLocaleDateString('pt-BR');
            const statusBadge = user.ativo ? 
                '<span class="badge badge-concluido">Ativo</span>' : 
                '<span class="badge badge-cancelado">Inativo</span>';
            
            let actions = '';
            if (hasPermission('perm_usuarios_editar')) {
                actions += `<button class="btn btn-small btn-secondary" onclick="editarUsuario(${user.id})">Editar</button>`;
            }
            if (hasPermission('perm_usuarios_permissoes')) {
                actions += `<button class="btn btn-small btn-warning" onclick="editarPermissoes(${user.id})">Permissões</button>`;
            }
            if (hasPermission('perm_usuarios_excluir') && user.id !== currentUser.id) {
                actions += `<button class="btn btn-small btn-danger" onclick="excluirUsuario(${user.id})">Excluir</button>`;
            }

            html += `
                <tr>
                    <td>${user.nome}</td>
                    <td>@${user.usuario}</td>
                    <td><span class="badge badge-${user.perfil}">${user.perfil}</span></td>
                    <td>${statusBadge}</td>
                    <td>${date}</td>
                    <td><div class="action-buttons">${actions}</div></td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        lista.innerHTML = html;

        document.getElementById('searchUsuarios').addEventListener('input', function(e) {
            filterTable('tabelaUsuarios', e.target.value);
        });

    } catch (error) {
        console.error('Erro:', error);
        document.getElementById('listaUsuarios').innerHTML = 
            '<p class="loading">Erro ao carregar usuários.</p>';
    }
}

async function editarUsuario(userId) {
    try {
        const { data, error } = await db
            .from('usuarios')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;

        document.getElementById('editUsuarioId').value = data.id;
        document.getElementById('editUsuarioNome').value = data.nome;
        document.getElementById('editUsuarioLogin').value = data.usuario;
        document.getElementById('editUsuarioPerfil').value = data.perfil;
        document.getElementById('editUsuarioAtivo').checked = data.ativo;

        openModal('modalEditarUsuario');
    } catch (error) {
        console.error('Erro:', error);
        showAlert('alertUsuarios', 'Erro ao carregar dados do usuário.', 'error');
    }
}

async function salvarEdicaoUsuario(event) {
    event.preventDefault();

    const id = document.getElementById('editUsuarioId').value;
    const nome = document.getElementById('editUsuarioNome').value.trim();
    const usuario = document.getElementById('editUsuarioLogin').value.trim();
    const perfil = document.getElementById('editUsuarioPerfil').value;
    const senha = document.getElementById('editUsuarioSenha').value;
    const ativo = document.getElementById('editUsuarioAtivo').checked;

    if (!nome || !usuario || !perfil) {
        showAlert('alertEditUsuario', 'Preencha todos os campos obrigatórios!', 'error');
        return;
    }

    try {
        const updateData = { nome, usuario, perfil, ativo };
        
        if (senha && senha.length >= 6) {
            updateData.senha = senha;
        } else if (senha && senha.length < 6) {
            showAlert('alertEditUsuario', 'A senha deve ter pelo menos 6 caracteres!', 'error');
            return;
        }

        const { error } = await db
            .from('usuarios')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        showAlert('alertUsuarios', 'Usuário atualizado com sucesso!', 'success');
        closeModal('modalEditarUsuario');
        loadUsuarios();

        if (parseInt(id) === currentUser.id) {
            const { data } = await db
                .from('usuarios')
                .select('*')
                .eq('id', id)
                .single();
            if (data) saveSession(data);
        }

    } catch (error) {
        console.error('Erro:', error);
        showAlert('alertEditUsuario', 'Erro ao atualizar usuário: ' + error.message, 'error');
    }
}

async function editarPermissoes(userId) {
    try {
        const { data, error } = await db
            .from('usuarios')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;

        document.getElementById('permUsuarioId').value = data.id;
        document.getElementById('permUsuarioNome').textContent = data.nome;
        
        document.getElementById('permUsuariosVisualizar').checked = data.perm_usuarios_visualizar;
        document.getElementById('permUsuariosCriar').checked = data.perm_usuarios_criar;
        document.getElementById('permUsuariosEditar').checked = data.perm_usuarios_editar;
        document.getElementById('permUsuariosExcluir').checked = data.perm_usuarios_excluir;
        document.getElementById('permUsuariosPermissoes').checked = data.perm_usuarios_permissoes;
        document.getElementById('permPredialVisualizar').checked = data.perm_predial_visualizar;
        document.getElementById('permPredialCriar').checked = data.perm_predial_criar;
        document.getElementById('permPredialEditar').checked = data.perm_predial_editar;
        document.getElementById('permEquipamentosVisualizar').checked = data.perm_equipamentos_visualizar;
        document.getElementById('permEquipamentosCriar').checked = data.perm_equipamentos_criar;
        document.getElementById('permEquipamentosEditar').checked = data.perm_equipamentos_editar;

        openModal('modalPermissoes');
    } catch (error) {
        console.error('Erro:', error);
        showAlert('alertUsuarios', 'Erro ao carregar permissões.', 'error');
    }
}

async function salvarPermissoes(event) {
    event.preventDefault();

    const id = document.getElementById('permUsuarioId').value;

    const permissoes = {
        perm_usuarios_visualizar: document.getElementById('permUsuariosVisualizar').checked,
        perm_usuarios_criar: document.getElementById('permUsuariosCriar').checked,
        perm_usuarios_editar: document.getElementById('permUsuariosEditar').checked,
        perm_usuarios_excluir: document.getElementById('permUsuariosExcluir').checked,
        perm_usuarios_permissoes: document.getElementById('permUsuariosPermissoes').checked,
        perm_predial_visualizar: document.getElementById('permPredialVisualizar').checked,
        perm_predial_criar: document.getElementById('permPredialCriar').checked,
        perm_predial_editar: document.getElementById('permPredialEditar').checked,
        perm_equipamentos_visualizar: document.getElementById('permEquipamentosVisualizar').checked,
        perm_equipamentos_criar: document.getElementById('permEquipamentosCriar').checked,
        perm_equipamentos_editar: document.getElementById('permEquipamentosEditar').checked
    };

    try {
        const { error } = await db
            .from('usuarios')
            .update(permissoes)
            .eq('id', id);

        if (error) throw error;

        showAlert('alertUsuarios', 'Permissões atualizadas com sucesso!', 'success');
        closeModal('modalPermissoes');
        loadUsuarios();

        if (parseInt(id) === currentUser.id) {
            const { data } = await db
                .from('usuarios')
                .select('*')
                .eq('id', id)
                .single();
            if (data) saveSession(data);
        }

    } catch (error) {
        console.error('Erro:', error);
        showAlert('alertUsuarios', 'Erro ao atualizar permissões: ' + error.message, 'error');
    }
}

async function excluirUsuario(userId) {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;

    try {
        const { error } = await db
            .from('usuarios')
            .delete()
            .eq('id', userId);

        if (error) throw error;

        showAlert('alertUsuarios', 'Usuário excluído com sucesso!', 'success');
        loadUsuarios();
    } catch (error) {
        console.error('Erro:', error);
        showAlert('alertUsuarios', 'Erro ao excluir usuário: ' + error.message, 'error');
    }
}

let selectedImagesPredial = [];

async function handleManutencaoPredial(event) {
    event.preventDefault();
    
    if (!hasPermission('perm_predial_criar')) {
        showAlert('alertPredial', 'Você não tem permissão para criar manutenções!', 'error');
        return;
    }

    const local = document.getElementById('predialLocal').value.trim();
    const tipo = document.getElementById('predialTipo').value;
    const prioridade = document.getElementById('predialPrioridade').value;
    const data_prevista = document.getElementById('predialData').value;
    const descricao = document.getElementById('predialDescricao').value.trim();

    if (!local || !tipo || !prioridade || !data_prevista || !descricao) {
        showAlert('alertPredial', 'Preencha todos os campos!', 'error');
        return;
    }

    try {
        const codigo = generateCode('MP');
        
        const { error } = await db
            .from('manutencao_predial')
            .insert([{ 
                codigo,
                local, 
                tipo, 
                prioridade, 
                data_prevista, 
                descricao,
                status: 'pendente',
                criado_por: currentUser.nome,
                imagens: selectedImagesPredial
            }]);

        if (error) throw error;

        showAlert('alertPredial', `Manutenção registrada com sucesso! Código: ${codigo}`, 'success');
        document.getElementById('formPredial').reset();
        selectedImagesPredial = [];
        updateImagePreview('predialImagePreview', selectedImagesPredial);
        loadManutencoesPrediais();

    } catch (error) {
        console.error('Erro:', error);
        showAlert('alertPredial', 'Erro ao registrar: ' + error.message, 'error');
    }
}

async function loadManutencoesPrediais() {
    if (!hasPermission('perm_predial_visualizar')) {
        document.getElementById('listaPredial').innerHTML = 
            '<p class="loading">Você não tem permissão para visualizar manutenções.</p>';
        return;
    }

    try {
        const { data, error } = await db
            .from('manutencao_predial')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const lista = document.getElementById('listaPredial');
        
        if (!data || data.length === 0) {
            lista.innerHTML = '<p class="loading">Nenhuma manutenção registrada.</p>';
            return;
        }

        let html = `
            <div class="search-box">
                <input type="text" class="search-input" id="searchPredial" placeholder="🔍 Buscar por código, local ou tipo...">
            </div>
            <div class="table-container">
            <table id="tabelaPredial">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Local</th>
                        <th>Tipo</th>
                        <th>Prioridade</th>
                        <th>Status</th>
                        <th>Data</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.forEach(item => {
            const date = new Date(item.data_prevista).toLocaleDateString('pt-BR');
            
            let actions = `<button class="btn btn-small btn-secondary" onclick="abrirForumPredial(${item.id})">💬 Abrir</button>`;
            
            if (hasPermission('perm_predial_editar') && (!item.bloqueado || currentUser.perfil === 'admin')) {
                actions += `<button class="btn btn-small btn-warning" onclick="editarManutencaoPredial(${item.id})">Editar</button>`;
            }

            html += `
                <tr>
                    <td><span class="codigo-badge">${item.codigo}</span></td>
                    <td>${item.local}</td>
                    <td>${item.tipo}</td>
                    <td><span class="badge badge-${item.prioridade}">${item.prioridade}</span></td>
                    <td><span class="badge badge-${item.status}">${item.status}</span></td>
                    <td>${date}</td>
                    <td><div class="action-buttons">${actions}</div></td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        lista.innerHTML = html;

        document.getElementById('searchPredial').addEventListener('input', function(e) {
            filterTable('tabelaPredial', e.target.value);
        });

    } catch (error) {
        console.error('Erro:', error);
        document.getElementById('listaPredial').innerHTML = 
            '<p class="loading">Erro ao carregar manutenções.</p>';
    }
}

let editImagesPredial = [];

async function editarManutencaoPredial(id) {
    try {
        const { data, error } = await db
            .from('manutencao_predial')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        document.getElementById('editPredialId').value = data.id;
        document.getElementById('editPredialCodigo').textContent = data.codigo;
        document.getElementById('editPredialLocal').value = data.local;
        document.getElementById('editPredialTipo').value = data.tipo;
        document.getElementById('editPredialPrioridade').value = data.prioridade;
        document.getElementById('editPredialStatus').value = data.status;
        document.getElementById('editPredialDataPrevista').value = data.data_prevista;
        document.getElementById('editPredialDataConclusao').value = data.data_conclusao || '';
        document.getElementById('editPredialDescricao').value = data.descricao;
        document.getElementById('editPredialObsConclusao').value = data.observacoes_conclusao || '';
        
        editImagesPredial = data.imagens || [];
        updateImagePreview('editPredialImagePreview', editImagesPredial);

        openModal('modalEditarPredial');
    } catch (error) {
        console.error('Erro:', error);
        showAlert('alertPredial', 'Erro ao carregar dados.', 'error');
    }
}

async function salvarEdicaoPredial(event) {
    event.preventDefault();

    const id = document.getElementById('editPredialId').value;
    const local = document.getElementById('editPredialLocal').value.trim();
    const tipo = document.getElementById('editPredialTipo').value;
    const prioridade = document.getElementById('editPredialPrioridade').value;
    const status = document.getElementById('editPredialStatus').value;
    const data_prevista = document.getElementById('editPredialDataPrevista').value;
    const data_conclusao = document.getElementById('editPredialDataConclusao').value || null;
    const descricao = document.getElementById('editPredialDescricao').value.trim();
    const observacoes_conclusao = document.getElementById('editPredialObsConclusao').value.trim();

    if (!local || !tipo || !prioridade || !status || !data_prevista || !descricao) {
        showAlert('alertEditPredial', 'Preencha todos os campos obrigatórios!', 'error');
        return;
    }

    try {
        const updateData = {
            local,
            tipo,
            prioridade,
            status,
            data_prevista,
            data_conclusao,
            descricao,
            observacoes_conclusao,
            imagens: editImagesPredial
        };

        if (status === 'concluido') {
            if (!data_conclusao) {
                updateData.data_conclusao = new Date().toISOString().split('T')[0];
            }
            if (!updateData.concluido_por) {
                updateData.concluido_por = currentUser.nome;
            }
            updateData.bloqueado = true;
        }

        const { error } = await db
            .from('manutencao_predial')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        showAlert('alertPredial', 'Manutenção atualizada com sucesso!', 'success');
        closeModal('modalEditarPredial');
        loadManutencoesPrediais();

    } catch (error) {
        console.error('Erro:', error);
        showAlert('alertEditPredial', 'Erro ao atualizar: ' + error.message, 'error');
    }
}

let selectedImagesEquip = [];

async function handleManutencaoEquipamento(event) {
    event.preventDefault();
    
    if (!hasPermission('perm_equipamentos_criar')) {
        showAlert('alertEquipamentos', 'Você não tem permissão para criar manutenções!', 'error');
        return;
    }

    const nome = document.getElementById('equipNome').value.trim();
    const patrimonio = document.getElementById('equipPatrimonio').value.trim();
    const tipo = document.getElementById('equipTipo').value;
    const status = document.getElementById('equipStatus').value;
    const data_manutencao = document.getElementById('equipData').value;
    const responsavel = document.getElementById('equipResponsavel').value.trim();
    const observacoes = document.getElementById('equipObservacoes').value.trim();

    if (!nome || !tipo || !status || !data_manutencao || !observacoes) {
        showAlert('alertEquipamentos', 'Preencha todos os campos obrigatórios!', 'error');
        return;
    }

    try {
        const codigo = generateCode('ME');

        const { error } = await db
            .from('manutencao_equipamentos')
            .insert([{ 
                codigo,
                equipamento: nome,
                patrimonio,
                tipo, 
                status, 
                data_manutencao, 
                responsavel,
                observacoes,
                criado_por: currentUser.nome,
                imagens: selectedImagesEquip
            }]);

        if (error) throw error;

        showAlert('alertEquipamentos', `Manutenção registrada com sucesso! Código: ${codigo}`, 'success');
        document.getElementById('formEquipamento').reset();
        selectedImagesEquip = [];
        updateImagePreview('equipImagePreview', selectedImagesEquip);
        loadManutencoesEquipamentos();

    } catch (error) {
        console.error('Erro:', error);
        showAlert('alertEquipamentos', 'Erro ao registrar: ' + error.message, 'error');
    }
}

async function loadManutencoesEquipamentos() {
    if (!hasPermission('perm_equipamentos_visualizar')) {
        document.getElementById('listaEquipamentos').innerHTML = 
            '<p class="loading">Você não tem permissão para visualizar manutenções.</p>';
        return;
    }

    try {
        const { data, error } = await db
            .from('manutencao_equipamentos')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const lista = document.getElementById('listaEquipamentos');
        
        if (!data || data.length === 0) {
            lista.innerHTML = '<p class="loading">Nenhuma manutenção registrada.</p>';
            return;
        }

        let html = `
            <div class="search-box">
                <input type="text" class="search-input" id="searchEquipamentos" placeholder="🔍 Buscar por código, equipamento ou patrimônio...">
            </div>
            <div class="table-container">
            <table id="tabelaEquipamentos">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Equipamento</th>
                        <th>Patrimônio</th>
                        <th>Tipo</th>
                        <th>Status</th>
                        <th>Data</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.forEach(item => {
            const date = new Date(item.data_manutencao).toLocaleDateString('pt-BR');
            
            let actions = `<button class="btn btn-small btn-secondary" onclick="abrirForumEquipamento(${item.id})">💬 Abrir</button>`;
            
            if (hasPermission('perm_equipamentos_editar') && (!item.bloqueado || currentUser.perfil === 'admin')) {
                actions += `<button class="btn btn-small btn-warning" onclick="editarManutencaoEquip(${item.id})">Editar</button>`;
            }

            html += `
                <tr>
                    <td><span class="codigo-badge">${item.codigo}</span></td>
                    <td>${item.equipamento}</td>
                    <td>${item.patrimonio || '-'}</td>
                    <td>${item.tipo}</td>
                    <td><span class="badge badge-${item.status}">${item.status}</span></td>
                    <td>${date}</td>
                    <td><div class="action-buttons">${actions}</div></td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        lista.innerHTML = html;

        document.getElementById('searchEquipamentos').addEventListener('input', function(e) {
            filterTable('tabelaEquipamentos', e.target.value);
        });

    } catch (error) {
        console.error('Erro:', error);
        document.getElementById('listaEquipamentos').innerHTML = 
            '<p class="loading">Erro ao carregar manutenções.</p>';
    }
}

let editImagesEquip = [];

async function editarManutencaoEquip(id) {
    try {
        const { data, error } = await db
            .from('manutencao_equipamentos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        document.getElementById('editEquipId').value = data.id;
        document.getElementById('editEquipCodigo').textContent = data.codigo;
        document.getElementById('editEquipNome').value = data.equipamento;
        document.getElementById('editEquipPatrimonio').value = data.patrimonio || '';
        document.getElementById('editEquipTipo').value = data.tipo;
        document.getElementById('editEquipStatus').value = data.status;
        document.getElementById('editEquipData').value = data.data_manutencao;
        document.getElementById('editEquipDataConclusao').value = data.data_conclusao || '';
        document.getElementById('editEquipResponsavel').value = data.responsavel || '';
        document.getElementById('editEquipObservacoes').value = data.observacoes;
        document.getElementById('editEquipObsConclusao').value = data.observacoes_conclusao || '';
        
        editImagesEquip = data.imagens || [];
        updateImagePreview('editEquipImagePreview', editImagesEquip);

        openModal('modalEditarEquip');
    } catch (error) {
        console.error('Erro:', error);
        showAlert('alertEquipamentos', 'Erro ao carregar dados.', 'error');
    }
}

async function salvarEdicaoEquip(event) {
    event.preventDefault();

    const id = document.getElementById('editEquipId').value;
    const equipamento = document.getElementById('editEquipNome').value.trim();
    const patrimonio = document.getElementById('editEquipPatrimonio').value.trim();
    const tipo = document.getElementById('editEquipTipo').value;
    const status = document.getElementById('editEquipStatus').value;
    const data_manutencao = document.getElementById('editEquipData').value;
    const data_conclusao = document.getElementById('editEquipDataConclusao').value || null;
    const responsavel = document.getElementById('editEquipResponsavel').value.trim();
    const observacoes = document.getElementById('editEquipObservacoes').value.trim();
    const observacoes_conclusao = document.getElementById('editEquipObsConclusao').value.trim();

    if (!equipamento || !tipo || !status || !data_manutencao || !observacoes) {
        showAlert('alertEditEquip', 'Preencha todos os campos obrigatórios!', 'error');
        return;
    }

    try {
        const updateData = {
            equipamento,
            patrimonio,
            tipo,
            status,
            data_manutencao,
            data_conclusao,
            responsavel,
            observacoes,
            observacoes_conclusao,
            imagens: editImagesEquip
        };

        if (status === 'concluido') {
            if (!data_conclusao) {
                updateData.data_conclusao = new Date().toISOString().split('T')[0];
            }
            if (!updateData.concluido_por) {
                updateData.concluido_por = currentUser.nome;
            }
            updateData.bloqueado = true;
        }

        const { error } = await db
            .from('manutencao_equipamentos')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        showAlert('alertEquipamentos', 'Manutenção atualizada com sucesso!', 'success');
        closeModal('modalEditarEquip');
        loadManutencoesEquipamentos();

    } catch (error) {
        console.error('Erro:', error);
        showAlert('alertEditEquip', 'Erro ao atualizar: ' + error.message, 'error');
    }
}

function handleImageUpload(event, imageArray, previewId) {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imageArray.push(e.target.result);
                updateImagePreview(previewId, imageArray);
            };
            reader.readAsDataURL(file);
        }
    });
}

function updateImagePreview(previewId, imageArray) {
    const preview = document.getElementById(previewId);
    if (!preview) return;

    if (imageArray.length === 0) {
        preview.innerHTML = '';
        return;
    }

    let html = '';
    imageArray.forEach((img, index) => {
        html += `
            <div class="image-preview-item">
                <img src="${img}" alt="Imagem ${index + 1}">
                <button type="button" class="image-remove" onclick="removeImage(${index}, '${previewId}')">×</button>
            </div>
        `;
    });
    preview.innerHTML = html;
}

function removeImage(index, previewId) {
    if (previewId === 'predialImagePreview') {
        selectedImagesPredial.splice(index, 1);
        updateImagePreview(previewId, selectedImagesPredial);
    } else if (previewId === 'equipImagePreview') {
        selectedImagesEquip.splice(index, 1);
        updateImagePreview(previewId, selectedImagesEquip);
    } else if (previewId === 'editPredialImagePreview') {
        editImagesPredial.splice(index, 1);
        updateImagePreview(previewId, editImagesPredial);
    } else if (previewId === 'editEquipImagePreview') {
        editImagesEquip.splice(index, 1);
        updateImagePreview(previewId, editImagesEquip);
    }
}

function showSection(section) {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    
    document.getElementById(section).classList.add('active');
}

function filterTable(tableId, searchTerm) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');
    const term = searchTerm.toLowerCase().trim();
    
    let visibleCount = 0;
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const text = row.textContent.toLowerCase();
        
        if (text.includes(term)) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    }
    
    const container = table.closest('.table-container') || table.parentElement;
    let noResults = container.querySelector('.no-results-message');
    
    if (visibleCount === 0 && term !== '') {
        if (!noResults) {
            noResults = document.createElement('p');
            noResults.className = 'no-results-message loading';
            noResults.textContent = '🔍 Nenhum resultado encontrado para "' + searchTerm + '"';
            container.appendChild(noResults);
        }
        table.style.display = 'none';
    } else {
        if (noResults) {
            noResults.remove();
        }
        table.style.display = '';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    db = initSupabase();
    if (!db) {
        alert('Erro ao conectar com o banco de dados. Verifique as credenciais.');
        return;
    }
});
