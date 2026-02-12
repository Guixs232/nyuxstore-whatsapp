const sqlite3 = require('sqlite3').verbose();
const moment = require('moment');

class NyuxDatabase {
    constructor() {
        this.db = new sqlite3.Database('nyux_whatsapp.db');
        this.init();
    }

    init() {
        // Tabela de contas
        this.db.run(`
            CREATE TABLE IF NOT EXISTS contas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                jogo TEXT NOT NULL,
                categoria TEXT NOT NULL,
                login TEXT NOT NULL,
                senha TEXT NOT NULL,
                status TEXT DEFAULT 'disponivel',
                data_add TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                usado_por TEXT,
                data_usado TIMESTAMP
            )
        `);

        // Tabela de keys
        this.db.run(`
            CREATE TABLE IF NOT EXISTS keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_code TEXT UNIQUE NOT NULL,
                duracao TEXT NOT NULL,
                dias INTEGER NOT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                usado_por TEXT,
                usado_em TIMESTAMP,
                expira_em TIMESTAMP,
                ativa INTEGER DEFAULT 1
            )
        `);

        // Tabela de clientes
        this.db.run(`
            CREATE TABLE IF NOT EXISTS clientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero TEXT UNIQUE NOT NULL,
                nome TEXT,
                tem_acesso INTEGER DEFAULT 0,
                key_ativa TEXT,
                expira_em TIMESTAMP,
                total_resgates INTEGER DEFAULT 0,
                data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de resgates
        this.db.run(`
            CREATE TABLE IF NOT EXISTS resgates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_numero TEXT,
                conta_id INTEGER,
                data_resgate TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Banco de dados inicializado');
    }

    // Contas
    addConta(jogo, categoria, login, senha) {
        const stmt = this.db.prepare('INSERT INTO contas (jogo, categoria, login, senha) VALUES (?, ?, ?, ?)');
        stmt.run(jogo, categoria, login, senha);
        stmt.finalize();
    }

    buscarConta(nomeJogo) {
        const stmt = this.db.prepare('SELECT * FROM contas WHERE LOWER(jogo) LIKE ? AND status = ? LIMIT 1');
        return stmt.get(`%${nomeJogo.toLowerCase()}%`, 'disponivel');
    }

    getContaPorId(id) {
        const stmt = this.db.prepare('SELECT * FROM contas WHERE id = ?');
        return stmt.get(id);
    }

    marcarContaUsada(id, numeroCliente) {
        const stmt = this.db.prepare('UPDATE contas SET status = ?, usado_por = ?, data_usado = ? WHERE id = ?');
        stmt.run('usado', numeroCliente, moment().format('YYYY-MM-DD HH:mm:ss'), id);
        stmt.finalize();

        // Incrementa resgates do cliente
        const upd = this.db.prepare('UPDATE clientes SET total_resgates = total_resgates + 1 WHERE numero = ?');
        upd.run(numeroCliente);
        upd.finalize();

        // Registra resgate
        const ins = this.db.prepare('INSERT INTO resgates (cliente_numero, conta_id) VALUES (?, ?)');
        ins.run(numeroCliente, id);
        ins.finalize();
    }

    // Lista de jogos disponíveis (SEM senha) - agrupado por categoria
    getJogosDisponiveisPorCategoria() {
        const stmt = this.db.prepare('SELECT categoria, jogo, id FROM contas WHERE status = ? ORDER BY categoria, jogo');
        const rows = stmt.all('disponivel');
        
        const categorias = {};
        rows.forEach(row => {
            if (!categorias[row.categoria]) {
                categorias[row.categoria] = [];
            }
            categorias[row.categoria].push({
                id: row.id,
                jogo: row.jogo
            });
        });
        
        return categorias;
    }

    // Lista simples de jogos para busca
    getTodosJogosDisponiveis() {
        const stmt = this.db.prepare('SELECT id, jogo, categoria FROM contas WHERE status = ? ORDER BY categoria, jogo');
        return stmt.all('disponivel');
    }

    getTotalJogos() {
        return this.db.prepare('SELECT COUNT(*) as total FROM contas').get().total;
    }

    getTotalDisponiveis() {
        return this.db.prepare('SELECT COUNT(*) as total FROM contas WHERE status = ?').get('disponivel').total;
    }

    getCategoriasResumo() {
        const stmt = this.db.prepare('SELECT categoria, COUNT(*) as total FROM contas WHERE status = ? GROUP BY categoria');
        const rows = stmt.all('disponivel');
        const resultado = {};
        rows.forEach(row => resultado[row.categoria] = row.total);
        return resultado;
    }

    // Keys
    criarKey(key, duracao, dias) {
        const expira = moment().add(dias, 'days').format('YYYY-MM-DD HH:mm:ss');
        const stmt = this.db.prepare('INSERT INTO keys (key_code, duracao, dias, expira_em) VALUES (?, ?, ?, ?)');
        stmt.run(key, duracao, dias, expira);
        stmt.finalize();
    }

    resgatarKey(key, numeroCliente, nomeCliente) {
        const check = this.db.prepare('SELECT * FROM keys WHERE key_code = ? AND ativa = 1 AND usado_por IS NULL');
        const keyData = check.get(key);

        if (!keyData) {
            return { sucesso: false, erro: 'Key não encontrada ou já utilizada.' };
        }

        const updKey = this.db.prepare('UPDATE keys SET usado_por = ?, usado_em = ? WHERE id = ?');
        updKey.run(numeroCliente, moment().format('YYYY-MM-DD HH:mm:ss'), keyData.id);
        updKey.finalize();

        const checkCliente = this.db.prepare('SELECT * FROM clientes WHERE numero = ?');
        const cliente = checkCliente.get(numeroCliente);

        if (cliente) {
            const upd = this.db.prepare('UPDATE clientes SET tem_acesso = 1, key_ativa = ?, expira_em = ?, nome = ? WHERE numero = ?');
            upd.run(key, keyData.expira_em, nomeCliente, numeroCliente);
            upd.finalize();
        } else {
            const ins = this.db.prepare('INSERT INTO clientes (numero, nome, tem_acesso, key_ativa, expira_em) VALUES (?, ?, 1, ?, ?)');
            ins.run(numeroCliente, nomeCliente, key, keyData.expira_em);
            ins.finalize();
        }

        return {
            sucesso: true,
            plano: keyData.duracao,
            duracao: keyData.duracao,
            expira: moment(keyData.expira_em).format('DD/MM/YYYY')
        };
    }

    verificarAcesso(numero) {
        const stmt = this.db.prepare('SELECT * FROM clientes WHERE numero = ? AND tem_acesso = 1 AND (expira_em > ? OR expira_em IS NULL)');
        const cliente = stmt.get(numero, moment().format('YYYY-MM-DD HH:mm:ss'));
        
        if (!cliente) {
            const checkKey = this.db.prepare('SELECT * FROM keys WHERE usado_por = ? AND ativa = 1 AND (expira_em > ? OR duracao = ?)');
            const key = checkKey.get(numero, moment().format('YYYY-MM-DD HH:mm:ss'), 'Lifetime');
            return !!key;
        }
        
        return true;
    }

    getPerfil(numero) {
        const stmt = this.db.prepare('SELECT * FROM clientes WHERE numero = ?');
        const cliente = stmt.get(numero) || { tem_acesso: 0, total_resgates: 0 };
        
        const keyStmt = this.db.prepare('SELECT * FROM keys WHERE usado_por = ? AND ativa = 1 ORDER BY usado_em DESC LIMIT 1');
        const keyInfo = keyStmt.get(numero);
        
        return {
            temAcesso: cliente.tem_acesso === 1,
            totalResgatados: cliente.total_resgates || 0,
            keyInfo: keyInfo ? {
                key: keyInfo.key_code,
                expira: moment(keyInfo.expira_em).format('DD/MM/YYYY')
            } : null
        };
    }

    // Importação do arquivo
    importarTXT(texto) {
        const linhas = texto.split('\n');
        let jogoAtual = 'Desconhecido';
        let categoriaAtual = 'Geral';
        let adicionadas = 0;
        let erros = 0;
        const jogosVistos = new Set();
        const categorias = {};

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];

            // Detecta jogo
            if (linha.includes('🎮') || linha.includes('Jogo:') || linha.includes('Games:') || linha.includes('Game:')) {
                const match = linha.match(/(?:🎮|Jogo:|Games:|Game:)\s*(.+)/i);
                if (match) {
                    jogoAtual = match[1].trim();
                    categoriaAtual = this.detectarCategoria(jogoAtual);
                    jogosVistos.add(jogoAtual);
                }
                continue;
            }

            // Detecta login/senha - múltiplos formatos
            let login = null;
            let senha = null;

            // Formato: User: xxx / Segurança: xxx
            const matchUser = linha.match(/(?:User|Usuário|Usuario|Login):\s*(\S+)/i);
            const matchSenha = linha.match(/(?:Segurança|Senha|Pass|Password):\s*(\S+)/i);
            
            if (matchUser && matchSenha) {
                login = matchUser[1];
                senha = matchSenha[1];
            } else if (matchUser && i + 1 < linhas.length) {
                // Senha na próxima linha
                login = matchUser[1];
                const matchSenhaProx = linhas[i + 1].match(/(?:Segurança|Senha|Pass|Password):\s*(\S+)/i);
                if (matchSenhaProx) {
                    senha = matchSenhaProx[1];
                    i++;
                }
            }

            if (login && senha && login.length > 2 && senha.length > 2) {
                try {
                    this.addConta(jogoAtual, categoriaAtual, login, senha);
                    adicionadas++;
                    categorias[categoriaAtual] = (categorias[categoriaAtual] || 0) + 1;
                } catch (e) {
                    erros++;
                }
            }
        }

        const resumoCats = Object.entries(categorias)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, total]) => `• ${cat}: ${total}`)
            .join('\n');

        return {
            adicionadas,
            erros,
            jogosUnicos: jogosVistos.size,
            categorias: Object.keys(categorias).length,
            resumoCategorias: resumoCats || 'Nenhuma categoria'
        };
    }

    detectarCategoria(nomeJogo) {
        const jogo = nomeJogo.toLowerCase();
        
        if (/assassin|creed/.test(jogo)) return '🗡️ Assassin\'s Creed';
        if (/call of duty|cod|modern warfare|black ops|warfare/.test(jogo)) return '🔫 Call of Duty';
        if (/resident evil|re2|re3|re4|re5|re6|re7|re8|biohazard/.test(jogo)) return '🧟 Resident Evil';
        if (/fifa|fc 24|fc 25|pes|efootball|nba|nfl|ufc|wwe/.test(jogo)) return '⚽ Esportes';
        if (/forza|need for speed|nfs|grid|f1|dirt|rally|assetto|beamng|euro truck|american truck/.test(jogo)) return '🏎️ Corrida';
        if (/gta|grand theft|red dead|rdr2/.test(jogo)) return '🚗 Rockstar Games';
        if (/lego|marvel|avengers|spider|batman|superman/.test(jogo)) return '🦸 Super-Heróis';
        if (/elden|dark souls|sekiro|bloodborne|demon souls/.test(jogo)) return '⚔️ Soulslike';
        if (/witcher|cyberpunk|cd projekt/.test(jogo)) return '🐺 CD Projekt Red';
        if (/farming|simulator|tycoon|manager|city skylines/.test(jogo)) return '🚜 Simuladores';
        if (/horror|terror|fear|evil|dead|dying light|outlast/.test(jogo)) return '👻 Terror';
        if (/rpg|final fantasy|dragon age|mass effect|persona/.test(jogo)) return '🎲 RPG';
        if (/mortal kombat|tekken|street fighter|fighting|smash/.test(jogo)) return '🥊 Luta';
        if (/hitman|stealth|thief/.test(jogo)) return '🕵️ Stealth';
        if (/strategy|age of empires|civilization|total war|xcom/.test(jogo)) return '🧠 Estratégia';
        if (/ark|survival|rust|dayz|forest|sons of the forest|green hell/.test(jogo)) return '🌲 Survival';
        if (/mario|zelda|nintendo|switch|pokemon/.test(jogo)) return '🍄 Nintendo';
        if (/sonic|sega|atlus|persona/.test(jogo)) return '💙 Sega';
        if (/war|battlefield|squad|arma|insurgency|tactical/.test(jogo)) return '💣 Guerra';
        
        return '🎮 Ação/Aventura';
    }

    // Estatísticas
    getEstatisticas() {
        const totalJogos = this.db.prepare('SELECT COUNT(*) as c FROM contas').get().c;
        const disponiveis = this.db.prepare('SELECT COUNT(*) as c FROM contas WHERE status = ?').get('disponivel').c;
        const usados = this.db.prepare('SELECT COUNT(*) as c FROM contas WHERE status = ?').get('usado').c;
        const keysAtivas = this.db.prepare('SELECT COUNT(*) as c FROM keys WHERE ativa = 1').get().c;
        const totalClientes = this.db.prepare('SELECT COUNT(*) as c FROM clientes').get().c;
        const totalCategorias = this.db.prepare('SELECT COUNT(DISTINCT categoria) as c FROM contas').get().c;

        return {
            totalJogos,
            disponiveis,
            usados,
            keysAtivas,
            totalClientes,
            totalCategorias
        };
    }

    getTodosClientes() {
        return this.db.prepare('SELECT numero FROM clientes WHERE tem_acesso = 1').all();
    }

    // Limpar todas as contas (para reimportar)
    limparContas() {
        this.db.run('DELETE FROM contas');
        this.db.run('DELETE FROM resgates');
        this.db.run("UPDATE contas SET status = 'disponivel', usado_por = NULL, data_usado = NULL");
    }
}

module.exports = NyuxDatabase;
