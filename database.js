const fs = require('fs');
const path = require('path');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'database.json');
        this.data = this.carregarDados();
        
        // Garante estrutura inicial
        if (!this.data.contas) this.data.contas = [];
        if (!this.data.keys) this.data.keys = [];
        if (!this.data.clientes) this.data.clientes = {};
        if (!this.data.admins) this.data.admins = [];
        if (!this.data.masterKeyUsada) this.data.masterKeyUsada = false;
        
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
        }
        return {};
    }

    salvarDados() {
        try {
            fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error('Erro ao salvar DB:', e);
        }
    }

    // ==========================================
    // CONTAS STEAM
    // ==========================================
    
    addConta(jogo, categoria, login, senha) {
        const conta = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            jogo: jogo,
            categoria: categoria,
            login: login,
            senha: senha,
            dataAdicao: new Date().toISOString(),
            resgatadaPor: null,
            dataResgate: null
        };
        
        this.data.contas.push(conta);
        this.salvarDados();
        return conta;
    }

    getTodosJogosDisponiveis() {
        return this.data.contas.filter(c => !c.resgatadaPor);
    }

    getJogosDisponiveisPorCategoria() {
        const disponiveis = this.getTodosJogosDisponiveis();
        const porCategoria = {};
        
        disponiveis.forEach(conta => {
            if (!porCategoria[conta.categoria]) {
                porCategoria[conta.categoria] = [];
            }
            porCategoria[conta.categoria].push(conta);
        });
        
        return porCategoria;
    }

    buscarConta(termo) {
        const termoLower = termo.toLowerCase();
        return this.data.contas.find(c => 
            !c.resgatadaPor && (
                c.jogo.toLowerCase().includes(termoLower) ||
                c.categoria.toLowerCase().includes(termoLower)
            )
        );
    }

    removerConta(jogo, login) {
        const index = this.data.contas.findIndex(c => 
            c.jogo === jogo && c.login === login
        );
        
        if (index >= 0) {
            this.data.contas.splice(index, 1);
            this.salvarDados();
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
        return keyData;
    }

    criarKeyTeste(key, duracao, horas, numero, nome) {
        // Calcula expiração em horas
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
        
        // Registra cliente
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
        
        // Calcula expiração
        const agora = new Date();
        const expira = new Date(agora.getTime() + (keyData.dias * 24 * 60 * 60 * 1000));
        
        keyData.usada = true;
        keyData.usadaPor = numero;
        keyData.dataUso = agora.toISOString();
        keyData.dataExpiracao = expira.toISOString();
        
        // Registra cliente
        if (!this.data.clientes[numero]) {
            this.data.clientes[numero] = this.criarPerfilPadrao(numero, nome);
        }
        
        const cliente = this.data.clientes[numero];
        cliente.nome = nome;
        cliente.temAcesso = true;
        cliente.acessoPermanente = keyData.dias > 1000; // Lifetime
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
        
        return { sucesso: true };
    }

    verificarAcesso(numero) {
        const cliente = this.data.clientes[numero];
        if (!cliente) return false;
        
        // Se é admin permanente, sempre tem acesso
        if (cliente.acessoPermanente) return true;
        
        // Se tem keyInfo com data de expiração, verifica
        if (cliente.keyInfo && cliente.keyInfo.dataExpiracao) {
            const agora = new Date();
            const expira = new Date(cliente.keyInfo.dataExpiracao);
            
            if (agora > expira) {
                // Expirou
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
    // PERFIL DO CLIENTE - CORRIGIDO E COMPLETO
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
            keyInfo: null,
            keysResgatadas: [],
            jogosResgatados: [], // NOVO: Array de jogos que o usuário pegou
            totalJogosResgatados: 0
        };
    }

    getPerfil(numero) {
        // Limpa o número (remove @s.whatsapp.net, etc)
        const numLimpo = numero.replace('@s.whatsapp.net', '').replace('@g.us', '').split(':')[0];
        
        let cliente = this.data.clientes[numero] || this.data.clientes[numLimpo];
        
        if (!cliente) {
            // Cria perfil temporário para novos usuários
            return this.criarPerfilPadrao(numero, 'Visitante');
        }
        
        // Garante que tem todos os campos (para compatibilidade com dados antigos)
        if (!cliente.jogosResgatados) cliente.jogosResgatados = [];
        if (!cliente.keysResgatadas) cliente.keysResgatadas = [];
        if (!cliente.dataRegistro) cliente.dataRegistro = new Date().toISOString();
        
        // Atualiza status de acesso (verifica se expirou)
        if (cliente.keyInfo && cliente.keyInfo.dataExpiracao && !cliente.acessoPermanente) {
            const agora = new Date();
            const expira = new Date(cliente.keyInfo.dataExpiracao);
            cliente.temAcesso = agora <= expira;
        }
        
        return cliente;
    }

    // NOVO: Registra quando usuário resgata um jogo
    registrarJogoResgatado(numero, conta) {
        const numLimpo = numero.replace('@s.whatsapp.net', '').replace('@g.us', '').split(':')[0];
        const cliente = this.data.clientes[numero] || this.data.clientes[numLimpo];
        
        if (!cliente) return;
        
        // Adiciona à lista de jogos resgatados
        if (!cliente.jogosResgatados) {
            cliente.jogosResgatados = [];
        }
        
        // Evita duplicados
        const jaResgatou = cliente.jogosResgatados.find(j => j.id === conta.id);
        if (!jaResgatou) {
            cliente.jogosResgatados.push({
                id: conta.id,
                jogo: conta.jogo,
                categoria: conta.categoria,
                dataResgate: new Date().toISOString()
            });
            cliente.totalJogosResgatados = cliente.jogosResgatados.length;
            
            // Marca conta como resgatada
            const contaDB = this.data.contas.find(c => c.id === conta.id);
            if (contaDB) {
                contaDB.resgatadaPor = numero;
                contaDB.dataResgate = new Date().toISOString();
            }
            
            this.salvarDados();
        }
    }

    // ==========================================
    // ESTATÍSTICAS
    // ==========================================
    
    getEstatisticas() {
        const totalJogos = this.data.contas.length;
        const disponiveis = this.data.contas.filter(c => !c.resgatadaPor).length;
        const keysAtivas = this.data.keys.filter(k => k.usada).length;
        const totalClientes = Object.keys(this.data.clientes).length;
        
        return {
            totalJogos,
            disponiveis,
            keysAtivas,
            totalClientes,
            masterKeyUsada: this.data.masterKeyUsada
        };
    }

    getTodosClientes() {
        return Object.values(this.data.clientes).map(c => ({
            numero: c.numero,
            nome: c.nome
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

            // Tenta extrair: Jogo | Categoria | Login | Senha
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
