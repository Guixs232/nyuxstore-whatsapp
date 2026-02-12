const fs = require('fs');
const path = require('path');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'database.json');
        this.data = this.carregar();
        console.log('💾 Banco de dados carregado');
        
        // Inicializa master key se não existir
        this.inicializarMasterKey();
    }

    carregar() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (err) {
            console.error('Erro ao carregar DB:', err);
        }
        return {
            contas: [],
            keys: [],           // Keys geradas pelo admin
            keysResgatadas: [], // Keys que já foram usadas
            clientes: {},
            testesUsados: [],
            masterKey: {        // Sistema de master key
                key: 'NYUX-ADM1-GUIXS23',
                usada: false,
                usadaPor: null,
                dataUso: null
            },
            admins: []          // Lista de admins (além do número configurado)
        };
    }

    salvar() {
        try {
            fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
        } catch (err) {
            console.error('Erro ao salvar DB:', err);
        }
    }

    // ========== SISTEMA DE MASTER KEY (ADMIN ÚNICO) ==========

    inicializarMasterKey() {
        if (!this.data.masterKey) {
            this.data.masterKey = {
                key: 'NYUX-ADM1-GUIXS23',
                usada: false,
                usadaPor: null,
                dataUso: null
            };
            this.salvar();
        }
    }

    // Resgatar a master key (Uso único!)
    resgatarMasterKey(key, numeroUsuario, nomeUsuario) {
        const keyUpper = key.toUpperCase().trim();
        
        console.log('🔐 Verificando master key:', keyUpper);
        console.log('🔐 Status atual:', this.data.masterKey);

        // Verifica se é a key correta
        if (keyUpper !== this.data.masterKey.key) {
            return { sucesso: false, erro: 'Key inválida' };
        }

        // Verifica se já foi usada
        if (this.data.masterKey.usada) {
            return { sucesso: false, erro: 'Esta key já foi usada e está BLOQUEADA permanentemente!' };
        }

        // Marca como usada
        const numeroLimpo = numeroUsuario.replace('@s.whatsapp.net', '').split(':')[0];
        
        this.data.masterKey.usada = true;
        this.data.masterKey.usadaPor = {
            numero: numeroLimpo,
            nome: nomeUsuario,
            jid: numeroUsuario
        };
        this.data.masterKey.dataUso = new Date().toISOString();

        // Adiciona à lista de admins permanentes
        if (!this.data.admins) this.data.admins = [];
        this.data.admins.push({
            numero: numeroLimpo,
            nome: nomeUsuario,
            tipo: 'master',
            dataAdicao: new Date().toISOString()
        });

        // Dá acesso permanente ao usuário
        if (!this.data.clientes[numeroUsuario]) {
            this.data.clientes[numeroUsuario] = {
                numero: numeroLimpo,
                nome: nomeUsuario,
                temAcesso: true,
                acessoPermanente: true,
                dataRegistro: new Date().toISOString(),
                usouTeste: false,
                totalResgatados: 0,
                keysResgatadas: []
            };
        } else {
            this.data.clientes[numeroUsuario].temAcesso = true;
            this.data.clientes[numeroUsuario].acessoPermanente = true;
        }

        this.salvar();

        console.log('✅ Master key resgatada com sucesso por:', numeroLimpo);
        console.log('🔐 Sistema bloqueado. Ninguém mais pode usar esta key.');

        return { 
            sucesso: true, 
            mensagem: 'Master key ativada! Você é admin permanente.',
            admin: true
        };
    }

    // Verifica se um número é admin master
    isAdminMaster(numero) {
        if (!this.data.admins) return false;
        const numeroLimpo = numero.replace('@s.whatsapp.net', '').split(':')[0];
        return this.data.admins.some(admin => admin.numero === numeroLimpo);
    }

    // ========== SISTEMA DE KEYS NORMAIS ==========

    // Criar key (apenas admin)
    criarKey(key, duracao, dias, isTeste = false) {
        // Verifica se key já existe
        const keyExistente = this.data.keys.find(k => k.key === key);
        if (keyExistente) {
            return { sucesso: false, erro: 'Key já existe no sistema' };
        }

        const novaKey = {
            key: key,
            duracao: duracao,
            dias: dias,
            isTeste: isTeste,
            ativa: true,
            usada: false,
            usadaPor: null,
            dataCriacao: new Date().toISOString(),
            dataUso: null
        };

        this.data.keys.push(novaKey);
        this.salvar();
        
        return { 
            sucesso: true, 
            key: key,
            expira: this.calcularExpiracao(dias)
        };
    }

    // Resgatar key normal (apenas se existir, estiver ativa e não usada)
    resgatarKey(key, numeroUsuario, nomeUsuario) {
        const keyUpper = key.toUpperCase().trim();
        
        console.log('🔍 Buscando key:', keyUpper);
        console.log('🔍 Total de keys no sistema:', this.data.keys.length);
        
        // Procura a key no banco
        const keyEncontrada = this.data.keys.find(k => k.key === keyUpper);
        
        if (!keyEncontrada) {
            console.log('❌ Key não encontrada:', keyUpper);
            return { sucesso: false, erro: 'Key não encontrada no sistema. Verifique se digitou corretamente ou contate o admin.' };
        }

        // Verifica se está ativa
        if (!keyEncontrada.ativa) {
            console.log('❌ Key inativa:', keyUpper);
            return { sucesso: false, erro: 'Key está inativa/bloqueada.' };
        }

        // Verifica se já foi usada
        if (keyEncontrada.usada) {
            console.log('❌ Key já usada:', keyUpper);
            return { sucesso: false, erro: `Key já foi usada por outro usuário em ${new Date(keyEncontrada.dataUso).toLocaleString()}. Cada key só pode ser usada uma vez!` };
        }

        // Verifica se usuário já tem acesso ativo
        const numeroLimpo = numeroUsuario.replace('@s.whatsapp.net', '').split(':')[0];
        const clienteExistente = this.data.clientes[numeroUsuario];
        
        if (clienteExistente && clienteExistente.temAcesso && !clienteExistente.acessoPermanente) {
            // Se tem acesso não-permanente, verifica se expirou
            if (clienteExistente.keyInfo && new Date(clienteExistente.keyInfo.expira) > new Date()) {
                return { sucesso: false, erro: 'Você já tem uma key ativa! Espere expirar antes de resgatar outra.' };
            }
        }

        // Marca key como usada
        keyEncontrada.usada = true;
        keyEncontrada.usadaPor = {
            numero: numeroLimpo,
            nome: nomeUsuario,
            jid: numeroUsuario
        };
        keyEncontrada.dataUso = new Date().toISOString();

        // Adiciona às keys resgatadas
        this.data.keysResgatadas.push({
            ...keyEncontrada,
            dataResgate: new Date().toISOString()
        });

        // Calcula expiração
        const expira = this.calcularExpiracao(keyEncontrada.dias);

        // Registra cliente
        if (!this.data.clientes[numeroUsuario]) {
            this.data.clientes[numeroUsuario] = {
                numero: numeroLimpo,
                nome: nomeUsuario,
                temAcesso: true,
                acessoPermanente: keyEncontrada.dias === 99999, // Lifetime é permanente
                dataRegistro: new Date().toISOString(),
                usouTeste: false,
                totalResgatados: 0,
                keysResgatadas: []
            };
        }

        this.data.clientes[numeroUsuario].temAcesso = true;
        this.data.clientes[numeroUsuario].totalResgatados++;
        this.data.clientes[numeroUsuario].keysResgatadas.push({
            key: keyUpper,
            plano: keyEncontrada.duracao,
            expira: expira,
            dataResgate: new Date().toISOString()
        });
        this.data.clientes[numeroUsuario].keyInfo = {
            key: keyUpper,
            plano: keyEncontrada.duracao,
            expira: expira
        };

        this.salvar();

        console.log('✅ Key resgatada com sucesso:', keyUpper);
        console.log('👤 Por:', numeroLimpo);

        return { 
            sucesso: true, 
            plano: keyEncontrada.duracao,
            duracao: keyEncontrada.duracao,
            expira: expira
        };
    }

    calcularExpiracao(dias) {
        const data = new Date();
        if (dias === 99999) {
            return 'Nunca (Lifetime)';
        }
        data.setDate(data.getDate() + dias);
        return data.toLocaleDateString('pt-BR');
    }

    // ========== OUTROS MÉTODOS ==========

    verificarAcesso(numero) {
        const cliente = this.data.clientes[numero];
        if (!cliente) return false;
        if (cliente.acessoPermanente) return true;
        if (!cliente.temAcesso) return false;
        
        // Verifica se expirou
        if (cliente.keyInfo && cliente.keyInfo.expira !== 'Nunca (Lifetime)') {
            const expira = new Date(cliente.keyInfo.expira.split('/').reverse().join('-'));
            if (expira < new Date()) {
                cliente.temAcesso = false;
                this.salvar();
                return false;
            }
        }
        return true;
    }

    getPerfil(numero) {
        const cliente = this.data.clientes[numero] || {
            numero: numero.replace('@s.whatsapp.net', '').split(':')[0],
            temAcesso: false,
            usouTeste: false,
            totalResgatados: 0
        };
        return cliente;
    }

    verificarTesteUsado(numero) {
        return this.data.testesUsados.includes(numero);
    }

    criarKeyTeste(key, duracao, horas, numeroUsuario, nomeUsuario) {
        // Cria key de teste
        const resultado = this.criarKey(key, duracao, horas, true);
        
        if (resultado.sucesso) {
            // Marca como usada imediatamente (teste é automático)
            const keyObj = this.data.keys.find(k => k.key === key);
            keyObj.usada = true;
            keyObj.usadaPor = {
                numero: numeroUsuario.replace('@s.whatsapp.net', '').split(':')[0],
                nome: nomeUsuario,
                jid: numeroUsuario
            };
            keyObj.dataUso = new Date().toISOString();

            // Registra cliente de teste
            if (!this.data.clientes[numeroUsuario]) {
                this.data.clientes[numeroUsuario] = {
                    numero: numeroUsuario.replace('@s.whatsapp.net', '').split(':')[0],
                    nome: nomeUsuario,
                    temAcesso: true,
                    acessoPermanente: false,
                    dataRegistro: new Date().toISOString(),
                    usouTeste: true,
                    totalResgatados: 1,
                    keysResgatadas: [{
                        key: key,
                        plano: `Teste ${duracao}`,
                        expira: this.calcularExpiracao(horas / 24),
                        dataResgate: new Date().toISOString()
                    }]
                };
            } else {
                this.data.clientes[numeroUsuario].usouTeste = true;
                this.data.clientes[numeroUsuario].temAcesso = true;
            }

            this.data.testesUsados.push(numeroUsuario);
            this.salvar();
        }

        return resultado;
    }

    addConta(jogo, categoria, login, senha) {
        this.data.contas.push({
            jogo,
            categoria,
            login,
            senha,
            disponivel: true,
            dataAdicao: new Date().toISOString()
        });
        this.salvar();
    }

    buscarConta(nomeJogo) {
        return this.data.contas.find(c => 
            c.jogo.toLowerCase().includes(nomeJogo.toLowerCase()) && c.disponivel
        );
    }

    getJogosDisponiveisPorCategoria() {
        const categorias = {};
        this.data.contas.filter(c => c.disponivel).forEach(c => {
            if (!categorias[c.categoria]) categorias[c.categoria] = [];
            categorias[c.categoria].push(c);
        });
        return categorias;
    }

    getTodosJogosDisponiveis() {
        return this.data.contas.filter(c => c.disponivel);
    }

    getEstatisticas() {
        return {
            totalJogos: this.data.contas.length,
            disponiveis: this.data.contas.filter(c => c.disponivel).length,
            keysAtivas: this.data.keys.filter(k => k.ativa && !k.usada).length,
            keysUsadas: this.data.keysResgatadas.length,
            totalClientes: Object.keys(this.data.clientes).length,
            masterKeyUsada: this.data.masterKey.usada ? 'SIM (BLOQUEADA)' : 'NÃO (DISPONÍVEL)'
        };
    }

    getTodosClientes() {
        return Object.values(this.data.clientes);
    }

    importarTXT(texto) {
        const linhas = texto.split('\n');
        let adicionadas = 0;
        const jogos = new Set();
        const categorias = new Set();

        linhas.forEach(linha => {
            const [jogo, categoria, login, senha] = linha.split('|').map(s => s.trim());
            if (jogo && categoria && login && senha) {
                this.addConta(jogo, categoria, login, senha);
                adicionadas++;
                jogos.add(jogo);
                categorias.add(categoria);
            }
        });

        return {
            adicionadas,
            jogosUnicos: jogos.size,
            categorias: categorias.size
        };
    }
}

module.exports = Database;
