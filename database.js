const fs = require('fs');
const path = require('path');

class Database {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        this.ensureDirectory();
        
        this.files = {
            contas: path.join(this.dataDir, 'contas.json'),
            clientes: path.join(this.dataDir, 'clientes.json'),
            keys: path.join(this.dataDir, 'keys.json'),
            logs: path.join(this.dataDir, 'logs.json'),
            blacklist: path.join(this.dataDir, 'blacklist.json'),
            cupons: path.join(this.dataDir, 'cupons.json'),
            favoritos: path.join(this.dataDir, 'favoritos.json'),
            indicacoes: path.join(this.dataDir, 'indicacoes.json'),
            tickets: path.join(this.dataDir, 'tickets.json'),
            config: path.join(this.dataDir, 'config.json')
        };
        
        this.data = {};
        this.loadAll();
    }
    
    ensureDirectory() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }
    
    loadAll() {
        for (const [key, filePath] of Object.entries(this.files)) {
            try {
                if (fs.existsSync(filePath)) {
                    this.data[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                } else {
                    this.data[key] = [];
                    if (key === 'config') this.data[key] = {};
                    this.save(key);
                }
            } catch (e) {
                this.data[key] = [];
                if (key === 'config') this.data[key] = {};
            }
        }
    }
    
    save(key) {
        try {
            fs.writeFileSync(this.files[key], JSON.stringify(this.data[key], null, 2));
        } catch (e) {
            console.error(`Erro ao salvar ${key}:`, e);
        }
    }
    
    // ============== CONTAS ==============
    addConta(conta) {
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        const novaConta = {
            id,
            jogo: conta.jogo,
            login: conta.login,
            senha: conta.senha,
            dataAdicao: Date.now(),
            usos: 0
        };
        this.data.contas.push(novaConta);
        this.save('contas');
        this.log(`Conta adicionada: ${conta.jogo}`);
        return id;
    }
    
    addMultiplasContas(contas) {
        let adicionadas = 0;
        let erros = 0;
        
        for (const conta of contas) {
            if (conta.jogo && conta.login && conta.senha) {
                this.addConta(conta);
                adicionadas++;
            } else {
                erros++;
            }
        }
        
        this.log(`Importação em massa: ${adicionadas} adicionadas, ${erros} erros`);
        return { adicionadas, erros };
    }
    
    removeConta(id) {
        const index = this.data.contas.findIndex(c => c.id === id);
        if (index !== -1) {
            const conta = this.data.contas[index];
            this.data.contas.splice(index, 1);
            this.save('contas');
            this.log(`Conta removida: ${conta.jogo}`);
            return true;
        }
        return false;
    }
    
    removerTodasContas() {
        const total = this.data.contas.length;
        this.data.contas = [];
        this.save('contas');
        this.log(`TODAS as contas removidas (${total})`);
        return total;
    }
    
    getAllAccounts() {
        return this.data.contas;
    }
    
    getAllGames() {
        const jogos = {};
        this.data.contas.forEach(c => {
            if (!jogos[c.jogo]) {
                jogos[c.jogo] = { nome: c.jogo, contas: 0 };
            }
            jogos[c.jogo].contas++;
        });
        return Object.values(jogos);
    }
    
    getContasByJogo(jogo) {
        return this.data.contas.filter(c => c.jogo.toLowerCase() === jogo.toLowerCase());
    }
    
    getContaById(id) {
        return this.data.contas.find(c => c.id === id);
    }
    
    getTotalContas() {
        return this.data.contas.length;
    }
    
    getUltimosJogos(limit = 5) {
        return this.getAllGames().slice(-limit);
    }
    
    // ============== CLIENTES ==============
    addClient(cliente) {
        const existente = this.getClient(cliente.numero);
        if (existente) {
            Object.assign(existente, cliente);
            this.save('clientes');
        } else {
            this.data.clientes.push({
                ...cliente,
                pontos: 0,
                resgates: 0,
                favoritos: [],
                dataCadastro: Date.now()
            });
            this.save('clientes');
        }
        this.log(`Novo cliente: ${cliente.numero} (${cliente.tipo})`);
    }
    
    getClient(numero) {
        return this.data.clientes.find(c => c.numero === numero);
    }
    
    getAllClients() {
        return this.data.clientes;
    }
    
    getTotalClientes() {
        return this.data.clientes.length;
    }
    
    getClientesAtivos() {
        return this.data.clientes.filter(c => c.ativo === true);
    }
    
    getClientesInativos() {
        return this.data.clientes.filter(c => !c.ativo);
    }
    
    desativarCliente(numero) {
        const cliente = this.getClient(numero);
        if (cliente) {
            cliente.ativo = false;
            this.save('clientes');
            this.log(`Cliente desativado: ${numero}`);
        }
    }
    
    isAdmin(numero) {
        const cliente = this.getClient(numero);
        return cliente && cliente.admin === true;
    }
    
    isSuperAdmin(numero) {
        const cliente = this.getClient(numero);
        return cliente && cliente.superAdmin === true;
    }
    
    // ============== SUPER ADMIN ==============
    getAllAdmins() {
        return this.data.clientes.filter(c => c.admin === true);
    }
    
    getAllSuperAdmins() {
        return this.data.clientes.filter(c => c.superAdmin === true);
    }
    
    removerAdmin(numero) {
        const cliente = this.getClient(numero);
        if (cliente) {
            cliente.admin = false;
            cliente.superAdmin = false;
            this.save('clientes');
            this.log(`Admin removido: ${numero}`);
        }
    }
    
    promoverSuperAdmin(numero) {
        const cliente = this.getClient(numero);
        if (cliente) {
            cliente.admin = true;
            cliente.superAdmin = true;
            this.save('clientes');
            this.log(`Promovido a Super Admin: ${numero}`);
        }
    }
    
    rebaixarSuperAdmin(numero) {
        const cliente = this.getClient(numero);
        if (cliente) {
            cliente.superAdmin = false;
            this.save('clientes');
            this.log(`Rebaixado de Super Admin: ${numero}`);
        }
    }
    
    isSuperAdminKeyUsed() {
        return this.data.config.superAdminKeyUsed === true;
    }
    
    marcarSuperAdminKeyUsada() {
        this.data.config.superAdminKeyUsed = true;
        this.save('config');
        this.log('KEY de Super Admin utilizada!');
    }
    
    // ============== KEYS ==============
    addKey(keyData) {
        this.data.keys.push({
            ...keyData,
            usada: false,
            usadaPor: null,
            dataUso: null
        });
        this.save('keys');
        this.log(`KEY criada: ${keyData.key} (${keyData.tipo})`);
    }
    
    getKey(key) {
        return this.data.keys.find(k => k.key === key);
    }
    
    markKeyUsed(key, usadoPor) {
        const keyData = this.getKey(key);
        if (keyData) {
            keyData.usada = true;
            keyData.usadaPor = usadoPor;
            keyData.dataUso = Date.now();
            this.save('keys');
            this.log(`KEY usada: ${key} por ${usadoPor}`);
        }
    }
    
    getTotalKeys() {
        return this.data.keys.length;
    }
    
    getKeysUsadas() {
        return this.data.keys.filter(k => k.usada).length;
    }
    
    // ============== BLACKLIST ==============
    addBlacklist(numero, motivo) {
        if (!this.data.blacklist.find(b => b.numero === numero)) {
            this.data.blacklist.push({
                numero,
                motivo,
                data: Date.now()
            });
            this.save('blacklist');
            this.log(`Blacklist: ${numero} - ${motivo}`);
        }
    }
    
    removeBlacklist(numero) {
        const index = this.data.blacklist.findIndex(b => b.numero === numero);
        if (index !== -1) {
            this.data.blacklist.splice(index, 1);
            this.save('blacklist');
            this.log(`Removido da blacklist: ${numero}`);
            return true;
        }
        return false;
    }
    
    isBlacklisted(numero) {
        return this.data.blacklist.some(b => b.numero === numero);
    }
    
    getBlacklist() {
        return this.data.blacklist;
    }
    
    // ============== CUPONS ==============
    addCupom(cupom) {
        this.data.cupons.push({
            codigo: cupom.codigo.toUpperCase(),
            desconto: cupom.desconto,
            usos: cupom.usos,
            usados: 0,
            dataCriacao: Date.now()
        });
        this.save('cupons');
        this.log(`Cupom criado: ${cupom.codigo}`);
    }
    
    getCupom(codigo) {
        return this.data.cupons.find(c => c.codigo === codigo.toUpperCase());
    }
    
    useCupom(codigo) {
        const cupom = this.getCupom(codigo);
        if (cupom && cupom.usados < cupom.usos) {
            cupom.usados++;
            this.save('cupons');
            return cupom;
        }
        return null;
    }
    
    getAllCupons() {
        return this.data.cupons;
    }
    
    // ============== FAVORITOS ==============
    addFavorito(numero, jogo) {
        let fav = this.data.favoritos.find(f => f.numero === numero);
        if (!fav) {
            fav = { numero, jogos: [] };
            this.data.favoritos.push(fav);
        }
        if (!fav.jogos.includes(jogo)) {
            fav.jogos.push(jogo);
            this.save('favoritos');
        }
    }
    
    removeFavorito(numero, jogo) {
        const fav = this.data.favoritos.find(f => f.numero === numero);
        if (fav) {
            fav.jogos = fav.jogos.filter(j => j !== jogo);
            this.save('favoritos');
        }
    }
    
    getFavoritos(numero) {
        const fav = this.data.favoritos.find(f => f.numero === numero);
        return fav ? fav.jogos : [];
    }
    
    // ============== INDICAÇÕES ==============
    getCodigoIndicacao(numero) {
        let ind = this.data.indicacoes.find(i => i.numero === numero);
        if (!ind) {
            ind = {
                numero,
                codigo: 'REF' + Math.random().toString(36).substring(2, 8).toUpperCase(),
                indicados: [],
                pontos: 0
            };
            this.data.indicacoes.push(ind);
            this.save('indicacoes');
        }
        return ind.codigo;
    }
    
    usarCodigoIndicacao(codigo, novoCliente) {
        const ind = this.data.indicacoes.find(i => i.codigo === codigo.toUpperCase());
        if (ind && ind.numero !== novoCliente) {
            ind.indicados.push(novoCliente);
            ind.pontos += 10;
            this.save('indicacoes');
            
            // Adicionar pontos ao indicador
            const cliente = this.getClient(ind.numero);
            if (cliente) {
                cliente.pontos = (cliente.pontos || 0) + 10;
                this.save('clientes');
            }
            
            this.log(`Indicação: ${novoCliente} usou código de ${ind.numero}`);
            return ind.numero;
        }
        return null;
    }
    
    // ============== TICKETS ==============
    addTicket(numero, mensagem) {
        const ticket = {
            id: Date.now().toString(36),
            numero,
            mensagem,
            status: 'aberto',
            resposta: null,
            dataAbertura: Date.now(),
            dataFechamento: null
        };
        this.data.tickets.push(ticket);
        this.save('tickets');
        this.log(`Ticket aberto: ${numero}`);
        return ticket.id;
    }
    
    responderTicket(id, resposta) {
        const ticket = this.data.tickets.find(t => t.id === id);
        if (ticket) {
            ticket.resposta = resposta;
            ticket.status = 'respondido';
            ticket.dataFechamento = Date.now();
            this.save('tickets');
            this.log(`Ticket respondido: ${id}`);
            return ticket.numero;
        }
        return null;
    }
    
    getTicketsAbertos() {
        return this.data.tickets.filter(t => t.status === 'aberto');
    }
    
    // ============== RANKING ==============
    getRanking() {
        return this.data.clientes
            .filter(c => c.resgates > 0)
            .sort((a, b) => b.resgates - a.resgates);
    }
    
    addResgate(numero) {
        const cliente = this.getClient(numero);
        if (cliente) {
            cliente.resgates = (cliente.resgates || 0) + 1;
            cliente.pontos = (cliente.pontos || 0) + 5;
            this.save('clientes');
        }
    }
    
    getTotalResgates() {
        return this.data.clientes.reduce((total, c) => total + (c.resgates || 0), 0);
    }
    
    // ============== LOGS ==============
    log(mensagem) {
        const log = {
            data: Date.now(),
            mensagem
        };
        this.data.logs.push(log);
        
        // Manter apenas últimos 1000 logs
        if (this.data.logs.length > 1000) {
            this.data.logs = this.data.logs.slice(-1000);
        }
        
        this.save('logs');
        console.log(`[${new Date().toLocaleString()}] ${mensagem}`);
    }
    
    getLogs(limit = 50) {
        return this.data.logs.slice(-limit).reverse();
    }
    
    // ============== BACKUP ==============
    backup() {
        const backupDir = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
        
        fs.writeFileSync(backupFile, JSON.stringify(this.data, null, 2));
        this.log(`Backup realizado: ${backupFile}`);
        
        // Manter apenas últimos 10 backups
        const backups = fs.readdirSync(backupDir).sort();
        if (backups.length > 10) {
            backups.slice(0, backups.length - 10).forEach(b => {
                fs.unlinkSync(path.join(backupDir, b));
            });
        }
        
        return backupFile;
    }
}

module.exports = Database;
