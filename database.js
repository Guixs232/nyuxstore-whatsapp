const fs = require('fs');
const path = require('path');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'database.json');
        this.data = this.carregar();
        console.log('💾 Banco de dados carregado');
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
            keys: [], // Keys geradas pelo admin
            keysResgatadas: [], // Keys que já foram usadas
            clientes: {},
            testesUsados: []
        };
    }

    salvar() {
        try {
            fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
        } catch (err) {
            console.error('Erro ao salvar DB:', err);
        }
    }

    // ========== SISTEMA DE KEYS CORRIGIDO ==========

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

    // Resgatar key (apenas se existir, estiver ativa e não usada)
    resgatarKey(key, numeroUsuario, nomeUsuario) {
        const keyUpper = key.toUpperCase().trim();
        
        console.log('🔍 Buscando key:', keyUpper);
        console.log('🔍 Total de keys no sistema:', this.data.keys.length);
        
        // Procura a key no banco
        const keyEncontrada = this.data.keys.find(k => k.key === keyUpper);
        
        if (!keyEncontrada) {
            console.log('❌ Key não encontrada:', keyUpper);
            return { 
                sucesso: false, 
                erro: 'Key não encontrada. Verifique se digitou corretamente ou compre uma key válida.' 
            };
        }

        console.log('✅ Key encontrada:', keyEncontrada);

        // Verifica se já foi usada
        if (keyEncontrada.usada) {
            return { 
                sucesso: false, 
                erro: `Esta key já foi resgatada por outro usuário em ${new Date(keyEncontrada.dataUso).toLocaleString()}.` 
            };
        }

        // Verifica se está ativa
        if (!keyEncontrada.ativa) {
            return { 
                sucesso: false, 
                erro: 'Esta key foi desativada pelo administrador.' 
            };
        }

        // Verifica se usuário já tem uma key ativa
        const clienteExistente = this.data.clientes[numeroUsuario];
        if (clienteExistente && clienteExistente.temAcesso) {
            return { 
                sucesso: false, 
                erro: 'Você já possui uma key ativa. Aguarde expirar para resgatar outra.' 
            };
        }

        // Marca key como usada
        keyEncontrada.usada = true;
        keyEncontrada.usadaPor = numeroUsuario;
        keyEncontrada.dataUso = new Date().toISOString();

        // Calcula expiração
        const dataExpiracao = this.calcularExpiracao(keyEncontrada.dias);

        // Registra cliente
        if (!this.data.clientes[numeroUsuario]) {
            this.data.clientes[numeroUsuario] = {
                numero: numeroUsuario,
                nome: nomeUsuario,
                dataCadastro: new Date().toISOString(),
                totalResgatados: 0
            };
        }

        this.data.clientes[numeroUsuario] = {
            ...this.data.clientes[numeroUsuario],
            temAcesso: true,
            keyInfo: {
                key: keyUpper,
                plano: keyEncontrada.isTeste ? 'Teste' : 'Premium',
                duracao: keyEncontrada.duracao,
                expira: dataExpiracao,
                dataAtivacao: new Date().toISOString()
            },
            usouTeste: keyEncontrada.isTeste || this.data.clientes[numeroUsuario].usouTeste
        };

        this.salvar();

        return {
            sucesso: true,
            plano: keyEncontrada.isTeste ? 'Teste Grátis' : 'Premium',
            duracao: keyEncontrada.duracao,
            expira: dataExpiracao
        };
    }

    // Criar key de teste (válida por horas)
    criarKeyTeste(key, duracao, horas, numeroUsuario, nomeUsuario) {
        // Converte horas para fração de dia para o cálculo
        const dias = horas / 24;
        return this.criarKey(key, duracao, dias, true);
    }

    calcularExpiracao(dias) {
        const data = new Date();
        data.setDate(data.getDate() + dias);
        return data.toLocaleString('pt-BR');
    }

    verificarAcesso(numero) {
        const cliente = this.data.clientes[numero];
        if (!cliente || !cliente.temAcesso) return false;
        
        // Verifica se expirou
        if (cliente.keyInfo && cliente.keyInfo.expira) {
            const agora = new Date();
            const expira = new Date(cliente.keyInfo.expira);
            if (agora > expira) {
                cliente.temAcesso = false;
                this.salvar();
                return false;
            }
        }
        
        return true;
    }

    verificarTesteUsado(numero) {
        return this.data.testesUsados.includes(numero);
    }

    getPerfil(numero) {
        return this.data.clientes[numero] || {
            temAcesso: false,
            usouTeste: false,
            totalResgatados: 0
        };
    }

    // ========== CONTAS DE JOGOS ==========

    addConta(jogo, categoria, login, senha) {
        this.data.contas.push({
            jogo,
            categoria,
            login,
            senha,
            dataAdicao: new Date().toISOString()
        });
        this.salvar();
    }

    buscarConta(nomeJogo) {
        const termo = nomeJogo.toLowerCase();
        return this.data.contas.find(c => c.jogo.toLowerCase().includes(termo));
    }

    getJogosDisponiveisPorCategoria() {
        const categorias = {};
        this.data.contas.forEach(conta => {
            if (!categorias[conta.categoria]) {
                categorias[conta.categoria] = [];
            }
            // Evita duplicatas
            if (!categorias[conta.categoria].find(j => j.jogo === conta.jogo)) {
                categorias[conta.categoria].push(conta);
            }
        });
        return categorias;
    }

    getTodosJogosDisponiveis() {
        return this.data.contas;
    }

    // ========== ESTATÍSTICAS ==========

    getEstatisticas() {
        const keysAtivas = this.data.keys.filter(k => k.ativa && !k.usada).length;
        const keysUsadas = this.data.keys.filter(k => k.usada).length;
        const keysTeste = this.data.keys.filter(k => k.isTeste).length;
        
        return {
            totalJogos: this.data.contas.length,
            disponiveis: this.data.contas.length,
            usados: 0,
            keysAtivas,
            keysUsadas,
            keysTeste,
            totalClientes: Object.keys(this.data.clientes).length,
            totalCategorias: Object.keys(this.getJogosDisponiveisPorCategoria()).length
        };
    }

    getTodosClientes() {
        return Object.values(this.data.clientes);
    }

    // ========== IMPORTAR ==========

    importarTXT(texto) {
        const linhas = texto.split('\n');
        let adicionadas = 0;
        let erros = 0;
        const jogosUnicos = new Set();
        const categorias = new Set();

        for (const linha of linhas) {
            try {
                // Formato esperado: Jogo | Categoria | Login | Senha
                const partes = linha.split('|').map(p => p.trim());
                if (partes.length >= 4) {
                    const [jogo, categoria, login, senha] = partes;
                    this.addConta(jogo, categoria, login, senha);
                    jogosUnicos.add(jogo);
                    categorias.add(categoria);
                    adicionadas++;
                }
            } catch (err) {
                erros++;
            }
        }

        return {
            adicionadas,
            jogosUnicos: jogosUnicos.size,
            categorias: categorias.size,
            erros
        };
    }
}

module.exports = Database;
