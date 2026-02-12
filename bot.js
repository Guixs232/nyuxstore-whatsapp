const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const http = require('http');
const path = require('path');
const Database = require('./database');
const moment = require('moment');

// ==========================================
// CONFIGURAÇÕES
// ==========================================
const BOT_NUMBER = process.env.BOT_NUMBER || '556183040115';
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '5518997972598';
const STORE_NAME = process.env.STORE_NAME || 'NyuxStore';
const PORT = process.env.PORT || 8080;
const ADMIN_MASTER_KEY = 'NYUX-ADM1-GUIXS23';

console.log('🚀 Iniciando NyuxStore...');
console.log('📱 Bot:', BOT_NUMBER);
console.log('👑 Admin:', ADMIN_NUMBER);
console.log('');

// ==========================================
// LIMPEZA INICIAL
// ==========================================
const pastasParaLimpar = ['auth_info_baileys', 'qrcode.png', 'qrcode.txt'];
console.log('🧹 Limpando arquivos antigos...');
pastasParaLimpar.forEach(pasta => {
    try {
        if (fs.existsSync(pasta)) {
            fs.rmSync(pasta, { recursive: true, force: true });
            console.log('   ✅', pasta);
        }
    } catch (e) {}
});
console.log('');

// ==========================================
// PARSER DE CONTAS STEAM - CORRIGIDO
// ==========================================
class ContasSteamParser {
    constructor() {
        this.contas = [];
        this.contasRemovidas = [];

        this.palavrasBloqueadas = [
            'mande mensagem', 'manda mensagem', 'whatsapp para conseguir',
            'chamar no whatsapp', 'solicitar acesso', 'pedir acesso',
            'contato para liberar', 'liberado manualmente', 'enviar mensagem',
            'precisa pedir', 'só funciona com', 'não funciona sem',
            'contato obrigatório', 'precisa de autorização', 'liberação manual',
            'comprado em:', 'ggmax', 'pertenece', 'perfil/', 'claigames',
            'ggmax.com.br', 'seekkey', 'nyuxstore', 'confirmação', 'confirmacao',
            'precisa confirmar', 'aguardar confirmação'
        ];

        this.categorias = {
            '🗡️ Assassins Creed': ['assassin', 'creed'],
            '🔫 Call of Duty': ['call of duty', 'cod', 'modern warfare', 'black ops'],
            '🧟 Resident Evil': ['resident evil', 're2', 're3', 're4', 're5', 're6', 're7', 're8', 'village'],
            '🐺 CD Projekt Red': ['witcher', 'cyberpunk'],
            '🚗 Rockstar Games': ['gta', 'grand theft auto', 'red dead', 'rdr2'],
            '🌲 Survival': ['sons of the forest', 'the forest', 'dayz', 'scum', 'green hell'],
            '🎮 Ação/Aventura': ['batman', 'spider-man', 'spiderman', 'marvel', 'hitman'],
            '🏎️ Corrida': ['forza', 'need for speed', 'nfs', 'f1', 'dirt', 'euro truck'],
            '🎲 RPG': ['elden ring', 'dark souls', 'sekiro', 'persona', 'final fantasy', 'baldur'],
            '🎯 Simuladores': ['farming simulator', 'flight simulator', 'cities skylines'],
            '👻 Terror': ['outlast', 'phasmophobia', 'dead by daylight', 'dying light'],
            '🥊 Luta': ['mortal kombat', 'mk1', 'mk11', 'street fighter', 'tekken'],
            '🦸 Super-Heróis': ['batman', 'spider-man', 'marvel', 'avengers'],
            '🔫 Tiro/FPS': ['cs2', 'counter-strike', 'apex', 'pubg', 'battlefield'],
            '🎭 Estratégia': ['civilization', 'age of empires', 'hearts of iron'],
            '🎬 Mundo Aberto': ['gta', 'red dead', 'witcher', 'cyberpunk', 'elden ring'],
            '🎾 Esportes': ['fifa', 'nba', 'pes', 'efootball'],
            '🎸 Indie': ['hollow knight', 'cuphead', 'hades', 'stardew valley'],
            '🎪 Outros': []
        };
    }

    detectarCategoria(nomeJogo) {
        const jogoLower = nomeJogo.toLowerCase();
        for (const [categoria, keywords] of Object.entries(this.categorias)) {
            for (const keyword of keywords) {
                if (jogoLower.includes(keyword)) return categoria;
            }
        }
        return '🎮 Ação/Aventura';
    }

    // CORRIGIDO: Processa múltiplas contas de uma vez
    processarMultiplasContas(texto) {
        const linhas = texto.split('\n').filter(l => l.trim());
        const resultados = {
            adicionadas: [],
            removidas: [],
            erros: []
        };

        for (const linha of linhas) {
            const conta = this.parseLinhaSimples(linha.trim());
            
            if (conta) {
                // Verifica se é problemática
                const verificacao = this.verificarContaProblematica(conta);
                if (verificacao.problema) {
                    resultados.removidas.push({
                        numero: conta.numero,
                        jogo: conta.jogo,
                        motivo: verificacao.motivo
                    });
                } else {
                    resultados.adicionadas.push(conta);
                }
            } else {
                resultados.erros.push(linha.trim());
            }
        }

        return resultados;
    }

    // CORRIGIDO: Parse de linha simples
    parseLinhaSimples(linha) {
        // Remove emojis e caracteres especiais do início
        linha = linha.replace(/^[🔢🎮👤🔒✅❌📱\s]+/g, '').trim();
        
        // Tenta dividir por pipe primeiro
        if (linha.includes('|')) {
            const partes = linha.split('|').map(p => p.trim());
            if (partes.length >= 4) {
                return {
                    numero: partes[0],
                    jogo: partes[1],
                    login: partes[2],
                    senha: partes[3],
                    categoria: this.detectarCategoria(partes[1])
                };
            }
        }
        
        // Tenta dividir por traço
        if (linha.includes(' - ')) {
            const partes = linha.split(' - ').map(p => p.trim());
            if (partes.length >= 4) {
                return {
                    numero: partes[0],
                    jogo: partes[1],
                    login: partes[2],
                    senha: partes[3],
                    categoria: this.detectarCategoria(partes[1])
                };
            }
        }
        
        // Divide por espaços (formato: NUMERO JOGO LOGIN SENHA)
        const partes = linha.split(/\s+/);
        
        if (partes.length >= 4) {
            // Primeiro elemento deve ser número
            if (/^\d{1,4}$/.test(partes[0])) {
                const numero = partes[0];
                const senha = partes[partes.length - 1];
                const login = partes[partes.length - 2];
                // Tudo entre número e login é o jogo
                const jogo = partes.slice(1, -2).join(' ');
                
                if (numero && jogo && login && senha) {
                    return {
                        numero: numero,
                        jogo: jogo,
                        login: login,
                        senha: senha,
                        categoria: this.detectarCategoria(jogo)
                    };
                }
            }
        }

        return null;
    }

    verificarContaProblematica(conta) {
        const textoCompleto = `${conta.jogo} ${conta.login} ${conta.senha}`.toLowerCase();

        for (const palavra of this.palavrasBloqueadas) {
            if (textoCompleto.includes(palavra)) {
                return { problema: true, motivo: `Contém: "${palavra}"` };
            }
        }
        return { problema: false };
    }

    // Método antigo mantido para compatibilidade
    extrairContas(conteudo) {
        const linhas = conteudo.split('\n');
        let contaAtual = null;
        let bufferLinhas = [];

        for (let i = 0; i < linhas.length; i++) {
            const linha = this.limparTexto(linhas[i]);

            if (linha.match(/^CONTA\s*\d+/i)) {
                if (contaAtual) this.processarConta(contaAtual, bufferLinhas);

                const matchNumero = linha.match(/CONTA\s*(\d+)/i);
                contaAtual = {
                    id: matchNumero ? parseInt(matchNumero[1]) : null,
                    jogo: '',
                    categoria: '',
                    login: '',
                    senha: '',
                    plataforma: 'Steam',
                    observacoes: [],
                    videoTutorial: null,
                    pinCode: null,
                    denuvo: false,
                    modoOffline: true
                };
                bufferLinhas = [];
                continue;
            }

            if (!contaAtual) continue;
            bufferLinhas.push(linha);
        }

        if (contaAtual) this.processarConta(contaAtual, bufferLinhas);
        return this.contas;
    }

    processarConta(conta, linhas) {
        for (const linha of linhas) {
            if (linha.match(/https?:\/\//)) {
                conta.videoTutorial = linha.match(/https?:\/\/[^\s]+/)?.[0];
            }
            else if (linha.match(/^Steam:/i)) conta.plataforma = 'Steam';
            else if (linha.match(/^Ubisoft:/i)) conta.plataforma = 'Ubisoft';
            else if (linha.match(/^Rockstar:/i)) conta.plataforma = 'Rockstar';
            else if (linha.match(/^(User|Usuário|Account|ACC|ID):\s*/i)) {
                conta.login = linha.replace(/^(User|Usuário|Account|ACC|ID):\s*/i, '').trim();
            }
            else if (linha.match(/^(Segurança|Senha|Password|Segurançaword|PW):\s*/i)) {
                conta.senha = linha.replace(/^(Segurança|Senha|Password|Segurançaword|PW):\s*/i, '').trim();
            }
            else if (linha.match(/^(Jogo|Game|Games):\s*/i)) {
                conta.jogo = linha.replace(/^(Jogo|Game|Games):\s*/i, '').trim();
            }
        }

        if (!conta.jogo && conta.id) {
            conta.jogo = 'Conta Steam ' + conta.id;
        }

        conta.categoria = this.detectarCategoria(conta.jogo);

        if (conta.login && conta.senha && conta.login.length > 2 && conta.senha.length > 2) {
            this.contas.push(conta);
        }
    }

    limparTexto(texto) {
        return texto
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\t/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    gerarResumo() {
        return {
            total: this.contas.length + this.contasRemovidas.length,
            aprovadas: this.contas.length,
            removidas: this.contasRemovidas.length,
            porCategoria: this.contas.reduce((acc, c) => {
                acc[c.categoria] = (acc[c.categoria] || 0) + 1;
                return acc;
            }, {})
        };
    }
}

// ==========================================
// VARIÁVEIS GLOBAIS
// ==========================================
const db = new Database();
const userStates = new Map();
const mensagensProcessadas = new Set();
const TEMPO_LIMPEZA_MS = 5 * 60 * 1000;

let botConectado = false;
let qrCodeDataURL = null;
let qrCodeRaw = null;
let qrCodeFilePath = null;
let sockGlobal = null;
let tentativasConexao = 0;
let reconectando = false;

// Limpa cache de mensagens
setInterval(() => {
    mensagensProcessadas.clear();
    console.log('🧹 Cache limpo');
}, TEMPO_LIMPEZA_MS);

// ==========================================
// SERVIDOR WEB
// ==========================================
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = req.url;

    if (url === '/api/status') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            conectado: botConectado,
            temQR: !!qrCodeDataURL,
            timestamp: new Date().toISOString()
        }));
        return;
    }

    if (url === '/qr.png') {
        if (qrCodeFilePath && fs.existsSync(qrCodeFilePath)) {
            res.setHeader('Content-Type', 'image/png');
            fs.createReadStream(qrCodeFilePath).pipe(res);
        } else {
            res.statusCode = 404;
            res.end('QR Code não encontrado');
        }
        return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (url === '/') {
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${STORE_NAME} - Bot WhatsApp</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta http-equiv="refresh" content="3">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: 'Segoe UI', Arial, sans-serif; 
                        text-align: center; 
                        padding: 40px 20px; 
                        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                        color: white;
                        min-height: 100vh;
                    }
                    h1 { 
                        color: #00d9ff; 
                        font-size: 2.5rem;
                        margin-bottom: 10px;
                        text-shadow: 0 0 20px rgba(0,217,255,0.3);
                    }
                    .status { 
                        padding: 25px; 
                        border-radius: 20px; 
                        margin: 30px auto;
                        font-size: 1.3rem;
                        max-width: 500px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    }
                    .online { 
                        background: linear-gradient(135deg, #4CAF50, #45a049); 
                    }
                    .offline { 
                        background: linear-gradient(135deg, #f44336, #da190b); 
                    }
                    .waiting { 
                        background: linear-gradient(135deg, #ff9800, #f57c00); 
                        animation: pulse 2s infinite;
                    }
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.02); }
                    }
                    .qr-container {
                        background: white;
                        padding: 30px;
                        border-radius: 25px;
                        margin: 30px auto;
                        max-width: 400px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                    }
                    .qr-container img { 
                        width: 100%; 
                        max-width: 350px;
                        border-radius: 10px;
                    }
                    .btn {
                        background: linear-gradient(135deg, #00d9ff, #0099cc);
                        color: #1a1a2e;
                        padding: 18px 40px;
                        text-decoration: none;
                        border-radius: 30px;
                        font-weight: bold;
                        font-size: 1.1rem;
                        display: inline-block;
                        margin: 15px;
                        box-shadow: 0 5px 20px rgba(0,217,255,0.4);
                        transition: transform 0.3s;
                    }
                    .btn:hover { transform: translateY(-3px); }
                    .info {
                        background: rgba(255,255,255,0.1);
                        backdrop-filter: blur(10px);
                        padding: 25px;
                        border-radius: 20px;
                        margin: 30px auto;
                        max-width: 500px;
                        border: 1px solid rgba(255,255,255,0.1);
                    }
                    .info p { margin: 10px 0; font-size: 1.1rem; }
                    .tentativa { color: #aaa; margin-top: 20px; }
                </style>
            </head>
            <body>
                <h1>🎮 ${STORE_NAME}</h1>

                ${botConectado ? `
                    <div class="status online">
                        <h2>✅ Bot Conectado!</h2>
                        <p>Sistema operacional</p>
                    </div>
                    <div class="info">
                        <p>🤖 Bot: +${BOT_NUMBER}</p>
                        <p>👑 Admin: +${ADMIN_NUMBER}</p>
                    </div>
                ` : (qrCodeDataURL ? `
                    <div class="status waiting">
                        <h2>📱 Escaneie o QR Code</h2>
                    </div>
                    <div class="qr-container">
                        <img src="${qrCodeDataURL}" alt="QR Code WhatsApp">
                    </div>
                    <a href="/qr.png" class="btn" download>💾 Baixar QR Code</a>
                    <div class="info">
                        <h3>📖 Como conectar:</h3>
                        <p>1. Abra WhatsApp no celular</p>
                        <p>2. Toque em ⋮ → <strong>WhatsApp Web</strong></p>
                        <p>3. Toque em <strong>Conectar dispositivo</strong></p>
                        <p>4. Aponte a câmera para o QR Code acima</p>
                    </div>
                ` : `
                    <div class="status offline">
                        <h2>⏳ Iniciando conexão...</h2>
                    </div>
                    <p class="tentativa">Tentativa: ${tentativasConexao}</p>
                    <div class="info">
                        <p>Aguarde o QR Code aparecer...</p>
                        <p>Isso pode levar alguns segundos</p>
                    </div>
                `)}
            </body>
            </html>
        `);
    } else {
        res.writeHead(302, { 'Location': '/' });
        res.end();
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor: http://localhost:${PORT}`);
    console.log(`🖼️  QR Code: http://localhost:${PORT}/qr.png\n`);
});

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

async function salvarQRCode(qr) {
    try {
        console.log('💾 Processando QR Code...');
        qrCodeRaw = qr;

        const QRCode = require('qrcode');

        qrCodeDataURL = await QRCode.toDataURL(qr, {
            width: 500,
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' }
        });

        qrCodeFilePath = path.join(__dirname, 'qrcode.png');
        await QRCode.toFile(qrCodeFilePath, qr, {
            width: 500,
            margin: 2
        });

        fs.writeFileSync('qrcode.txt', qr);

        console.log('✅ QR Code salvo');
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║           📱 QR CODE PRONTO            ║');
        console.log('╚════════════════════════════════════════╝\n');
        qrcode.generate(qr, { small: false });

    } catch (err) {
        console.error('❌ Erro ao salvar QR:', err.message);
    }
}

function verificarAdmin(sender) {
    const numeroLimpo = sender.replace('@s.whatsapp.net', '').replace('@g.us', '').split(':')[0];
    if (numeroLimpo === ADMIN_NUMBER) return true;
    return db.isAdminMaster(numeroLimpo);
}

function getMenuPrincipal(nome) {
    return `🎮 *${STORE_NAME}*

Olá, ${nome}! 👋

*Escolha uma opção:*

1️⃣ *Comprar Key* 💰
2️⃣ *Resgatar Key* 🎁
3️⃣ *Buscar Jogo* 🔍
4️⃣ *Ver Jogos* 📋
5️⃣ *Meu Perfil* 👤
6️⃣ *Key Teste Grátis* 🎉

0️⃣ *Falar com Atendente* 💬

_Digite o número da opção_`;
}

function getMenuAdmin() {
    return `🔧 *PAINEL ADMIN*

*Escolha uma opção:*

1️⃣ *Adicionar Conta* ➕
2️⃣ *Gerar Key* 🔑
3️⃣ *Gerar Key Teste* 🎁
4️⃣ *Importar Contas (TXT)* 📄
5️⃣ *Importar Múltiplas* 📋
6️⃣ *Estatísticas* 📊
7️⃣ *Listar Jogos* 📋
8️⃣ *Broadcast* 📢
9️⃣ *Remover Conta* ❌
🔟 *Entrar em Grupo* 👥

0️⃣ *Voltar ao Menu*`;
}

// CORRIGIDO: Cálculo de tempo mais preciso
function calcularTempoRestante(dataExpiracao) {
    if (!dataExpiracao) return 'N/A';
    
    const agora = new Date();
    const expira = new Date(dataExpiracao);
    const diffMs = expira - agora;

    if (diffMs <= 0) return '⛔ EXPIRADO';

    const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (dias > 0) return `${dias}d ${horas}h ${minutos}m`;
    if (horas > 0) return `${horas}h ${minutos}m`;
    return `${minutos}m`;
}

function calcularTempoUso(dataRegistro) {
    if (!dataRegistro) return 'Novo usuário';

    const agora = new Date();
    const registro = new Date(dataRegistro);
    const diffMs = agora - registro;

    const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const meses = Math.floor(dias / 30);

    if (meses > 0) return `${meses} mês${meses > 1 ? 'es' : ''}`;
    if (dias > 0) return `${dias} dia${dias > 1 ? 's' : ''}`;
    if (horas > 0) return `${horas} hora${horas > 1 ? 's' : ''}`;
    return 'Agora mesmo';
}

// ==========================================
// CONEXÃO WHATSAPP
// ==========================================

async function connectToWhatsApp() {
    if (reconectando) return;

    reconectando = true;
    tentativasConexao++;

    const delayMs = Math.min(5000 * Math.pow(2, tentativasConexao - 1), 60000);

    console.log(`\n🔌 TENTATIVA #${tentativasConexao}\n`);

    try {
        const { 
            default: makeWASocket, 
            DisconnectReason, 
            useMultiFileAuthState,
            fetchLatestBaileysVersion,
            delay
        } = await import('@whiskeysockets/baileys');

        const { version } = await fetchLatestBaileysVersion();
        console.log(`📱 Versão WhatsApp Web: ${version.join('.')}`);

        if (tentativasConexao > 3) {
            console.log('🧹 Limpando credenciais antigas...');
            try {
                fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                tentativasConexao = 0;
            } catch (e) {}
        }

        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

        console.log('🔌 Criando conexão...\n');

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['Chrome', 'Windows', '10.0.19042'],
            markOnlineOnConnect: true,
            syncFullHistory: false,
            shouldIgnoreJid: jid => jid?.includes('newsletter') || jid?.includes('broadcast'),
            connectTimeoutMs: 120000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 2000,
            maxMsgRetryCount: 5
        });

        sockGlobal = sock;

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('✅ QR Code recebido!');
                await salvarQRCode(qr);
                tentativasConexao = 0;
            }

            if (connection === 'close') {
                botConectado = false;
                qrCodeDataURL = null;
                reconectando = false;

                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const erroMsg = lastDisconnect?.error?.message || '';

                console.log(`\n❌ CONEXÃO FECHADA!`);
                console.log(`   Código: ${statusCode}`);
                console.log(`   Erro: ${erroMsg}`);

                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                if (shouldReconnect) {
                    console.log(`\n⏳ Reconectando em ${delayMs/1000}s...\n`);
                    setTimeout(connectToWhatsApp, delayMs);
                } else {
                    console.log('\n🚫 Logout detectado. Não reconectando.\n');
                }
            }

            else if (connection === 'open') {
                botConectado = true;
                qrCodeDataURL = null;
                qrCodeRaw = null;
                tentativasConexao = 0;
                reconectando = false;

                try {
                    if (fs.existsSync('qrcode.png')) fs.unlinkSync('qrcode.png');
                    if (fs.existsSync('qrcode.txt')) fs.unlinkSync('qrcode.txt');
                } catch (e) {}

                console.log('\n✅✅✅ BOT CONECTADO COM SUCESSO! ✅✅✅');
                console.log('📱 Número:', sock.user?.id?.split(':')[0]);
                console.log('👤 Nome:', sock.user?.name || 'Bot');
                console.log('');
            }

            else if (connection === 'connecting') {
                console.log('⏳ Conectando...');
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // ==========================================
        // PROCESSAMENTO DE MENSAGENS
        // ==========================================

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const msgId = msg.key.id;
            const participant = msg.key.participant || msg.key.remoteJid;
            const uniqueId = `${msgId}_${participant}`;

            // VERIFICAÇÃO DUPLA DE DUPLICADOS
            if (mensagensProcessadas.has(uniqueId)) {
                console.log(`⏩ Mensagem ${msgId} já processada`);
                return;
            }

            mensagensProcessadas.add(uniqueId);

            if (mensagensProcessadas.size > 1000) {
                const iterator = mensagensProcessadas.values();
                mensagensProcessadas.delete(iterator.next().value);
            }

            const sender = msg.key.remoteJid;
            const isGroup = sender.endsWith('@g.us');
            const pushName = msg.pushName || 'Cliente';

            // Extrai texto
            let text = '';
            if (msg.message.conversation) text = msg.message.conversation;
            else if (msg.message.extendedTextMessage) text = msg.message.extendedTextMessage.text;
            else if (msg.message.buttonsResponseMessage) text = msg.message.buttonsResponseMessage.selectedButtonId;
            else if (msg.message.listResponseMessage) text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
            else if (msg.message.documentMessage) text = '[documento]';

            const textOriginal = text;
            text = text.toLowerCase().trim();

            console.log(`\n📩 ${pushName} (${sender.split('@')[0]}): "${text.substring(0, 50)}..."`);

            // Comandos em grupo precisam de !
            if (isGroup) {
                if (!text.startsWith('!')) return;
                text = text.substring(1).trim();
            }

            const isAdmin = verificarAdmin(sender);
            const perfil = db.getPerfil(sender);
            const testeExpirado = perfil.usouTeste && !perfil.temAcesso;
            const userState = userStates.get(sender) || { step: 'menu' };

            let respostaEnviada = false;

            async function enviarResposta(destino, mensagem) {
                if (respostaEnviada) {
                    console.log('⚠️ Resposta já enviada');
                    return;
                }
                respostaEnviada = true;
                await sock.sendMessage(destino, mensagem);
            }

            try {
                // ========== COMANDO ADMIN ==========
                if (text === 'admin' || text === 'adm') {
                    if (isAdmin) {
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: getMenuAdmin() });
                    } else {
                        await enviarResposta(sender, { text: '⛔ *Acesso Negado*' });
                    }
                    return;
                }

                // ========== MENU PRINCIPAL ==========
                if (userState.step === 'menu') {
                    switch(text) {
                        case '1':
                            await enviarResposta(sender, { text: `💰 *Preços:*\n\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 Para comprar, fale com:\n+${ADMIN_NUMBER}` });
                            break;

                        case '2':
                            userStates.set(sender, { step: 'resgatar_key' });
                            await enviarResposta(sender, { text: '🎁 Digite sua key:\n*NYUX-XXXX-XXXX*' });
                            break;

                        case '3':
                            if (!db.verificarAcesso(sender)) {
                                await enviarResposta(sender, { text: '❌ Precisa de key ativa!' });
                                return;
                            }
                            const jogos = db.getJogosDisponiveisPorCategoria();
                            let msg = '🎮 *Jogos disponíveis:*\n\n';
                            for (const [cat, lista] of Object.entries(jogos)) {
                                msg += `*${cat}*\n`;
                                lista.slice(0, 3).forEach((j, i) => msg += `${i + 1}. ${j.jogo}\n`);
                                if (lista.length > 3) msg += `...e mais ${lista.length - 3}\n`;
                                msg += '\n';
                            }
                            userStates.set(sender, { step: 'buscar_jogo' });
                            await enviarResposta(sender, { text: msg });
                            break;

                        // CORRIGIDO: Opção 4 - Ver todos os jogos com paginação
                        case '4':
                            if (!db.verificarAcesso(sender)) {
                                await enviarResposta(sender, { text: '❌ Precisa de key ativa! Digite 2 ou 6' });
                                return;
                            }
                            
                            const todosJogos = db.getTodosJogosDisponiveis();
                            
                            if (todosJogos.length === 0) {
                                await enviarResposta(sender, { text: '📋 *Nenhum jogo cadastrado ainda.*' });
                                return;
                            }
                            
                            // Divide em páginas de 20 jogos
                            const jogosPorPagina = 20;
                            const totalPaginas = Math.ceil(todosJogos.length / jogosPorPagina);
                            
                            let msgLista = `📋 *TODOS OS JOGOS DISPONÍVEIS*\n\n`;
                            msgLista += `🎮 Total: ${todosJogos.length} jogos\n`;
                            msgLista += `📄 Página 1/${totalPaginas}\n\n`;
                            
                            const jogosPagina = todosJogos.slice(0, jogosPorPagina);
                            
                            jogosPagina.forEach((jogo, index) => {
                                msgLista += `${index + 1}. *${jogo.jogo}*\n`;
                                msgLista += `   📂 ${jogo.categoria}\n`;
                                msgLista += `   👤 ${jogo.login}\n\n`;
                            });
                            
                            if (totalPaginas > 1) {
                                msgLista += `\n📄 Digite *mais* para ver mais jogos\n`;
                            }
                            
                            msgLista += `\n🔍 Para buscar um jogo específico, digite o nome`;
                            
                            // Salva estado com paginação
                            userStates.set(sender, { 
                                step: 'ver_jogos_pagina', 
                                paginaAtual: 1,
                                totalPaginas: totalPaginas,
                                todosJogos: todosJogos
                            });
                            
                            await enviarResposta(sender, { text: msgLista });
                            break;

                        // CORRIGIDO: Opção 5 - Meu Perfil completo
                        case '5':
                            const p = db.getPerfil(sender);
                            const numLimpo = sender.split('@')[0];
                            
                            // Calcula tempo de uso
                            const tempoUso = calcularTempoUso(p.dataRegistro);
                            
                            // Calcula tempo restante do plano
                            let tempoRestante = '⛔ Sem plano ativo';
                            let expiraEm = 'N/A';
                            
                            if (p.temAcesso && p.keyInfo) {
                                tempoRestante = calcularTempoRestante(p.keyInfo.dataExpiracao);
                                expiraEm = p.keyInfo.expira || 'N/A';
                            }
                            
                            // Conta jogos resgatados (contas que o usuário pegou)
                            const jogosResgatados = p.jogosResgatados ? p.jogosResgatados.length : 0;
                            
                            // Conta keys resgatadas
                            const keysResgatadas = p.keysResgatadas ? p.keysResgatadas.length : 0;
                            
                            // Verifica se é teste ou plano pago
                            let tipoPlano = '❌ Sem acesso';
                            if (p.temAcesso) {
                                if (p.acessoPermanente) {
                                    tipoPlano = '👑 ADMIN LIFETIME';
                                } else if (p.keyInfo && p.keyInfo.plano) {
                                    tipoPlano = `✅ ${p.keyInfo.plano.toUpperCase()}`;
                                } else {
                                    tipoPlano = '✅ ATIVO';
                                }
                            } else if (p.usouTeste) {
                                tipoPlano = '⛔ TESTE EXPIRADO';
                            }
                            
                            let msgPerfil = `👤 *MEU PERFIL*\n\n`;
                            msgPerfil += `🪪 *Nome:* ${p.nome || pushName}\n`;
                            msgPerfil += `📱 *Número:* ${numLimpo}\n\n`;
                            
                            msgPerfil += `⏱️ *Status do Plano:*\n`;
                            msgPerfil += `${tipoPlano}\n`;
                            
                            if (p.temAcesso && p.keyInfo) {
                                msgPerfil += `\n📅 *Expira em:* ${expiraEm}\n`;
                                msgPerfil += `⏳ *Tempo restante:* ${tempoRestante}\n`;
                            }
                            
                            msgPerfil += `\n📊 *Estatísticas:*\n`;
                            msgPerfil += `🎮 Jogos resgatados: ${jogosResgatados}\n`;
                            msgPerfil += `🔑 Keys resgatadas: ${keysResgatadas}\n`;
                            msgPerfil += `📅 *Cliente há:* ${tempoUso}\n`;
                            
                            if (p.usouTeste && !p.temAcesso) {
                                msgPerfil += `\n😢 *Seu teste expirou!*\n`;
                                msgPerfil += `💰 Compre uma key para continuar:\n`;
                                msgPerfil += `• 7 dias: R$ 10\n`;
                                msgPerfil += `• 1 mês: R$ 25\n`;
                                msgPerfil += `• Lifetime: R$ 80\n`;
                            }
                            
                            if (p.acessoPermanente) {
                                msgPerfil += `\n\n👑 *Você é Administrador!* 🌟`;
                            }
                            
                            await enviarResposta(sender, { text: msgPerfil });
                            break;

                        case '6':
                            userStates.set(sender, { step: 'resgatar_key_teste' });
                            await enviarResposta(sender, { text: '🎉 *Teste Grátis*\n\n1️⃣ 1 hora\n2️⃣ 2 horas\n3️⃣ 6 horas\n\nDigite o número:' });
                            break;

                        case '0':
                            await enviarResposta(sender, { text: '💬 Chamando atendente...' });
                            await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { text: `📩 Cliente quer atendente:\n${pushName}` });
                            break;

                        default:
                            await enviarResposta(sender, { text: getMenuPrincipal(pushName) });
                    }
                }

                // ========== PAGINAÇÃO DE JOGOS ==========
                else if (userState.step === 'ver_jogos_pagina') {
                    if (text === 'mais' || text === 'proxima' || text === 'próxima') {
                        const proximaPagina = userState.paginaAtual + 1;
                        
                        if (proximaPagina > userState.totalPaginas) {
                            await enviarResposta(sender, { text: '✅ Você já viu todos os jogos!\n\nDigite *menu* para voltar.' });
                            userStates.set(sender, { step: 'menu' });
                            return;
                        }
                        
                        const jogosPorPagina = 20;
                        const inicio = (proximaPagina - 1) * jogosPorPagina;
                        const fim = inicio + jogosPorPagina;
                        const jogosPagina = userState.todosJogos.slice(inicio, fim);
                        
                        let msgLista = `📋 *TODOS OS JOGOS*\n\n`;
                        msgLista += `🎮 Total: ${userState.todosJogos.length} jogos\n`;
                        msgLista += `📄 Página ${proximaPagina}/${userState.totalPaginas}\n\n`;
                        
                        jogosPagina.forEach((jogo, index) => {
                            const numReal = inicio + index + 1;
                            msgLista += `${numReal}. *${jogo.jogo}*\n`;
                            msgLista += `   📂 ${jogo.categoria}\n`;
                            msgLista += `   👤 ${jogo.login}\n\n`;
                        });
                        
                        if (proximaPagina < userState.totalPaginas) {
                            msgLista += `\n📄 Digite *mais* para próxima página\n`;
                        }
                        msgLista += `\n🔍 Digite o nome do jogo para buscar`;
                        
                        userStates.set(sender, { 
                            ...userState,
                            step: 'ver_jogos_pagina',
                            paginaAtual: proximaPagina
                        });
                        
                        await enviarResposta(sender, { text: msgLista });
                    } else {
                        // Se digitou algo diferente de "mais", volta para menu ou busca
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { text: getMenuPrincipal(pushName) });
                    }
                }

                // ========== RESGATAR KEY ==========
                else if (userState.step === 'resgatar_key') {
                    const key = text.toUpperCase().replace(/\s/g, '');

                    if (key === ADMIN_MASTER_KEY) {
                        const resultado = db.resgatarMasterKey(key, sender, pushName);
                        if (resultado.sucesso) {
                            userStates.set(sender, { step: 'menu' });
                            await enviarResposta(sender, { text: `👑 *ADMIN ATIVADO!*\n\nDigite: *admin*` });
                        } else {
                            await enviarResposta(sender, { text: `❌ ${resultado.erro}` });
                        }
                        return;
                    }

                    if (!key.match(/^NYUX-[A-Z0-9]{4}-[A-Z0-9]{4}$/)) {
                        await enviarResposta(sender, { text: '❌ Formato inválido! Use NYUX-XXXX-XXXX' });
                        return;
                    }

                    const resultado = db.resgatarKey(key, sender, pushName);
                    if (resultado.sucesso) {
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { text: `✅ *KEY ATIVADA!*\n\nPlano: ${resultado.plano}\nExpira: ${resultado.expira}` });
                    } else {
                        await enviarResposta(sender, { text: `❌ ${resultado.erro}` });
                    }
                }

                // ========== TESTE GRÁTIS ==========
                else if (userState.step === 'resgatar_key_teste') {
                    let duracao, horas;
                    if (text === '1') { duracao = '1 hora'; horas = 1; }
                    else if (text === '2') { duracao = '2 horas'; horas = 2; }
                    else if (text === '3') { duracao = '6 horas'; horas = 6; }
                    else {
                        await enviarResposta(sender, { text: '❌ Opção inválida! Digite 1, 2 ou 3:' });
                        return;
                    }

                    if (db.verificarTesteUsado(sender)) {
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { text: '❌ Você já usou seu teste!' });
                        return;
                    }

                    const keyTeste = `TESTE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
                    const resultado = db.criarKeyTeste(keyTeste, duracao, horas, sender, pushName);

                    if (resultado.sucesso) {
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { text: `🎉 *TESTE ATIVADO!*\n\nKey: ${keyTeste}\nDuração: ${duracao}` });
                    }
                }

                // ========== BUSCAR JOGO ==========
                else if (userState.step === 'buscar_jogo') {
                    const conta = db.buscarConta(text);
                    if (conta) {
                        // Registra que o usuário resgatou este jogo
                        db.registrarJogoResgatado(sender, conta);
                        
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { text: `🎮 *${conta.jogo}*\n\n👤 Login: ${conta.login}\n🔒 Senha: ${conta.senha}\n📂 Categoria: ${conta.categoria}\n\n⚠️ Use modo OFFLINE!` });
                    } else {
                        await enviarResposta(sender, { text: `❌ Jogo não encontrado.` });
                    }
                }

                // ========== MENU ADMIN ==========
                else if (userState.step === 'admin_menu' && isAdmin) {
                    switch(text) {
                        case '1':
                            userStates.set(sender, { step: 'admin_add_nome', tempConta: {} });
                            await enviarResposta(sender, { text: '➕ *Adicionar Conta*\n\nDigite o nome do jogo:' });
                            break;

                        case '2':
                            userStates.set(sender, { step: 'admin_gerar_key' });
                            await enviarResposta(sender, { text: '🔑 *Gerar Key*\n\n1️⃣ 7 dias - R$ 10\n2️⃣ 1 mês - R$ 25\n3️⃣ Lifetime - R$ 80' });
                            break;

                        case '3':
                            userStates.set(sender, { step: 'admin_gerar_teste' });
                            await enviarResposta(sender, { text: '🎁 *Gerar Teste*\n\n1️⃣ 1 hora\n2️⃣ 2 horas\n3️⃣ 6 horas' });
                            break;

                        case '4':
                            userStates.set(sender, { step: 'admin_importar_parser' });
                            await enviarResposta(sender, { text: '📄 *Importar arquivo TXT*\n\nEnvie o arquivo ou digite AUTO' });
                            break;

                        case '5':
                            userStates.set(sender, { step: 'admin_importar_multiplas' });
                            await enviarResposta(sender, { 
                                text: `📋 *IMPORTAR MÚLTIPLAS CONTAS*\n\nCole as contas no formato:\n\n*NUMERO JOGO LOGIN SENHA*\n\nExemplo:\n\`\`\`\n331 Assassins Creed Shadows usuario1 senha123\n332 Black Myth Wukong usuario2 senha456\n333 Farming Simulator usuario3 senha789\n\`\`\`\n\n⚡ O bot vai separar automaticamente!\n\nDigite as contas agora:` 
                            });
                            break;

                        case '6':
                            const stats = db.getEstatisticas();
                            await enviarResposta(sender, { text: `📊 *Estatísticas*\n\n🎮 Jogos: ${stats.totalJogos}\n✅ Disponíveis: ${stats.disponiveis}\n🔑 Keys: ${stats.keysAtivas}` });
                            break;

                        case '7':
                            const todos = db.getTodosJogosDisponiveis();
                            await enviarResposta(sender, { text: `📋 *${todos.length} jogos cadastrados*` });
                            break;

                        case '8':
                            userStates.set(sender, { step: 'admin_broadcast' });
                            await enviarResposta(sender, { text: '📢 Digite a mensagem para broadcast:' });
                            break;

                        case '9':
                            userStates.set(sender, { step: 'admin_remover_lista' });
                            await enviarResposta(sender, { text: '❌ Digite o nome do jogo para remover:' });
                            break;

                        case '10':
                            await enviarResposta(sender, { text: `👥 Adicione +${BOT_NUMBER} ao grupo como admin` });
                            break;

                        case '0':
                        case 'menu':
                            userStates.set(sender, { step: 'menu' });
                            await enviarResposta(sender, { text: getMenuPrincipal(pushName) });
                            break;

                        default:
                            await enviarResposta(sender, { text: getMenuAdmin() });
                    }
                }

                // ========== ADMIN: IMPORTAR MÚLTIPLAS CONTAS ==========
                else if (userState.step === 'admin_importar_multiplas' && isAdmin) {
                    const parser = new ContasSteamParser();
                    const resultado = parser.processarMultiplasContas(textOriginal);

                    let adicionadas = 0;
                    let falhas = 0;

                    // Adiciona as contas válidas no banco
                    for (const conta of resultado.adicionadas) {
                        try {
                            db.addConta(conta.jogo, conta.categoria, conta.login, conta.senha);
                            adicionadas++;
                        } catch (e) {
                            falhas++;
                        }
                    }

                    userStates.set(sender, { step: 'admin_menu' });

                    // Monta relatório
                    let msgRelatorio = `✅ *IMPORTAÇÃO CONCLUÍDA!*\n\n`;
                    msgRelatorio += `📊 Resumo:\n`;
                    msgRelatorio += `✅ Adicionadas: ${adicionadas}\n`;
                    msgRelatorio += `❌ Removidas: ${resultado.removidas.length}\n`;
                    if (resultado.erros.length > 0) {
                        msgRelatorio += `⚠️ Erros de formato: ${resultado.erros.length}\n`;
                    }
                    if (falhas > 0) {
                        msgRelatorio += `💥 Falhas no DB: ${falhas}\n`;
                    }

                    // Mostra algumas contas removidas (se houver)
                    if (resultado.removidas.length > 0) {
                        msgRelatorio += `\n🚫 *Contas problemáticas:*\n`;
                        resultado.removidas.slice(0, 3).forEach(r => {
                            msgRelatorio += `• Conta ${r.numero}: ${r.motivo}\n`;
                        });
                        if (resultado.removidas.length > 3) {
                            msgRelatorio += `...e mais ${resultado.removidas.length - 3}\n`;
                        }
                    }

                    // Mostra categorias detectadas
                    const categorias = {};
                    resultado.adicionadas.forEach(c => {
                        categorias[c.categoria] = (categorias[c.categoria] || 0) + 1;
                    });

                    if (Object.keys(categorias).length > 0) {
                        msgRelatorio += `\n📂 *Categorias:*\n`;
                        for (const [cat, qtd] of Object.entries(categorias)) {
                            msgRelatorio += `${cat}: ${qtd}\n`;
                        }
                    }

                    await enviarResposta(sender, { text: msgRelatorio });
                }

                // ========== ADMIN: IMPORTAR ARQUIVO ==========
                else if (userState.step === 'admin_importar_parser' && isAdmin) {
                    if (text === 'auto' || text === 'AUTO') {
                        await enviarResposta(sender, { text: '⏳ Processando arquivo local...' });

                        try {
                            if (!fs.existsSync('contas_steam_nyuxstore.txt')) {
                                await enviarResposta(sender, { text: '❌ Arquivo não encontrado!' });
                                userStates.set(sender, { step: 'admin_menu' });
                                return;
                            }

                            const conteudo = fs.readFileSync('contas_steam_nyuxstore.txt', 'utf-8');
                            const parser = new ContasSteamParser();
                            parser.extrairContas(conteudo);

                            let adicionadas = 0;
                            for (const conta of parser.contas) {
                                try {
                                    db.addConta(conta.jogo, conta.categoria, conta.login, conta.senha);
                                    adicionadas++;
                                } catch (e) {}
                            }

                            userStates.set(sender, { step: 'admin_menu' });
                            await enviarResposta(sender, { 
                                text: `✅ *ARQUIVO PROCESSADO!*\n\n✅ Aprovadas: ${parser.contas.length}\n❌ Removidas: ${parser.contasRemovidas.length}\n💾 Adicionadas: ${adicionadas}` 
                            });

                        } catch (err) {
                            await enviarResposta(sender, { text: '❌ Erro ao processar.' });
                            userStates.set(sender, { step: 'admin_menu' });
                        }
                        return;
                    }

                    if (msg.message.documentMessage) {
                        await enviarResposta(sender, { text: '⏳ Processando arquivo...' });

                        try {
                            const stream = await sock.downloadContentFromMessage(msg.message.documentMessage, 'document');
                            let buffer = Buffer.from([]);
                            for await (const chunk of stream) {
                                buffer = Buffer.concat([buffer, chunk]);
                            }

                            const conteudo = buffer.toString('utf-8');
                            const parser = new ContasSteamParser();
                            parser.extrairContas(conteudo);

                            let adicionadas = 0;
                            for (const conta of parser.contas) {
                                try {
                                    db.addConta(conta.jogo, conta.categoria, conta.login, conta.senha);
                                    adicionadas++;
                                } catch (e) {}
                            }

                            userStates.set(sender, { step: 'admin_menu' });
                            await enviarResposta(sender, { 
                                text: `✅ *ARQUIVO PROCESSADO!*\n\n✅ Válidas: ${parser.contas.length}\n❌ Removidas: ${parser.contasRemovidas.length}\n💾 Adicionadas: ${adicionadas}` 
                            });

                        } catch (err) {
                            await enviarResposta(sender, { text: '❌ Erro ao processar arquivo.' });
                            userStates.set(sender, { step: 'admin_menu' });
                        }
                    } else {
                        await enviarResposta(sender, { text: '📄 Envie o arquivo ou digite AUTO' });
                    }
                }

                // ========== ADMIN: ADICIONAR MANUAL ==========
                else if (userState.step === 'admin_add_nome' && isAdmin) {
                    const temp = userState.tempConta || {};
                    temp.jogo = textOriginal; // Mantém case original
                    userStates.set(sender, { step: 'admin_add_cat', tempConta: temp });
                    await enviarResposta(sender, { text: '➕ Escolha categoria (1-12):' });
                }

                else if (userState.step === 'admin_add_cat' && isAdmin) {
                    const cats = ['Ação', 'Tiro', 'Terror', 'Esportes', 'Corrida', 'RPG', 'Luta', 'Aventura', 'Survival', 'Estratégia', 'Simulação', 'Indie'];
                    const escolha = parseInt(text) - 1;

                    if (escolha >= 0 && escolha < cats.length) {
                        const temp = userState.tempConta || {};
                        temp.categoria = cats[escolha];
                        userStates.set(sender, { step: 'admin_add_login', tempConta: temp });
                        await enviarResposta(sender, { text: '➕ Digite o login:' });
                    } else {
                        await enviarResposta(sender, { text: '❌ Digite 1-12:' });
                    }
                }

                else if (userState.step === 'admin_add_login' && isAdmin) {
                    const temp = userState.tempConta || {};
                    temp.login = text;
                    userStates.set(sender, { step: 'admin_add_senha', tempConta: temp });
                    await enviarResposta(sender, { text: '➕ Digite a senha:' });
                }

                else if (userState.step === 'admin_add_senha' && isAdmin) {
                    const temp = userState.tempConta || {};
                    temp.senha = text;

                    db.addConta(temp.jogo, temp.categoria, temp.login, temp.senha);
                    userStates.set(sender, { step: 'admin_menu' });

                    await enviarResposta(sender, { text: `✅ *Conta adicionada!*\n\n🎮 ${temp.jogo}\n👤 ${temp.login}` });
                }

                // ========== ADMIN: GERAR KEY ==========
                else if (userState.step === 'admin_gerar_key' && isAdmin) {
                    let plano, dias;
                    if (text === '1') { plano = '7 dias'; dias = 7; }
                    else if (text === '2') { plano = '1 mês'; dias = 30; }
                    else if (text === '3') { plano = 'Lifetime'; dias = 99999; }
                    else {
                        await enviarResposta(sender, { text: '❌ Digite 1, 2 ou 3:' });
                        return;
                    }

                    const key = `NYUX-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
                    db.criarKey(key, plano, dias);
                    userStates.set(sender, { step: 'admin_menu' });

                    await enviarResposta(sender, { text: `🔑 *KEY GERADA!*\n\n${key}\n\n⏱️ ${plano}` });
                }

                // ========== ADMIN: BROADCAST ==========
                else if (userState.step === 'admin_broadcast' && isAdmin) {
                    const clientes = db.getTodosClientes();
                    let enviados = 0;

                    await enviarResposta(sender, { text: `📢 Enviando para ${clientes.length} clientes...` });

                    for (const cliente of clientes) {
                        try {
                            await sock.sendMessage(cliente.numero, { text: `📢 *${STORE_NAME}*\n\n${textOriginal}` });
                            enviados++;
                            await delay(1500);
                        } catch (e) {}
                    }

                    userStates.set(sender, { step: 'admin_menu' });
                    await enviarResposta(sender, { text: `✅ Enviado para ${enviados} clientes.` });
                }

                // ========== COMANDO MENU ==========
                if (text === 'menu' || text === 'voltar') {
                    userStates.set(sender, { step: 'menu' });
                    await enviarResposta(sender, { text: getMenuPrincipal(pushName) });
                }

            } catch (error) {
                console.error('❌ Erro:', error);
            }
        });

    } catch (err) {
        console.error('\n❌ ERRO FATAL:', err.message);
        reconectando = false;
        setTimeout(connectToWhatsApp, 10000);
    }
}

// Inicia
console.log('⏳ Iniciando em 3 segundos...\n');
setTimeout(connectToWhatsApp, 3000);
