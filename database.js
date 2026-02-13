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
        
        this.contas = this.loadJson(this.contasFile, []);
        this.keys = this.loadJson(this.keysFile, []);
        this.clientes = this.loadJson(this.clientesFile, {});
        this.logs = this.loadJson(this.logsFile, []);
        this.banidos = this.loadJson(this.banidosFile, []);
        
        this.masterKeyUsada = false;
        this.nextContaId = this.contas.length > 0 ? Math.max(...this.contas.map(c => c.id || 0)) + 1 : 1;
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
        } catch (e) {
            console.error(`Erro ao carregar ${file}:`, e.message);
        }
        return defaultValue;
    }
    
    saveJson(file, data) {
        try {
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error(`Erro ao salvar ${file}:`, e.message);
        }
    }
    
    saveAll() {
        this.saveJson(this.contasFile, this.contas);
        this.saveJson(this.keysFile, this.keys);
        this.saveJson(this.clientesFile, this.clientes);
        this.saveJson(this.logsFile, this.logs);
        this.saveJson(this.banidosFile, this.banidos);
    }
    
    // ========== CONTAS ==========
    adicionarConta(conta) {
        const novaConta = {
            id: this.nextContaId++,
            jogo: conta.jogo,
            login: conta.login,
            senha: conta.senha,
            categoria: conta.categoria || '🎮 Ação/Aventura',
            plataforma: conta.plataforma || 'Steam',
            dataAdicao: new Date().toISOString(),
            disponivel: true
        };
        this.contas.push(novaConta);
        this.saveJson(this.contasFile, this.contas);
        this.log('ADICIONAR_CONTA', 'sistema', { jogo: conta.jogo });
        return { sucesso: true, id: novaConta.id };
    }
    
    removerConta(id) {
        const index = this.contas.findIndex(c => c.id === id);
        if (index === -1) return { sucesso: false, erro: 'Conta não encontrada' };
        const conta = this.contas[index];
        this.contas.splice(index, 1);
        this.saveJson(this.contasFile, this.contas);
        this.log('REMOVER_CONTA', 'sistema', { id, jogo: conta.jogo });
        return { sucesso: true };
    }
    
    removerContaPorNome(nome) {
        const index = this.contas.findIndex(c => c.jogo.toLowerCase().includes(nome.toLowerCase()));
        if (index === -1) return { sucesso: false };
        const conta = this.contas[index];
        this.contas.splice(index, 1);
        this.saveJson(this.contasFile, this.contas);
        return { sucesso: true, jogo: conta.jogo };
    }
    
    buscarConta(nome) {
        return this.contas.find(c => 
            c.disponivel && 
            c.jogo.toLowerCase().includes(nome.toLowerCase())
        );
    }
    
    buscarContaAleatoria(nome) {
        const matches = this.contas.filter(c => 
            c.disponivel && 
            c.jogo.toLowerCase().includes(nome.toLowerCase())
        );
        if (matches.length === 0) return null;
        return matches[Math.floor(Math.random() * matches.length)];
    }
    
    buscarContasSimilares(nome, limite = 3) {
        return this.contas
            .filter(c => c.disponivel)
            .filter(c => {
                const jogoLower = c.jogo.toLowerCase();
                const nomeLower = nome.toLowerCase();
                // Verifica se alguma palavra do nome está no jogo
                const palavras = nomeLower.split(/\s+/);
                return palavras.some(p => jogoLower.includes(p));
            })
            .slice(0, limite);
    }
    
    getTodosJogosDisponiveis() {
        return this.contas.filter(c => c.disponivel);
    }
    
    // ========== KEYS ==========
    gerarKey(key, plano, dias, geradoPor) {
        const expira = new Date();
        expira.setDate(expira.getDate() + dias);
        
        const novaKey = {
            key: key,
            plano: plano,
            dias: dias,
            expira: expira.toISOString(),
            usada: false,
            usadaPor: null,
            dataUso: null,
            geradoPor: geradoPor,
            dataGeracao: new Date().toISOString()
        };
        
        this.keys.push(novaKey);
        this.saveJson(this.keysFile, this.keys);
        this.log('GERAR_KEY', geradoPor, { key, plano });
        return { sucesso: true };
    }
    
    resgatarKey(key, numero, nome) {
        const keyObj = this.keys.find(k => k.key === key && !k.usada);
        if (!keyObj) return { sucesso: false, erro: 'Key inválida ou já usada' };
        
        keyObj.usada = true;
        keyObj.usadaPor = numero;
        keyObj.dataUso = new Date().toISOString();
        this.saveJson(this.keysFile, this.keys);
        
        // Atualiza cliente
        if (!this.clientes[numero]) {
            this.clientes[numero] = this.criarPerfil(numero, nome);
        }
        this.clientes[numero].temAcesso = true;
        this.clientes[numero].keyInfo = {
            key: key,
            plano: keyObj.plano,
            expira: new Date(keyObj.expira).toLocaleDateString('pt-BR'),
            dataExpiracao: keyObj.expira
        };
        this.clientes[numero].keysResgatadas.push({
            key: key,
            plano: keyObj.plano,
            data: new Date().toISOString()
        });
        this.saveJson(this.clientesFile, this.clientes);
        
        this.log('RESGATAR_KEY', numero, { key, plano: keyObj.plano });
        return { 
            sucesso: true, 
            plano: keyObj.plano, 
            expira: new Date(keyObj.expira).toLocaleDateString('pt-BR')
        };
    }
    
    resgatarMasterKey(key, numero, nome) {
        if (this.masterKeyUsada) {
            return { sucesso: false, erro: 'Master key já usada' };
        }
        
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
    gerarKeyTesteAdmin(key, duracao, horas, geradoPor) {
        const expira = new Date();
        expira.setHours(expira.getHours() + horas);
        
        const novaKey = {
            key: key,
            tipo: 'teste',
            duracao: duracao,
            horas: horas,
            expira: expira.toISOString(),
            usada: false,
            usadaPor: null,
            dataUso: null,
            geradoPor: geradoPor,
            dataGeracao: new Date().toISOString()
        };
        
        this.keys.push(novaKey);
        this.saveJson(this.keysFile, this.keys);
        this.log('GERAR_KEY_TESTE', geradoPor, { key, duracao });
        return { sucesso: true, expira: expira.toLocaleString('pt-BR') };
    }
    
    criarKeyTeste(key, duracao, horas, numero, nome) {
        const expira = new Date();
        expira.setHours(expira.getHours() + horas);
        
        const novaKey = {
            key: key,
            tipo: 'teste',
            duracao: duracao,
            horas: horas,
            expira: expira.toISOString(),
            usada: true,
            usadaPor: numero,
            dataUso: new Date().toISOString()
        };
        
        this.keys.push(novaKey);
        this.saveJson(this.keysFile, this.keys);
        
        // Atualiza cliente
        if (!this.clientes[numero]) {
            this.clientes[numero] = this.criarPerfil(numero, nome);
        }
        this.clientes[numero].temAcesso = true;
        this.clientes[numero].usouTeste = true;
        this.clientes[numero].keyInfo = {
            key: key,
            plano: 'teste',
            expira: expira.toLocaleString('pt-BR'),
            dataExpiracao: expira.toISOString()
        };
        this.saveJson(this.clientesFile, this.clientes);
        
        this.log('USAR_TESTE', numero, { key, duracao });
        return { sucesso: true, expira: expira.toLocaleString('pt-BR') };
    }
    
    verificarTesteUsado(numero) {
        return this.clientes[numero]?.usouTeste === true;
    }
    
    // ========== CLIENTES ==========
    criarPerfil(numero, nome) {
        return {
            numero: numero,
            nome: nome,
            dataRegistro: new Date().toISOString(),
            temAcesso: false,
            acessoPermanente: false,
            usouTeste: false,
            isAdmin: false,
            keyInfo: null,
            jogosResgatados: [],
            jogosFavoritos: [],
            keysResgatadas: [],
            indicacoes: 0,
            horasBonus: 0
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
        
        // Verifica se expirou
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
    
    // ========== JOGOS RESGATADOS ==========
    registrarJogoResgatado(numero, conta) {
        if (!this.clientes[numero]) return;
        
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
        
        const favoritos = this.clientes[numero].jogosFavoritos || [];
        const index = favoritos.indexOf(contaId);
        
        if (index === -1) {
            favoritos.push(contaId);
            var adicionado = true;
        } else {
            favoritos.splice(index, 1);
            var adicionado = false;
        }
        
        this.clientes[numero].jogosFavoritos = favoritos;
        this.saveJson(this.clientesFile, this.clientes);
        
        return { adicionado, total: favoritos.length };
    }
    
    // ========== INDICAÇÕES ==========
    registrarIndicacao(indicadorNumero, indicadoNumero) {
        if (!this.clientes[indicadorNumero]) {
            return { sucesso: false, erro: 'Indicador não encontrado' };
        }
        
        // Verifica se indicado já usou o bot
        if (this.clientes[indicadoNumero]) {
            return { sucesso: false, erro: 'Indicado já usou o bot' };
        }
        
        const horasGanhas = 2;
        this.clientes[indicadorNumero].indicacoes++;
        this.clientes[indicadorNumero].horasBonus += horasGanhas;
        
        // Adiciona horas extras ao plano atual
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
            this.banidos.push({
                numero: numero,
                motivo: motivo,
                data: new Date().toISOString()
            });
            this.saveJson(this.banidosFile, this.banidos);
            this.log('BANIR', numero, { motivo });
        }
        
        // Remove acesso
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
    
    // ========== LOGS ==========
    log(tipo, numero, detalhes = {}) {
        const logEntry = {
            tipo: tipo,
            numero: numero,
            data: new Date().toISOString(),
            detalhes: detalhes
        };
        this.logs.unshift(logEntry);
        
        // Mantém apenas últimos 1000 logs
        if (this.logs.length > 1000) {
            this.logs = this.logs.slice(0, 1000);
        }
        
        this.saveJson(this.logsFile, this.logs);
        
        // Log no console também
        console.log(`[${tipo}] ${numero.substring(0, 15)}... - ${JSON.stringify(detalhes).substring(0, 50)}`);
    }
    
    getLogs(filtro = {}, limite = 50) {
        let resultado = this.logs;
        
        if (filtro.tipo) {
            resultado = resultado.filter(l => l.tipo === filtro.tipo);
        }
        
        if (filtro.numero) {
            resultado = resultado.filter(l => l.numero === filtro.numero);
        }
        
        return resultado.slice(0, limite);
    }
    
    // ========== ESTATÍSTICAS ==========
    getEstatisticas() {
        const { ativos, inativos } = this.getClientesPorStatus();
        
        return {
            totalJogos: this.contas.length,
            disponiveis: this.contas.filter(c => c.disponivel).length,
            keysAtivas: this.keys.filter(k => k.usada).length,
            keysDisponiveis: this.keys.filter(k => !k.usada).length,
            totalClientes: Object.keys(this.clientes).length,
            clientesAtivos: ativos.length,
            clientesInativos: inativos.length,
            banidos: this.banidos.length,
            masterKeyUsada: this.masterKeyUsada,
            totalLogs: this.logs.length
        };
    }
}

module.exports = Database;
