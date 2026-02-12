const fs = require('fs');
const path = require('path');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'database.json');
        this.data = this.carregar();
        
        // CÓDIGO DE ADMIN ÚNICO E FIXO - SÓ 1 USUÁRIO PODE USAR
        this.CODIGO_ADMIN_UNICO = 'NYUX-ADM1-GUIXS23';
        
        console.log('💾 Banco de dados carregado');
        console.log('🔐 Código de admin único configurado:', this.CODIGO_ADMIN_UNICO);
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
            keys: [],
            keysResgatadas: [],
            clientes: {},
            testesUsados: [],
            adminUnico: {
                code: 'NYUX-ADM1-GUIXS23',
                usado: false,
                usadoPor: null,
                dataUso: null,
                ativo: true // Se false, código está bloqueado permanentemente
            },
            adminAtivo: null // Número do admin que foi ativado
        };
    }

    salvar() {
        try {
            fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
        } catch (err) {
            console.error('Erro ao salvar DB:', err);
        }
    }

    // ========== SISTEMA DE ADMIN ÚNICO (CÓDIGO FIXO) ==========

    // Verificar se código de admin único está disponível
    verificarAdminCodeDisponivel() {
        return {
            disponivel: !this.data.adminUnico.usado && this.data.adminUnico.ativo,
            usado: this.data.adminUnico.usado,
            usadoPor: this.data.adminUnico.usadoPor,
            bloqueado: !this.data.adminUnico.ativo
        };
    }

    // Ativar admin com código único (SÓ FUNCIONA 1 VEZ!)
    ativarAdminUnico(code, numeroUsuario) {
        const codeUpper = code.toUpperCase().trim();
        
        // Verifica se é o código correto
        if (codeUpper !== this.data.adminUnico.code) {
            return { 
                sucesso: false, 
                erro: 'Código inválido.' 
            };
        }

        // Verifica se já foi usado
        if (this.data.adminUnico.usado) {
            return { 
                sucesso: false, 
                erro: `Este código já foi usado por ${this.data.adminUnico.usadoPor} em ${this.data.adminUnico.dataUso}. Código bloqueado permanentemente.` 
            };
        }

        // Verifica se está ativo
        if (!this.data.adminUnico.ativo) {
            return { 
                sucesso: false, 
                erro: 'Código bloqueado permanentemente.' 
            };
        }

        // ATIVA O ADMIN (SÓ 1 VEZ!)
        this.data.adminUnico.usado = true;
        this.data.adminUnico.usadoPor = numeroUsuario;
        this.data.adminUnico.dataUso = new Date().toISOString();
        this.data.adminUnico.ativo = false; // BLOQUEIA PERMANENTEMENTE!
        this.data.adminAtivo = numeroUsuario;

        this.salvar();

        console.log('🔐 ADMIN ATIVADO COM CÓDIGO ÚNICO!');
        console.log('🔐 Número:', numeroUsuario);
        console.log('🔐 Código agora está BLOQUEADO permanentemente!');

        return { 
            sucesso: true, 
            mensagem: '✅ Você agora é o ADMINISTRADOR ÚNICO!\n\n🔒 Este código foi bloqueado permanentemente.\n\n⚠️ Apenas você tem acesso ao painel admin.',
            numeroAdmin: numeroUsuario
        };
    }

    // Verificar se é admin (apenas quem ativou o código único)
    verificarAdmin(numero) {
        // Remove sufixos do WhatsApp
        const numeroLimpo = numero
            .replace('@s.whatsapp.net', '')
            .replace('@g.us', '')
            .split(':')[0];
        
        return this.data.adminAtivo === numeroLimpo;
    }

    // Verificar se já existe admin ativo
    existeAdminAtivo() {
        return this.data.adminUnico.usado && this.data.adminAtivo !== null;
    }

    // ========== SISTEMA DE KEYS ==========

    criarKey(key, duracao, dias, isTeste = false) {
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

    resgatarKey(key, numeroUsuario, nomeUsuario) {
        const keyUpper = key.toUpperCase().trim();
        
        console.log('🔍 Buscando key:', keyUpper);
        
        const keyEncontrada = this.data.keys.find(k => k.key === keyUpper);
        
        if (!keyEncontrada) {
            return { 
                sucesso: false, 
                erro: 'Key não encontrada. Verifique se digitou corretamente.' 
            };
        }

        if (keyEncontrada.usada) {
            return { 
                sucesso: false, 
                erro: 'Esta key já foi resgatada por outro usuário.' 
            };
        }

        if (!keyEncontrada.ativa) {
            return { 
                sucesso: false, 
                erro: 'Esta key foi desativada.' 
            };
        }

        const clienteExistente = this.data.clientes[numeroUsuario];
        if (clienteExistente && clienteExistente.temAcesso) {
            return { 
                sucesso: false, 
                erro: 'Você já possui uma key ativa.' 
            };
        }

        keyEncontrada.usada = true;
        keyEncontrada.usadaPor = numeroUsuario;
        keyEncontrada.dataUso = new Date().toISOString();

        const dataExpiracao = this.calcularExpiracao(keyEncontrada.dias);

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

    criarKeyTeste(key, duracao, horas, numeroUsuario, nomeUsuario) {
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
            totalCategorias: Object.keys(this.getJogosDisponiveisPorCategoria()).length,
            adminAtivo: this.data.adminAtivo || 'Nenhum',
            adminCodeUsado: this.data.adminUnico.usado
        };
    }

    getTodosClientes() {
        return Object.values(this.data.clientes);
    }

    importarTXT(texto) {
        const linhas = texto.split('\n');
        let adicionadas = 0;
        let erros = 0;
        const jogosUnicos = new Set();
        const categorias = new Set();

        for (const linha of linhas) {
            try {
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
