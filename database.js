const fs = require('fs');
const path = require('path');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'database.json');
        this.logPath = path.join(__dirname, 'logs');
        this.backupPath = path.join(__dirname, 'backups');
        
        // Cria pastas se não existirem
        if (!fs.existsSync(this.logPath)) fs.mkdirSync(this.logPath, { recursive: true });
        if (!fs.existsSync(this.backupPath)) fs.mkdirSync(this.backupPath, { recursive: true });
        
        this.data = this.carregarDados();
        this.inicializarEstrutura();
        
        // Backup automático diário
        this.iniciarBackupAutomatico();
    }

    // ==========================================
    // INICIALIZAÇÃO
    // ==========================================
    
    inicializarEstrutura() {
        if (!this.data.contas) this.data.contas = [];
        if (!this.data.keys) this.data.keys = [];
        if (!this.data.clientes) this.data.clientes = {};
        if (!this.data.admins) this.data.admins = [];
        if (!this.data.banidos) this.data.banidos = [];
        if (!this.data.masterKeyUsada) this.data.masterKeyUsada = false;
        if (!this.data.logs) this.data.logs = [];
        if (!this.data.config) this.data.config = { criadoEm: new Date().toISOString() };
        
        this.salvarDados();
    }

    carregarDados() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const raw = fs.readFileSync(this.dbPath, 'utf8');
                return JSON.parse(raw);
            }
        } catch (e) {
            console.error('Erro ao carregar DB:', e);
            this.logErro('CARREGAR_DB', e.message);
        }
        return {};
    }

    salvarDados() {
        try {
            fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error('Erro ao salvar DB:', e);
            this.logErro('SALVAR_DB', e.message);
        }
    }

    // ==========================================
    // SISTEMA DE LOGS
    // ==========================================
    
    logAcao(tipo, numero, detalhes = {}) {
        const log = {
            id: Date.now().toString(36),
            tipo: tipo,
            numero: numero,
            data: new Date().toISOString(),
            detalhes: detalhes
        };
        
        this.data.logs.unshift(log); // Adiciona no início (mais recente primeiro)
        
        // Mantém só os últimos 1000 logs
        if (this.data.logs.length > 1000) {
            this.data.logs = this.data.logs.slice(0, 1000);
        }
        
        this.salvarDados();
        
        // Também salva em arquivo de texto para fácil leitura
        const dataHora = new Date().toLocaleString('pt-BR');
        const logTexto = `[${dataHora}] ${tipo} | ${numero} | ${JSON.stringify(detalhes)}\n`;
        const logFile = path.join(this.logPath, `${new Date().toISOString().split('T')[0]}.txt`);
        
        try {
            fs.appendFileSync(logFile, logTexto);
        } catch (e) {}
        
        console.log(`📝 LOG: ${tipo} - ${numero}`);
    }

    logErro(tipo, erro) {
        this.logAcao('ERRO', 'SISTEMA', { tipo, erro });
    }

    getLogs(filtro = {}, limite = 50) {
        let logs = this.data.logs || [];
        
        if (filtro.tipo) {
            logs = logs.filter(l => l.tipo === filtro.tipo);
        }
        if (filtro.numero) {
            logs = logs.filter(l => l.numero.includes(filtro.numero));
        }
        if (filtro.dataInicio) {
            logs = logs.filter(l => new Date(l.data) >= new Date(filtro.dataInicio));
        }
        
        return logs.slice(0, limite);
    }

    // ==========================================
    // BACKUP AUTOMÁTICO
    // ==========================================
    
    iniciarBackupAutomatico() {
        // Faz backup a cada 24 horas
        setInterval(() => {
            this.fazerBackup();
        }, 24 * 60 * 60 * 1000);
        
        // Faz backup na inicialização também
        this.fazerBackup();
    }

    fazerBackup() {
        try {
            const data = new Date().toISOString().replace(/:/g, '-').split('.')[0];
            const backupFile = path.join(this.backupPath, `backup-${data}.json`);
            fs.copyFileSync(this.dbPath, backupFile);
            
            // Remove backups antigos (mantém últimos 7)
            const backups = fs.readdirSync(this.backupPath)
                .filter(f => f.startsWith('backup-'))
                .sort()
                .reverse();
            
            if (backups.length > 7) {
                backups.slice(7).forEach(b => {
                    fs.unlinkSync(path.join(this.backupPath, b));
                });
            }
            
            console.log(`💾 Backup criado: ${backupFile}`);
            this.logAcao('BACKUP', 'SISTEMA', { arquivo: backupFile });
        } catch (e) {
            console.error('Erro no backup:', e);
        }
    }

    // ==========================================
    // CONTAS STEAM - ILIMITADO
    // ==========================================
    
    addConta(jogo, categoria, login, senha) {
        const conta = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            jogo: jogo,
            categoria: categoria,
            login: login,
            senha: senha,
            dataAdicao: new Date().toISOString(),
            totalResgates: 0,
            historicoResgates: [],
            favoritos: 0 // Quantos usuários favoritaram
        };
        
        this.data.contas.push(conta);
        this.salvarDados();
        this.logAcao('ADD_CONTA', 'ADMIN', { jogo, categoria, login });
        return conta;
    }

    getTodosJogosDisponiveis() {
        return this.data.contas.sort((a, b) => 
            new Date(b.dataAdicao) - new Date(a.dataAdicao)
        );
    }

    getJogosDisponiveisPorCategoria() {
        const todasContas = this.getTodosJogosDisponiveis();
        const porCategoria = {};
        
        todasContas.forEach(conta => {
            if (!porCategoria[conta.categoria]) {
                porCategoria[conta.categoria] = [];
            }
            porCategoria[conta.categoria].push(conta);
        });
        
        return porCategoria;
    }

    // BUSCA INTELIGENTE (ignora acentos, case insensitive)
    buscarConta(termo) {
        const normalizar = (str) => {
            return str.toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '') // Remove acentos
                .replace(/[^a-z0-9]/g, ''); // Remove caracteres especiais
        };
        
        const termoNormalizado = normalizar(termo);
        
        // Tenta encontrar exato primeiro
        let conta = this.data.contas.find(c => 
            normalizar(c.jogo) === termoNormalizado
        );
        
        // Se não achou, tenta includes
        if (!conta) {
            conta = this.data.contas.find(c => 
                normalizar(c.jogo).includes(termoNormalizado) ||
                normalizar(c.categoria).includes(termoNormalizado)
            );
        }
        
        // Se ainda não achou, tenta palavras parciais
        if (!conta && termo.length > 3) {
            const palavras = termoNormalizado.split(/\s+/);
            conta = this.data.contas.find(c => {
                const jogoNorm = normalizar(c.jogo);
                return palavras.some(p => p.length > 2 && jogoNorm.includes(p));
            });
        }
        
        return conta;
    }

    // Busca múltiplos resultados (para sugestões)
    buscarContasSimilares(termo, limite = 5) {
        const normalizar = (str) => {
            return str.toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]/g, '');
        };
        
        const termoNormalizado = normalizar(termo);
        
        return this.data.contas
            .filter(c => normalizar(c.jogo).includes(termoNormalizado))
            .slice(0, limite);
    }

    buscarContaAleatoria(termo) {
        const termoLower = termo.toLowerCase();
        const contasDoJogo = this.data.contas.filter(c => 
            c.jogo.toLowerCase().includes(termoLower) ||
            c.categoria.toLowerCase().includes(termoLower)
        );
        
        if (contasDoJogo.length === 0) return null;
        
        // Prioriza contas menos usadas
        contasDoJogo.sort((a, b) => (a.totalResgates || 0) - (b.totalResgates || 0));
        
        // Pega uma das 3 menos usadas (aleatório entre elas)
        const top3 = contasDoJogo.slice(0, 3);
        const randomIndex = Math.floor(Math.random() * top3.length);
        return top3[randomIndex];
    }

    removerConta(jogo, login) {
        const index = this.data.contas.findIndex(c => 
            c.jogo === jogo && c.login === login
        );
        
        if (index >= 0) {
            const removida = this.data.contas.splice(index, 1)[0];
            this.salvarDados();
            this.logAcao('REMOVE_CONTA', 'ADMIN', { jogo, login });
            return { sucesso: true, totalRestante: this.data.contas.length };
        }
        
        return { sucesso: false, erro: 'Conta não encontrada' };
    }

    // ==========================================
    // KEYS
    // ==========================================
    
    criarKey(key, plano, dias, isTeste = false) {
        const keyData = {
            key: key,
            plano: plano,
            dias: dias,
            isTeste: isTeste,
            usada: false,
            dataCriacao: new Date().toISOString(),
            usadaPor: null,
            dataUso: null,
            dataExpiracao: null
        };
        
        this.data.keys.push(keyData);
        this.salvarDados();
        this.logAcao('CREATE_KEY', 'ADMIN', { key, plano, dias });
        return keyData;
    }

    criarKeyTeste(key, duracao, horas, numero, nome) {
        const agora = new Date();
        const expira = new Date(agora.getTime() + (horas * 60 * 60 * 1000));
        
        const keyData = {
            key: key,
            plano: `Teste ${duracao}`,
            duracaoHoras: horas,
            isTeste: true,
            usada: true,
            usadaPor: numero,
            nomeUsuario: nome,
            dataCriacao: agora.toISOString(),
            dataUso: agora.toISOString(),
            dataExpiracao: expira.toISOString()
        };
        
        this.data.keys.push(keyData);
        
        if (!this.data.clientes[numero]) {
            this.data.clientes[numero] = this.criarPerfilPadrao(numero, nome);
        }
        
        this.data.clientes[numero].usouTeste = true;
        this.data.clientes[numero].temAcesso = true;
        this.data.clientes[numero].keyInfo = {
            key: key,
            plano: `Teste ${duracao}`,
            expira: expira.toLocaleString('pt-BR'),
            dataExpiracao: expira.toISOString()
        };
        this.data.clientes[numero].keysResgatadas.push({
            key: key,
            data: agora.toISOString(),
            plano: `Teste ${duracao}`
        });
        
        this.salvarDados();
        this.logAcao('USAR_TESTE', numero, { key, duracao });
        
        return {
            sucesso: true,
            expira: expira.toLocaleString('pt-BR'),
            dataExpiracao: expira.toISOString()
        };
    }

    resgatarKey(key, numero, nome) {
        const keyData = this.data.keys.find(k => k.key === key && !k.usada);
        
        if (!keyData) {
            return { sucesso: false, erro: 'Key inválida ou já usada' };
        }
        
        if (keyData.isTeste) {
            return { sucesso: false, erro: 'Use a opção de teste grátis' };
        }
        
        const agora = new Date();
        const expira = new Date(agora.getTime() + (keyData.dias * 24 * 60 * 60 * 1000));
        
        keyData.usada = true;
        keyData.usadaPor = numero;
        keyData.dataUso = agora.toISOString();
        keyData.dataExpiracao = expira.toISOString();
        
        if (!this.data.clientes[numero]) {
            this.data.clientes[numero] = this.criarPerfilPadrao(numero, nome);
        }
        
        const cliente = this.data.clientes[numero];
        cliente.nome = nome;
        cliente.temAcesso = true;
        cliente.acessoPermanente = keyData.dias > 1000;
        cliente.keyInfo = {
            key: key,
            plano: keyData.plano,
            expira: expira.toLocaleString('pt-BR'),
            dataExpiracao: expira.toISOString(),
            dias: keyData.dias
        };
        cliente.keysResgatadas.push({
            key: key,
            data: agora.toISOString(),
            plano: keyData.plano
        });
        
        this.salvarDados();
        this.logAcao('RESGATAR_KEY', numero, { key, plano: keyData.plano });
        
        return {
            sucesso: true,
            plano: keyData.plano,
            duracao: keyData.dias > 1000 ? 'Lifetime' : `${keyData.dias} dias`,
            expira: expira.toLocaleString('pt-BR'),
            dataExpiracao: expira.toISOString()
        };
    }

    resgatarMasterKey(key, numero, nome) {
        if (this.data.masterKeyUsada) {
            return { sucesso: false, erro: 'Master key já foi usada' };
        }
        
        if (key !== 'NYUX-ADM1-GUIXS23') {
            return { sucesso: false, erro: 'Key inválida' };
        }
        
        this.data.masterKeyUsada = true;
        
        if (!this.data.clientes[numero]) {
            this.data.clientes[numero] = this.criarPerfilPadrao(numero, nome);
        }
        
        const cliente = this.data.clientes[numero];
        cliente.nome = nome;
        cliente.temAcesso = true;
        cliente.acessoPermanente = true;
        cliente.isAdmin = true;
        cliente.keyInfo = {
            key: 'MASTER-KEY',
            plano: 'ADMIN LIFETIME',
            expira: 'Nunca',
            dataExpiracao: null
        };
        
        this.data.admins.push(numero);
        this.salvarDados();
        this.logAcao('MASTER_KEY', numero, { nome });
        
        return { sucesso: true };
    }

    verificarAcesso(numero) {
        // Verifica se está banido primeiro
        if (this.data.banidos.includes(numero)) {
            return false;
        }
        
        const cliente = this.data.clientes[numero];
        if (!cliente) return false;
        
        if (cliente.acessoPermanente) return true;
        
        if (cliente.keyInfo && cliente.keyInfo.dataExpiracao) {
            const agora = new Date();
            const expira = new Date(cliente.keyInfo.dataExpiracao);
            
            if (agora > expira) {
                cliente.temAcesso = false;
                this.salvarDados();
                return false;
            }
            
            return true;
        }
        
        return cliente.temAcesso || false;
    }

    verificarTesteUsado(numero) {
        const cliente = this.data.clientes[numero];
        return cliente ? cliente.usouTeste : false;
    }

    // ==========================================
    // SISTEMA DE BANIMENTO
    // ==========================================
    
    banirUsuario(numero, motivo = '') {
        if (!this.data.banidos.includes(numero)) {
            this.data.banidos.push(numero);
            
            // Remove acesso se tiver
            if (this.data.clientes[numero]) {
                this.data.clientes[numero].temAcesso = false;
                this.data.clientes[numero].banido = true;
                this.data.clientes[numero].motivoBan = motivo;
            }
            
            this.salvarDados();
            this.logAcao('BANIR', numero, { motivo });
            return true;
        }
        return false;
    }

    desbanirUsuario(numero) {
        const index = this.data.banidos.indexOf(numero);
        if (index >= 0) {
            this.data.banidos.splice(index, 1);
            
            if (this.data.clientes[numero]) {
                this.data.clientes[numero].banido = false;
                delete this.data.clientes[numero].motivoBan;
            }
            
            this.salvarDados();
            this.logAcao('DESBANIR', numero);
            return true;
        }
        return false;
    }

    isBanido(numero) {
        return this.data.banidos.includes(numero);
    }

    getBanidos() {
        return this.data.banidos.map(num => ({
            numero: num,
            motivo: this.data.clientes[num]?.motivoBan || 'Sem motivo'
        }));
    }

    // ==========================================
    // PERFIL DO CLIENTE
    // ==========================================
    
    criarPerfilPadrao(numero, nome) {
        return {
            numero: numero,
            nome: nome || 'Cliente',
            dataRegistro: new Date().toISOString(),
            temAcesso: false,
            acessoPermanente: false,
            usouTeste: false,
            isAdmin: false,
            banido: false,
            keyInfo: null,
            keysResgatadas: [],
            jogosResgatados: [],
            jogosFavoritos: [], // NOVO
            totalJogosResgatados: 0,
            indicacoes: 0, // NOVO: quantos amigos indicou
            horasBonus: 0 // NOVO: horas extras ganhas
        };
    }

    getPerfil(numero) {
        const numLimpo = numero.replace('@s.whatsapp.net', '').replace('@g.us', '').split(':')[0];
        
        let cliente = this.data.clientes[numero] || this.data.clientes[numLimpo];
        
        if (!cliente) {
            return this.criarPerfilPadrao(numero, 'Visitante');
        }
        
        // Garante todos os campos novos existem
        if (!cliente.jogosResgatados) cliente.jogosResgatados = [];
        if (!cliente.jogosFavoritos) cliente.jogosFavoritos = [];
        if (!cliente.keysResgatadas) cliente.keysResgatadas = [];
        if (!cliente.dataRegistro) cliente.dataRegistro = new Date().toISOString();
        if (!cliente.indicacoes) cliente.indicacoes = 0;
        if (!cliente.horasBonus) cliente.horasBonus = 0;
        
        // Verifica expiração
        if (cliente.keyInfo && cliente.keyInfo.dataExpiracao && !cliente.acessoPermanente) {
            const agora = new Date();
            const expira = new Date(cliente.keyInfo.dataExpiracao);
            cliente.temAcesso = agora <= expira;
        }
        
        return cliente;
    }

    // NOVO: Adicionar/remover favoritos
    toggleFavorito(numero, contaId) {
        const cliente = this.getPerfil(numero);
        
        if (!cliente.jogosFavoritos) cliente.jogosFavoritos = [];
        
        const index = cliente.jogosFavoritos.indexOf(contaId);
        
        if (index >= 0) {
            // Remove dos favoritos
            cliente.jogosFavoritos.splice(index, 1);
            this.salvarDados();
            return { adicionado: false, total: cliente.jogosFavoritos.length };
        } else {
            // Adiciona aos favoritos
            cliente.jogosFavoritos.push(contaId);
            this.salvarDados();
            
            // Incrementa contador na conta
            const conta = this.data.contas.find(c => c.id === contaId);
            if (conta) {
                conta.favoritos = (conta.favoritos || 0) + 1;
                this.salvarDados();
            }
            
            return { adicionado: true, total: cliente.jogosFavoritos.length };
        }
    }

    getFavoritos(numero) {
        const cliente = this.getPerfil(numero);
        if (!cliente.jogosFavoritos || cliente.jogosFavoritos.length === 0) {
            return [];
        }
        
        return cliente.jogosFavoritos.map(id => 
            this.data.contas.find(c => c.id === id)
        ).filter(Boolean);
    }

    registrarJogoResgatado(numero, conta) {
        const numLimpo = numero.replace('@s.whatsapp.net', '').replace('@g.us', '').split(':')[0];
        const cliente = this.data.clientes[numero] || this.data.clientes[numLimpo];
        
        if (!cliente) return;
        
        if (!cliente.jogosResgatados) {
            cliente.jogosResgatados = [];
        }
        
        // Adiciona ao histórico
        cliente.jogosResgatados.unshift({
            id: conta.id,
            jogo: conta.jogo,
            categoria: conta.categoria,
            login: conta.login,
            senha: conta.senha,
            dataResgate: new Date().toISOString()
        });
        
        // Mantém só os últimos 50 jogos no histórico
        if (cliente.jogosResgatados.length > 50) {
            cliente.jogosResgatados = cliente.jogosResgatados.slice(0, 50);
        }
        
        cliente.totalJogosResgatados = cliente.jogosResgatados.length;
        
        // Atualiza estatísticas da conta
        const contaDB = this.data.contas.find(c => c.id === conta.id);
        if (contaDB) {
            contaDB.totalResgates = (contaDB.totalResgates || 0) + 1;
            contaDB.historicoResgates.push({
                numero: numero,
                data: new Date().toISOString()
            });
        }
        
        this.salvarDados();
        this.logAcao('RESGATAR_JOGO', numero, { jogo: conta.jogo, contaId: conta.id });
    }

    // NOVO: Sistema de indicação
    registrarIndicacao(numeroIndicador, numeroIndicado) {
        const indicador = this.getPerfil(numeroIndicador);
        
        if (!indicador.indicacoes) indicador.indicacoes = 0;
        indicador.indicacoes++;
        
        // Ganha 2 horas de bônus por indicação
        if (!indicador.horasBonus) indicador.horasBonus = 0;
        indicador.horasBonus += 2;
        
        this.salvarDados();
        this.logAcao('INDICACAO', numeroIndicador, { indicado: numeroIndicado });
        
        return { horasGanhas: 2, totalIndicacoes: indicador.indicacoes };
    }

    // ==========================================
    // ESTATÍSTICAS E RELATÓRIOS
    // ==========================================
    
    getEstatisticas() {
        const totalJogos = this.data.contas.length;
        const disponiveis = this.data.contas.length;
        const keysAtivas = this.data.keys.filter(k => k.usada).length;
        const keysDisponiveis = this.data.keys.filter(k => !k.usada).length;
        const totalClientes = Object.keys(this.data.clientes).length;
        
        // Clientes ativos (acesso válido)
        const agora = new Date();
        const clientesAtivos = Object.values(this.data.clientes).filter(c => {
            if (c.acessoPermanente) return true;
            if (c.keyInfo && c.keyInfo.dataExpiracao) {
                return new Date(c.keyInfo.dataExpiracao) > agora;
            }
            return false;
        }).length;
        
        // Clientes inativos (acesso expirado)
        const clientesInativos = totalClientes - clientesAtivos;
        
        return {
            totalJogos,
            disponiveis,
            keysAtivas,
            keysDisponiveis,
            totalClientes,
            clientesAtivos,
            clientesInativos,
            banidos: this.data.banidos.length,
            masterKeyUsada: this.data.masterKeyUsada,
            totalLogs: this.data.logs.length
        };
    }

    getTodosClientes() {
        return Object.values(this.data.clientes).map(c => ({
            numero: c.numero,
            nome: c.nome,
            ativo: c.temAcesso,
            expira: c.keyInfo?.expira || 'N/A'
        }));
    }

    // NOVO: Clientes ativos vs inativos para admin
    getClientesPorStatus() {
        const agora = new Date();
        const ativos = [];
        const inativos = [];
        const expirando = []; // Expira em menos de 24h
        
        Object.values(this.data.clientes).forEach(c => {
            const info = {
                numero: c.numero,
                nome: c.nome,
                plano: c.keyInfo?.plano || 'Nenhum',
                expira: c.keyInfo?.expira || 'N/A'
            };
            
            if (c.acessoPermanente) {
                ativos.push({ ...info, tipo: 'Lifetime' });
            } else if (c.keyInfo && c.keyInfo.dataExpiracao) {
                const expira = new Date(c.keyInfo.dataExpiracao);
                const horasRestantes = (expira - agora) / (1000 * 60 * 60);
                
                if (horasRestantes > 0) {
                    ativos.push(info);
                    
                    if (horasRestantes < 24) {
                        expirando.push({ ...info, horas: Math.floor(horasRestantes) });
                    }
                } else {
                    inativos.push(info);
                }
            } else {
                inativos.push(info);
            }
        });
        
        return { ativos, inativos, expirando };
    }

    getJogosMaisPopulares(limite = 10) {
        return this.data.contas
            .sort((a, b) => (b.totalResgates || 0) - (a.totalResgates || 0))
            .slice(0, limite)
            .map(c => ({
                jogo: c.jogo,
                resgates: c.totalResgates || 0,
                favoritos: c.favoritos || 0
            }));
    }

    // ==========================================
    // ADMIN
    // ==========================================
    
    isAdminMaster(numero) {
        return this.data.admins.includes(numero);
    }

    // ==========================================
    // IMPORTAÇÃO
    // ==========================================
    
    importarTXTInteligente(texto) {
        const linhas = texto.split('\n');
        let adicionadas = 0;
        let ignoradas = 0;
        let erros = 0;
        const jogosUnicos = new Set();
        const categoriasDetectadas = new Set();

        for (const linha of linhas) {
            const limpa = linha.trim();
            if (!limpa) continue;

            const partes = limpa.split('|').map(p => p.trim());
            
            if (partes.length >= 4) {
                const [jogo, categoria, login, senha] = partes;
                
                if (jogo && login && senha) {
                    this.addConta(jogo, categoria || 'Outros', login, senha);
                    adicionadas++;
                    jogosUnicos.add(jogo);
                    if (categoria) categoriasDetectadas.add(categoria);
                } else {
                    erros++;
                }
            } else {
                ignoradas++;
            }
        }

        this.logAcao('IMPORTACAO', 'ADMIN', { adicionadas, ignoradas, erros });
        
        return {
            sucesso: adicionadas > 0,
            adicionadas,
            ignoradas,
            erros,
            jogosUnicos: jogosUnicos.size,
            categoriasDetectadas: categoriasDetectadas.size
        };
    }
}

module.exports = Database;
