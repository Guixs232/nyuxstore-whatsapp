const Database = require('better-sqlite3');
const moment = require('moment');
const fs = require('fs-extra');
const path = require('path');

class NyuxDatabase {
    constructor() {
        this.db = new Database('nyux_whatsapp.db');
        this.init();
    }

    init() {
        // Tabela de contas
        this.db.exec(`
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
        this.db.exec(`
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
        this.db.exec(`
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
        this.db.exec(`
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
        return stmt.run(jogo, categoria, login, senha);
    }

    buscarConta(nomeJogo) {
        const stmt = this.db.prepare('SELECT * FROM contas WHERE LOWER(jogo) LIKE ? AND status = ? LIMIT 1');
        return stmt.get(`%${nomeJogo.toLowerCase()}%`, 'disponivel');
    }

    marcarContaUsada(id, numeroCliente) {
        const stmt = this.db.prepare('UPDATE contas SET status = ?, usado_por = ?, data_usado = ? WHERE id = ?');
        stmt.run('usado', numeroCliente, moment().format('YYYY-MM-DD HH:mm:ss'), id);
        
        // Incrementa resgates do cliente
        const upd = this.db.prepare('UPDATE clientes SET total_resgates = total_resgates + 1 WHERE numero = ?');
        upd.run(numeroCliente);
        
        // Registra resgate
        const ins = this.db.prepare('INSERT INTO resgates (cliente_numero, conta_id) VALUES (?, ?)');
        ins.run(numeroCliente, id);
    }

    getTotalJogos() {
        return this.db.prepare('SELECT COUNT(*) as total FROM contas').get().total;
    }

    getCategoriasResumo() {
        const stmt = this.db.prepare('SELECT categoria, COUNT(*) as total FROM contas WHERE status = ? GROUP BY categoria');
        const rows = stmt.all('disponivel');
        const resultado = {};
        rows.forEach(row => resultado[row.categoria] = row.total);
        return resultado;
    }

    getTodosJogos() {
        const stmt = this.db.prepare('SELECT jogo as nome, categoria, status FROM contas ORDER BY categoria, jogo');
        return stmt.all();
    }

    // Keys
    criarKey(key, duracao, dias) {
        const expira = moment().add(dias, 'days').format('YYYY-MM-DD HH:mm:ss');
        const stmt = this.db.prepare('INSERT INTO keys (key_code, duracao, dias, expira_em) VALUES (?, ?, ?, ?)');
        return stmt.run(key, duracao, dias, expira);
    }

    resgatarKey(key, numeroCliente, nomeCliente) {
        // Verifica se key existe e está ativa
        const check = this.db.prepare('SELECT * FROM keys WHERE key_code = ? AND ativa = 1 AND usado_por IS NULL');
        const keyData = check.get(key);

        if (!keyData) {
            return { sucesso: false, erro: 'Key não encontrada ou já utilizada.' };
        }

        // Marca key como usada
        const updKey = this.db.prepare('UPDATE keys SET usado_por = ?, usado_em = ? WHERE id = ?');
        updKey.run(numeroCliente, moment().format('YYYY-MM-DD HH:mm:ss'), keyData.id);

        // Atualiza ou cria cliente
        const checkCliente = this.db.prepare('SELECT * FROM clientes WHERE numero = ?');
        const cliente = checkCliente.get(numeroCliente);

        if (cliente) {
            const upd = this.db.prepare('UPDATE clientes SET tem_acesso = 1, key_ativa = ?, expira_em = ?, nome = ? WHERE numero = ?');
            upd.run(key, keyData.expira_em, nomeCliente, numeroCliente);
        } else {
            const ins = this.db.prepare('INSERT INTO clientes (numero, nome, tem_acesso, key_ativa, expira_em) VALUES (?, ?, 1, ?, ?)');
            ins.run(numeroCliente, nomeCliente, key, keyData.expira_em);
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
            // Verifica se tem key ativa na tabela keys
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

    // Importação
    importarTXT(texto) {
        const linhas = texto.split('\n');
        let jogoAtual = 'Desconhecido';
        let adicionadas = 0;
        let erros = 0;
        const jogosVistos = new Set();
        const categorias = {};

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i];

            // Detecta jogo
            if (linha.includes('🎮') || linha.includes('Jogo:') || linha.includes('Games:')) {
                const match = linha.match(/(?:🎮|Jogo:|Games:)\s*(.+)/i);
                if (match) {
                    jogoAtual = match[1].trim();
                    jogosVistos.add(jogoAtual);
                }
                continue;
            }

            // Detecta login/senha
            const padroes = [
                /(?:Login|User|Usuário|Usuario):\s*(\S+).*?(?:Senha|Pass|Password):\s*(\S+)/i,
                /(?:Login|User|Usuário|Usuario):\s*(\S+)/i
            ];

            let login = null;
            let senha = null;

            // Tenta padrão completo na mesma linha
            const matchCompleto = linha.match(padroes[0]);
            if (matchCompleto) {
                login = matchCompleto[1];
                senha = matchCompleto[2];
            } else {
                // Tenta login na linha, senha na próxima
                const matchLogin = linha.match(/(?:Login|User|Usuário|Usuario):\s*(\S+)/i);
                if (matchLogin && i + 1 < linhas.length) {
                    login = matchLogin[1];
                    const matchSenha = linhas[i + 1].match(/(?:Senha|Pass|Password):\s*(\S+)/i);
                    if (matchSenha) {
                        senha = matchSenha[1];
                        i++; // Pula próxima linha
                    }
                }
            }

            if (login && senha && login.length > 2 && senha.length > 2) {
                try {
                    const categoria = this.detectarCategoria(jogoAtual);
                    this.addConta(jogoAtual, categoria, login, senha);
                    adicionadas++;
                    categorias[categoria] = (categorias[categoria] || 0) + 1;
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
        
        if (/corrida|forza|speed|nfs|truck|f1|grid|motorsport/.test(jogo)) return '🏎️ Corrida';
        if (/call of duty|cod|cs|battlefield|war|tiro|fps|shooter/.test(jogo)) return '🔫 FPS/Tiro';
        if (/assassin|witcher|elden|souls|rpg|final fantasy|dragon|skyrim/.test(jogo)) return '⚔️ RPG/Aventura';
        if (/resident evil|horror|fear|terror|evil|dead|silent hill|outlast/.test(jogo)) return '👻 Terror';
        if (/fifa|pes|nba|esporte|football|soccer|nfl|ufc|wwe/.test(jogo)) return '⚽ Esportes';
        if (/simulator|simulation|tycoon|manager|city|farming/.test(jogo)) return '🏗️ Simulador';
        if (/lego|minecraft|cartoon|sonic|mario|party/.test(jogo)) return '🎮 Casual/Família';
        if (/gta|red dead|mafia|saints|gangster|crime/.test(jogo)) return '🚔 Mundo Aberto/Ação';
        if (/strategy|xcom|civilization|age of|total war/.test(jogo)) return '🧠 Estratégia';
        
        return '🎯 Ação/Aventura';
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
}

module.exports = NyuxDatabase;
