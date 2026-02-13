const fs = require('fs');
const path = require('path');

class Database {
    constructor() {
        this.dataDir = './data';
        this.ensureDataDir();
        
        this.contasFile = path.join(this.dataDir, 'contas.json');
        this.keysFile = path.join(this.dataDir, 'keys.json');
        this.clientesFile = path.join(this.dataDir, 'clientes.json');
        this.logsFile = path.join(this.dataDir, 'logs.json');
        this.banidosFile = path.join(this.dataDir, 'banidos.json');
        this.cuponsFile = path.join(this.dataDir, 'cupons.json');
        this.ticketsFile = path.join(this.dataDir, 'tickets.json');
        this.blacklistFile = path.join(this.dataDir, 'blacklist.json');
        
        this.contas = this.loadJson(this.contasFile, []);
        this.keys = this.loadJson(this.keysFile, []);
        this.clientes = this.loadJson(this.clientesFile, {});
        this.logs = this.loadJson(this.logsFile, []);
        this.banidos = this.loadJson(this.banidosFile, []);
        this.cupons = this.loadJson(this.cuponsFile, []);
        this.tickets = this.loadJson(this.ticketsFile, []);
        this.blacklist = this.loadJson(this.blacklistFile, []);
        
        this.masterKeyUsada = false;
        this.nextContaId = this.contas.length > 0 ? Math.max(...this.contas.map(c => c.id || 0)) + 1 : 1;
        this.nextTicketId = this.tickets.length > 0 ? Math.max(...this.tickets.map(t => t.id || 0)) + 1 : 1;
    }
    
    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }
    
    loadJson(file, defaultValue) {
        try {
            if (fs.existsSync(file)) {
                return JSON.parse(fs.readFileSync(file, 'utf8'));
            }
        } catch (e) {}
        return defaultValue;
    }
    
    saveJson(file, data) {
        try {
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
        } catch (e) {}
    }
    
    // ========== CONTAS ==========
    adicionarConta(conta) {
        const novaConta = {
            id: this.nextContaId++,
            jogo: conta.jogo || 'Conta Steam',
            login: conta.login,
            senha: conta.senha,
            categoria: conta.categoria || '🎮 Acao/Aventura',
            plataforma: conta.plataforma || 'Steam',
            dataAdicao: new Date().toISOString(),
            disponivel: true,
            resgates: 0 // Contador de resgates (para contas ilimitadas)
        };
        this.contas.push(novaConta);
        this.saveJson(this.contasFile, this.contas);
        this.log('ADICIONAR_CONTA', 'sistema', { jogo: conta.jogo });
        return { sucesso: true, id: novaConta.id };
    }
    
    removerConta(id) {
        const index = this.contas.findIndex(c => c.id === id);
        if (index === -1) return { sucesso: false };
        this.contas.splice(index, 1);
        this.saveJson(this.contasFile, this.contas);
        return { sucesso: true };
    }
    
    removerTodasContas() {
        const total = this.contas.length;
        this.contas = [];
        this.nextContaId = 1;
        this.saveJson(this.contasFile, this.contas);
        this.log('REMOVER_TODOS', 'sistema', { total });
        return total;
    }
    
    // ========== CONTAS ILIMITADAS ==========
    buscarContaIlimitada(nome) {
        // Busca por nome do jogo
        const conta = this.contas.find(c => 
            c.jogo.toLowerCase().includes(nome.toLowerCase())
        );
        
        if (conta) {
            // Incrementa contador de resgates (rastreamento)
            conta.resgates = (conta.resgates || 0) + 1;
            this.saveJson(this.contasFile, this.contas);
        }
        
        return conta;
    }
    
    buscarConta(nome) {
        return this.buscarContaIlimitada(nome);
    }
    
    buscarContasSimilares(nome, limite = 3) {
        return this.contas
            .filter(c => {
                const jogoLower = c.jogo.toLowerCase();
                const nomeLower = nome.toLowerCase();
                const palavras = nomeLower.split(/\s+/);
                return palavras.some(p => jogoLower.includes(p));
            })
            .slice(0, limite);
    }
    
    getTodosJogosDisponiveis() {
        return this.contas;
    }
    
    getTodasContas() {
        return this.contas;
    }
    
    getJogosRecentes(limite = 5) {
        return this.contas
            .sort((a, b) => new Date(b.dataAdicao) - new Date(a.dataAdicao))
            .slice(0, limite);
    }
    
    // ========== KEYS ==========
    gerarKey(key, plano, dias, geradoPor) {
        const expira = new Date();
        expira.setDate(expira.getDate() + dias);
        
        this.keys.push({
            key, plano, dias,
            expira: expira.toISOString(),
            usada: false, usadaPor: null, dataUso: null,
            geradoPor, dataGeracao: new Date().toISOString()
        });
        
        this.saveJson(this.keysFile, this.keys);
        this.log('GERAR_KEY', geradoPor, { key, plano });
        return { sucesso: true };
    }
    
    resgatarKey(key, numero, nome) {
        const keyObj = this.keys.find(k => k.key === key && !k.usada);
        if (!keyObj) return { sucesso: false, erro: 'Key invalida ou ja usada' };
        
        keyObj.usada = true;
        keyObj.usadaPor = numero;
        keyObj.dataUso = new Date().toISOString();
        this.saveJson(this.keysFile, this.keys);
        
        if (!this.clientes[numero]) {
            this.clientes[numero] = this.criarPerfil(numero, nome);
        }
        
        this.clientes[numero].temAcesso = true;
        this.clientes[numero].keyInfo = {
            key, plano: keyObj.plano,
            expira: new Date(keyObj.expira).toLocaleDateString('pt-BR'),
            dataExpiracao: keyObj.expira
        };
        
        if (!this.clientes[numero].keysResgatadas) {
            this.clientes[numero].keysResgatadas = [];
        }
        this.clientes[numero].keysResgatadas.push({ key, plano: keyObj.plano, data: new Date().toISOString() });
        
        this.saveJson(this.clientesFile, this.clientes);
        this.log('RESGATAR_KEY', numero, { key, plano: keyObj.plano });
        
        return { 
            sucesso: true, 
            plano: keyObj.plano, 
            expira: new Date(keyObj.expira).toLocaleDateString('pt-BR')
        };
    }
    
    resgatarMasterKey(key, numero, nome) {
        this.masterKeyUsada = true;
        
        if (!this.clientes[numero]) {
            this.clientes[numero] = this.criarPerfil(numero, nome);
        }
        
        this.clientes[numero].temAcesso = true;
        this.clientes[numero].acessoPermanente = true;
        this.clientes[numero].isAdmin = true;
        this.saveJson(this.clientesFile, this.clientes);
        
        this.log('MASTER_KEY', numero, { key });
        return { sucesso: true };
    }
    
    isAdminMaster(numero) {
        return this.clientes[numero]?.isAdmin === true;
    }
    
    // ========== KEYS TESTE ==========
    gerarKeyTeste(key, duracao, horas) {
        const expira = new Date();
        expira.setHours(expira.getHours() + horas);
        
        this.keys.push({
            key, tipo: 'teste', duracao, horas,
            expira: expira.toISOString(),
            usada: false, usadaPor: null, dataUso: null,
            dataGeracao: new Date().toISOString()
        });
        
        this.saveJson(this.keysFile, this.keys);
        return { sucesso: true, expira: expira.toLocaleString('pt-BR') };
    }
    
    // ========== CLIENTES ==========
    criarPerfil(numero, nome) {
        return {
            numero, nome: nome || 'Cliente',
            dataRegistro: new Date().toISOString(),
            temAcesso: false, acessoPermanente: false,
            usouTeste: false, isAdmin: false,
            keyInfo: null,
            jogosResgatados: [],
            jogosFavoritos: [],
            keysResgatadas: [],
            indicacoes: 0, horasBonus: 0,
            pontos: 0,
            lembrete24h: false, lembrete6h: false
        };
    }
    
    getPerfil(numero) {
        return this.clientes[numero] || this.criarPerfil(numero, 'Cliente');
    }
    
    verificarAcesso(numero) {
        const cliente = this.clientes[numero];
        if (!cliente) return false;
        if (cliente.acessoPermanente) return true;
        if (!cliente.temAcesso) return false;
        
        if (cliente.keyInfo?.dataExpiracao) {
            const expira = new Date(cliente.keyInfo.dataExpiracao);
            if (expira < new Date()) {
                cliente.temAcesso = false;
                this.saveJson(this.clientesFile, this.clientes);
                return false;
            }
        }
        return true;
    }
    
    getTodosClientes() {
        return Object.values(this.clientes);
    }
    
    getClientesPorStatus() {
        const todos = Object.values(this.clientes);
        const agora = new Date();
        const amanha = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
        
        const ativos = todos.filter(c => {
            if (!c.temAcesso) return false;
            if (c.acessoPermanente) return true;
            if (c.keyInfo?.dataExpiracao) {
                return new Date(c.keyInfo.dataExpiracao) > agora;
            }
            return false;
        });
        
        const inativos = todos.filter(c => !c.temAcesso || (c.keyInfo?.dataExpiracao && new Date(c.keyInfo.dataExpiracao) <= agora));
        
        const expirando = ativos.filter(c => {
            if (c.acessoPermanente) return false;
            if (c.keyInfo?.dataExpiracao) {
                const expira = new Date(c.keyInfo.dataExpiracao);
                return expira <= amanha && expira > agora;
            }
            return false;
        }).map(c => ({
            nome: c.nome,
            horas: Math.ceil((new Date(c.keyInfo.dataExpiracao) - agora) / (1000 * 60 * 60))
        }));
        
        return { ativos, inativos, expirando };
    }
    
    // ========== RANKING ==========
    getRankingClientes(limite = 10) {
        return Object.values(this.clientes)
            .map(c => ({
                nome: c.nome,
                jogos: (c.jogosResgatados || []).length,
                pontos: c.pontos || 0
            }))
            .sort((a, b) => b.jogos - a.jogos)
            .slice(0, limite);
    }
    
    // ========== PONTOS ==========
    adicionarPontos(numero, pontos) {
        if (!this.clientes[numero]) return;
        this.clientes[numero].pontos = (this.clientes[numero].pontos || 0) + pontos;
        this.saveJson(this.clientesFile, this.clientes);
    }
    
    adicionarDiasExtras(numero, dias) {
        if (!this.clientes[numero]) return;
        if (!this.clientes[numero].keyInfo?.dataExpiracao) return;
        
        const expira = new Date(this.clientes[numero].keyInfo.dataExpiracao);
        expira.setDate(expira.getDate() + dias);
        this.clientes[numero].keyInfo.dataExpiracao = expira.toISOString();
        this.clientes[numero].keyInfo.expira = expira.toLocaleDateString('pt-BR');
        this.saveJson(this.clientesFile, this.clientes);
    }
    
    // ========== JOGOS RESGATADOS ==========
    registrarJogoResgatado(numero, conta) {
        if (!this.clientes[numero]) return;
        
        if (!this.clientes[numero].jogosResgatados) {
            this.clientes[numero].jogosResgatados = [];
        }
        
        this.clientes[numero].jogosResgatados.push({
            id: conta.id,
            jogo: conta.jogo,
            login: conta.login,
            senha: conta.senha,
            categoria: conta.categoria,
            dataResgate: new Date().toISOString()
        });
        
        this.saveJson(this.clientesFile, this.clientes);
        this.log('RESGATAR_JOGO', numero, { jogo: conta.jogo });
    }
    
    // ========== FAVORITOS ==========
    getFavoritos(numero) {
        const cliente = this.clientes[numero];
        if (!cliente || !cliente.jogosFavoritos) return [];
        return cliente.jogosFavoritos.map(id => this.contas.find(c => c.id === id)).filter(Boolean);
    }
    
    toggleFavorito(numero, contaId) {
        if (!this.clientes[numero]) return { adicionado: false, total: 0 };
        
        if (!this.clientes[numero].jogosFavoritos) {
            this.clientes[numero].jogosFavoritos = [];
        }
        
        const favoritos = this.clientes[numero].jogosFavoritos;
        const index = favoritos.indexOf(contaId);
        
        let adicionado;
        if (index === -1) {
            favoritos.push(contaId);
            adicionado = true;
        } else {
            favoritos.splice(index, 1);
            adicionado = false;
        }
        
        this.saveJson(this.clientesFile, this.clientes);
        return { adicionado, total: favoritos.length };
    }
    
    // ========== INDICAÇÕES ==========
    registrarIndicacao(indicadorNumero, indicadoNumero) {
        if (!this.clientes[indicadorNumero]) {
            return { sucesso: false, erro: 'Indicador nao encontrado' };
        }
        
        if (this.clientes[indicadoNumero]) {
            return { sucesso: false, erro: 'Indicado ja usou o bot' };
        }
        
        const horasGanhas = 2;
        this.clientes[indicadorNumero].indicacoes = (this.clientes[indicadorNumero].indicacoes || 0) + 1;
        this.clientes[indicadorNumero].horasBonus = (this.clientes[indicadorNumero].horasBonus || 0) + horasGanhas;
        
        if (this.clientes[indicadorNumero].keyInfo?.dataExpiracao) {
            const expira = new Date(this.clientes[indicadorNumero].keyInfo.dataExpiracao);
            expira.setHours(expira.getHours() + horasGanhas);
            this.clientes[indicadorNumero].keyInfo.dataExpiracao = expira.toISOString();
            this.clientes[indicadorNumero].keyInfo.expira = expira.toLocaleDateString('pt-BR');
        }
        
        this.saveJson(this.clientesFile, this.clientes);
        this.log('INDICACAO', indicadorNumero, { indicado: indicadoNumero, horas: horasGanhas });
        
        return { sucesso: true, horasGanhas };
    }
    
    // ========== BANIDOS ==========
    banirUsuario(numero, motivo) {
        if (!this.banidos.find(b => b.numero === numero)) {
            this.banidos.push({ numero, motivo, data: new Date().toISOString() });
            this.saveJson(this.banidosFile, this.banidos);
            this.log('BANIR', numero, { motivo });
        }
        
        if (this.clientes[numero]) {
            this.clientes[numero].temAcesso = false;
            this.saveJson(this.clientesFile, this.clientes);
        }
    }
    
    desbanirUsuario(numero) {
        const index = this.banidos.findIndex(b => b.numero === numero);
        if (index !== -1) {
            this.banidos.splice(index, 1);
            this.saveJson(this.banidosFile, this.banidos);
            this.log('DESBANIR', numero, {});
            return true;
        }
        return false;
    }
    
    isBanido(numero) {
        return this.banidos.some(b => b.numero === numero);
    }
    
    // ========== BLACKLIST ==========
    getBlacklist() {
        return this.blacklist;
    }
    
    adicionarBlacklist(login, motivo) {
        if (!this.blacklist.find(b => b.login === login)) {
            this.blacklist.push({ login, motivo, data: new Date().toISOString() });
            this.saveJson(this.blacklistFile, this.blacklist);
        }
    }
    
    // ========== CUPONS ==========
    criarCupom(codigo, desconto, criadoPor) {
        this.cupons.push({
            codigo: codigo.toUpperCase(),
            desconto,
            criadoPor,
            dataCriacao: new Date().toISOString(),
            usado: false
        });
        this.saveJson(this.cuponsFile, this.cupons);
    }
    
    verificarCupom(codigo) {
        const cupom = this.cupons.find(c => c.codigo === codigo.toUpperCase() && !c.usado);
        if (cupom) {
            return { valido: true, codigo: cupom.codigo, desconto: cupom.desconto };
        }
        return { valido: false };
    }
    
    // ========== TICKETS ==========
    criarTicket(ticket) {
        ticket.id = 'TKT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        ticket.status = 'aberto';
        ticket.data = new Date().toISOString();
        this.tickets.push(ticket);
        this.saveJson(this.ticketsFile, this.tickets);
        this.log('TICKET_ABERTO', ticket.numero, { id: ticket.id, tipo: ticket.tipo });
        return ticket;
    }
    
    getTicketsAbertos() {
        return this.tickets.filter(t => t.status === 'aberto');
    }
    
    // ========== LOGS ==========
    log(tipo, numero, detalhes = {}) {
        const logEntry = {
            tipo, numero,
            data: new Date().toISOString(),
            detalhes
        };
        this.logs.unshift(logEntry);
        if (this.logs.length > 1000) this.logs = this.logs.slice(0, 1000);
        this.saveJson(this.logsFile, this.logs);
    }
    
    getLogs(filtro = {}, limite = 50) {
        let resultado = this.logs;
        if (filtro.tipo) resultado = resultado.filter(l => l.tipo === filtro.tipo);
        if (filtro.numero) resultado = resultado.filter(l => l.numero === filtro.numero);
        return resultado.slice(0, limite);
    }
    
    // ========== ESTATÍSTICAS ==========
    getEstatisticas() {
        const { ativos, inativos } = this.getClientesPorStatus();
        const vendas = this.keys.filter(k => k.usada).reduce((acc, k) => {
            if (k.plano === '7dias') return acc + 10;
            if (k.plano === '1mes') return acc + 25;
            if (k.plano === 'lifetime') return acc + 80;
            return acc;
        }, 0);
        
        const totalPontos = Object.values(this.clientes).reduce((acc, c) => acc + (c.pontos || 0), 0);
        
        return {
            totalJogos: this.contas.length,
            disponiveis: this.contas.length,
            keysAtivas: this.keys.filter(k => k.usada).length,
            keysDisponiveis: this.keys.filter(k => !k.usada).length,
            totalClientes: Object.keys(this.clientes).length,
            clientesAtivos: ativos.length,
            clientesInativos: inativos.length,
            banidos: this.banidos.length,
            masterKeyUsada: this.masterKeyUsada,
            totalLogs: this.logs.length,
            totalVendas: vendas,
            totalPontos,
            ticketsAbertos: this.getTicketsAbertos().length
        };
    }
}

module.exports = Database;
