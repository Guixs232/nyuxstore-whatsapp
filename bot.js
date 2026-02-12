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
// PARSER DE CONTAS STEAM
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
            'ggmax.com.br', 'seekkey', 'nyuxstore'
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

    limparTexto(texto) {
        return texto
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\t/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    verificarContaProblematica(conta) {
        const textoCompleto = [
            conta.jogo || '',
            conta.observacoes?.join(' ') || '',
            conta.plataforma || ''
        ].join(' ').toLowerCase();

        for (const palavra of this.palavrasBloqueadas) {
            if (textoCompleto.includes(palavra)) {
                return { problema: true, motivo: `Requer contato: "${palavra}"` };
            }
        }
        return { problema: false };
    }

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
            else if (linha.match(/pin.*code/i) || linha.match(/family.*pin/i)) {
                const match = linha.match(/\d{4}/);
                if (match) conta.pinCode = match[0];
            }
            else if (linha.match(/denuvo/i)) {
                conta.denuvo = true;
                conta.observacoes.push('⚠️ Proteção Denuvo - máximo 5 ativações/24h');
            }
            else if (linha.match(/^(⚠️|ATENÇÃO|IMPORTANTE|NOTA|OBS)/i)) {
                const obs = linha.replace(/^(⚠️|ATENÇÃO|IMPORTANTE|NOTA|OBS):?\s*/i, '').trim();
                if (obs) conta.observacoes.push(obs);
            }
        }

        if (!conta.jogo && conta.id) {
            conta.jogo = 'Conta Steam ' + conta.id;
        }

        conta.categoria = this.detectarCategoria(conta.jogo);

        const verificacao = this.verificarContaProblematica(conta);
        if (verificacao.problema) {
            this.contasRemovidas.push({
                id: conta.id,
                jogo: conta.jogo,
                login: conta.login,
                motivo: verificacao.motivo
            });
            console.log(`❌ Conta ${conta.id} REMOVIDA: ${verificacao.motivo}`);
            return;
        }

        if (conta.login && conta.senha && conta.login.length > 2 && conta.senha.length > 2) {
            this.contas.push(conta);
        } else {
            this.contasRemovidas.push({
                id: conta.id,
                jogo: conta.jogo,
                motivo: 'Login ou senha inválidos'
            });
        }
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
4️⃣ *Importar Contas (TXT)* 📄 ⚡NOVO
5️⃣ *Estatísticas* 📊
6️⃣ *Listar Jogos* 📋
7️⃣ *Broadcast* 📢
8️⃣ *Remover Conta* ❌
9️⃣ *Entrar em Grupo* 👥

0️⃣ *Voltar ao Menu*`;
}

function calcularTempoUso(dataRegistro) {
    if (!dataRegistro) return 'Novo usuário';

    const agora = new Date();
    const registro = new Date(dataRegistro);
    const diffMs = agora - registro;

    const segundos = Math.floor(diffMs / 1000);
    const minutos = Math.floor(segundos / 60);
    const horas = Math.floor(minutos / 60);
    const dias = Math.floor(horas / 24);
    const meses = Math.floor(dias / 30);
    const anos = Math.floor(dias / 365);

    if (anos > 0) return `${anos} ano${anos > 1 ? 's' : ''}`;
    if (meses > 0) return `${meses} mês${meses > 1 ? 'es' : ''}`;
    if (dias > 0) return `${dias} dia${dias > 1 ? 's' : ''}`;
    if (horas > 0) return `${horas} hora${horas > 1 ? 's' : ''}`;
    if (minutos > 0) return `${minutos} minuto${minutos > 1 ? 's' : ''}`;
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
        // PROCESSAMENTO DE MENSAGENS (CORRIGIDO)
        // ==========================================

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const msgId = msg.key.id;
            const participant = msg.key.participant || msg.key.remoteJid;
            const uniqueId = `${msgId}_${participant}`;

            // VERIFICAÇÃO DUPLA DE DUPLICADOS
            if (mensagensProcessadas.has(uniqueId)) {
                console.log(`⏩ Mensagem ${msgId} já processada, ignorando`);
                return;
            }

            // Marca como processada IMEDIATAMENTE
            mensagensProcessadas.add(uniqueId);

            // Limpa cache se ficar muito grande
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

            text = text.toLowerCase().trim();

            console.log(`\n📩 ${pushName} (${sender.split('@')[0]}): "${text}"`);

            // Comandos em grupo precisam de !
            if (isGroup) {
                if (!text.startsWith('!')) return;
                text = text.substring(1).trim();
            }

            const isAdmin = verificarAdmin(sender);
            const perfil = db.getPerfil(sender);
            const testeExpirado = perfil.usouTeste && !perfil.temAcesso;
            const userState = userStates.get(sender) || { step: 'menu' };

            // FLAG PARA EVITAR RESPOSTAS DUPLICADAS
            let respostaEnviada = false;

            async function enviarResposta(destino, mensagem) {
                if (respostaEnviada) {
                    console.log('⚠️ Resposta já enviada, ignorando duplicado');
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
                    if (testeExpirado && !isAdmin) {
                        if (text === '1') {
                            await enviarResposta(sender, { text: `💰 Preços:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 Fale com: +${ADMIN_NUMBER}` });
                        } else if (text === '2') {
                            await enviarResposta(sender, { text: '👑 Chamando admin...' });
                            await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { text: `🚨 CLIENTE QUER COMPRAR!\n\n${pushName}\n${sender.split('@')[0]}` });
                        } else {
                            await enviarResposta(sender, { text: `😢 *Teste Expirado*\n\n1️⃣ Comprar Key\n2️⃣ Falar com Admin\n\n0️⃣ Atendente` });
                        }
                        return;
                    }

                    switch(text) {
                        case '1':
                            await enviarResposta(sender, { text: `💰 *Preços:*\n\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 Para comprar, fale com:\n+${ADMIN_NUMBER}` });
                            break;

                        case '2':
                            userStates.set(sender, { step: 'resgatar_key' });
                            await enviarResposta(sender, { text: '🎁 Digite sua key no formato:\n*NYUX-XXXX-XXXX*\n\n_Exemplo: NYUX-AB12-CD34_' });
                            break;

                        case '3':
                            if (!db.verificarAcesso(sender)) {
                                await enviarResposta(sender, { text: '❌ Você precisa de uma key ativa!\n\nDigite 2 para resgatar ou 6 para teste grátis.' });
                                return;
                            }
                            const jogos = db.getJogosDisponiveisPorCategoria();
                            let msg = '🎮 *Jogos disponíveis:*\n\n';
                            for (const [cat, lista] of Object.entries(jogos)) {
                                msg += `*${cat}*\n`;
                                lista.slice(0, 5).forEach((j, i) => msg += `${i + 1}. ${j.jogo}\n`);
                                if (lista.length > 5) msg += `...e mais ${lista.length - 5}\n`;
                                msg += '\n';
                            }
                            msg += '🔍 Digite o *nome do jogo* que deseja:';
                            userStates.set(sender, { step: 'buscar_jogo' });
                            await enviarResposta(sender, { text: msg });
                            break;

                        case '4':
                            if (!db.verificarAcesso(sender)) {
                                await enviarResposta(sender, { text: '❌ Precisa de key ativa! Digite 2 ou 6' });
                                return;
                            }
                            const listaJogos = db.getJogosDisponiveisPorCategoria();
                            let msgLista = '📋 *Lista de Jogos:*\n\n';
                            let total = 0;
                            for (const [cat, lista] of Object.entries(listaJogos)) {
                                msgLista += `*${cat}* (${lista.length})\n`;
                                lista.forEach((j, i) => msgLista += `  ${i + 1}. ${j.jogo}\n`);
                                total += lista.length;
                            }
                            msgLista += `\n🎮 *Total: ${total} jogos*'`;
                            await enviarResposta(sender, { text: msgLista });
                            break;

                        case '5':
                            const p = db.getPerfil(sender);
                            const numLimpo = sender.split('@')[0];
                            const tempoUso = calcularTempoUso(p.dataRegistro);
                            const keysResgatadas = p.keysResgatadas ? p.keysResgatadas.length : 0;

                            let msgPerfil = `👤 *MEU PERFIL*\n\n`;
                            msgPerfil += `🪪 *Nome:* ${p.nome || pushName}\n`;
                            msgPerfil += `📱 *Número:* ${numLimpo}\n`;
                            msgPerfil += `⏱️ *Status:* ${p.temAcesso ? '✅ Ativo' : '❌ Inativo'}\n`;
                            msgPerfil += `🎮 *Keys Resgatadas:* ${keysResgatadas}\n`;
                            msgPerfil += `📅 *Cliente há:* ${tempoUso}\n`;

                            if (p.keyInfo) {
                                msgPerfil += `\n🔑 *Última Key:* ${p.keyInfo.key}\n`;
                                msgPerfil += `📆 *Expira:* ${p.keyInfo.expira}\n`;
                            }

                            if (p.usouTeste && !p.temAcesso) {
                                msgPerfil += `\n😢 *Seu teste expirou!*\nCompre uma key para continuar.`;
                            }

                            if (p.acessoPermanente) {
                                msgPerfil += `\n\n👑 *Você é Admin Premium!* 🌟`;
                            }

                            await enviarResposta(sender, { text: msgPerfil });
                            break;

                        case '6':
                            userStates.set(sender, { step: 'resgatar_key_teste' });
                            await enviarResposta(sender, { text: '🎉 *Teste Grátis*\n\nEscolha a duração:\n\n1️⃣ 1 hora\n2️⃣ 2 horas\n3️⃣ 6 horas\n\n⚠️ *Apenas 1 teste por pessoa!*\n\nDigite o número:' });
                            break;

                        case '0':
                            await enviarResposta(sender, { text: '💬 Chamando atendente... Aguarde.' });
                            await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { text: `📩 Cliente solicitou atendente:\n\n*${pushName}*\n${sender.split('@')[0]}\n\nDigite para responder.` });
                            break;

                        default:
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
                            await enviarResposta(sender, { 
                                text: `👑 *MASTER KEY ATIVADA!*\n\n🎉 Parabéns ${pushName}!\nVocê agora é *ADMINISTRADOR PERMANENTE*!\n\n⚠️ Esta key foi bloqueada após uso.\n\n🔧 Digite: *admin* para acessar o painel.` 
                            });
                            await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                                text: `🚨 *MASTER KEY USADA!*\n\n👤 ${pushName}\n📱 ${sender.split('@')[0]}\n⏰ ${new Date().toLocaleString()}` 
                            });
                        } else {
                            await enviarResposta(sender, { text: `❌ *${resultado.erro}*` });
                        }
                        return;
                    }

                    if (!key.match(/^NYUX-[A-Z0-9]{4}-[A-Z0-9]{4}$/)) {
                        await enviarResposta(sender, { text: '❌ *Formato inválido!*\n\nUse: *NYUX-XXXX-XXXX*\n\n_Exemplo: NYUX-AB12-CD34_' });
                        return;
                    }

                    const resultado = db.resgatarKey(key, sender, pushName);
                    if (resultado.sucesso) {
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { 
                            text: `✅ *KEY RESGATADA COM SUCESSO!*\n\n🎆 *Plano:* ${resultado.plano}\n⏱️ *Duração:* ${resultado.duracao}\n📅 *Expira em:* ${resultado.expira}\n\n🎮 Seu acesso foi liberado!\nDigite *menu* para ver as opções.` 
                        });
                    } else {
                        await enviarResposta(sender, { text: `❌ *Erro:* ${resultado.erro}` });
                    }
                }

                // ========== TESTE GRÁTIS ==========
                else if (userState.step === 'resgatar_key_teste') {
                    let duracao, horas;

                    if (text === '1') { duracao = '1 hora'; horas = 1; }
                    else if (text === '2') { duracao = '2 horas'; horas = 2; }
                    else if (text === '3') { duracao = '6 horas'; horas = 6; }
                    else {
                        await enviarResposta(sender, { text: '❌ Opção inválida!\n\nDigite:\n1️⃣ para 1 hora\n2️⃣ para 2 horas\n3️⃣ para 6 horas' });
                        return;
                    }

                    if (db.verificarTesteUsado(sender)) {
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { text: '❌ *Você já usou seu teste grátis!*\n\n💰 Compre uma key:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 Fale com: +' + ADMIN_NUMBER });
                        return;
                    }

                    const keyTeste = `TESTE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                    const resultado = db.criarKeyTeste(keyTeste, duracao, horas, sender, pushName);

                    if (resultado.sucesso) {
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { 
                            text: `🎉 *TESTE ATIVADO!*\n\n🔑 *Key:* ${keyTeste}\n⏱️ *Duração:* ${duracao}\n📅 *Expira em:* ${resultado.expira}\n\n✅ *Acesso liberado!*\n\nAproveite para testar nossos jogos!\nDigite *menu* para começar.` 
                        });
                    } else {
                        await enviarResposta(sender, { text: `❌ Erro: ${resultado.erro}` });
                    }
                }

                // ========== BUSCAR JOGO ==========
                else if (userState.step === 'buscar_jogo') {
                    const conta = db.buscarConta(text);

                    if (conta) {
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, {
                            text: `🎮 *${conta.jogo}*\n📂 ${conta.categoria}\n\n👤 *Login:* ${conta.login}\n🔒 *Senha:* ${conta.senha}\n\n⚠️ *IMPORTANTE:*\n• Use modo OFFLINE\n• NÃO altere a senha\n• NÃO compartilhe esta conta\n\n🎮 Bom jogo!` 
                        });
                    } else {
                        await enviarResposta(sender, { text: `❌ Jogo *"${text}"* não encontrado.\n\n🔍 Tente digitar o nome exato ou digite *4* para ver a lista completa.` });
                    }
                }

                // ========== MENU ADMIN ==========
                else if (userState.step === 'admin_menu' && isAdmin) {
                    switch(text) {
                        case '1':
                            userStates.set(sender, { step: 'admin_add_nome', tempConta: {} });
                            await enviarResposta(sender, { text: '➕ *Adicionar Conta*\n\nDigite o *nome do jogo*:' });
                            break;

                        case '2':
                            userStates.set(sender, { step: 'admin_gerar_key' });
                            await enviarResposta(sender, { text: '🔑 *Gerar Key*\n\nEscolha o plano:\n\n1️⃣ 7 dias - R$ 10\n2️⃣ 1 mês - R$ 25\n3️⃣ Lifetime - R$ 80\n\nDigite o número:' });
                            break;

                        case '3':
                            userStates.set(sender, { step: 'admin_gerar_teste' });
                            await enviarResposta(sender, { text: '🎁 *Gerar Key Teste*\n\nEscolha a duração:\n\n1️⃣ 1 hora\n2️⃣ 2 horas\n3️⃣ 6 horas\n\nDigite o número:' });
                            break;

                        case '4':
                            userStates.set(sender, { step: 'admin_importar_parser' });
                            await enviarResposta(sender, { 
                                text: `📄 *IMPORTAR CONTAS STEAM*\n\nEnvie o arquivo *contas_steam_nyuxstore.txt*\n\n⚡ O bot vai:\n✅ Extrair automaticamente login/senha\n🗑️ Remover contas problemáticas\n📂 Organizar por categoria\n\nOu digite *AUTO* para usar arquivo local` 
                            });
                            break;

                        case '5':
                            const stats = db.getEstatisticas();
                            await enviarResposta(sender, { 
                                text: `📊 *Estatísticas*\n\n🎮 Total de jogos: ${stats.totalJogos}\n✅ Disponíveis: ${stats.disponiveis}\n🔑 Keys ativas: ${stats.keysAtivas}\n👥 Clientes: ${stats.totalClientes}\n🔐 Master Key: ${stats.masterKeyUsada ? 'Usada' : 'Disponível'}` 
                            });
                            break;

                        case '6':
                            const todosJogos = db.getTodosJogosDisponiveis();
                            let msgJogos = '📋 *Todos os Jogos:*\n\n';
                            todosJogos.forEach((j, i) => {
                                msgJogos += `${i + 1}. ${j.jogo} (${j.categoria})\n`;
                            });
                            msgJogos += `\nTotal: ${todosJogos.length} jogos`;
                            await enviarResposta(sender, { text: msgJogos });
                            break;

                        case '7':
                            userStates.set(sender, { step: 'admin_broadcast' });
                            await enviarResposta(sender, { text: '📢 *Broadcast*\n\nDigite a mensagem que será enviada para *todos* os clientes:' });
                            break;

                        case '8':
                            userStates.set(sender, { step: 'admin_remover_lista', tempLista: db.getTodosJogosDisponiveis() });
                            const jogosRemover = db.getTodosJogosDisponiveis();
                            let msgRemover = '❌ *Remover Conta*\n\n';
                            jogosRemover.slice(0, 15).forEach((j, i) => {
                                msgRemover += `${i + 1}. ${j.jogo}\n`;
                            });
                            if (jogosRemover.length > 15) msgRemover += `...e mais ${jogosRemover.length - 15}\n`;
                            msgRemover += '\nDigite o *número* ou *nome* do jogo:';
                            await enviarResposta(sender, { text: msgRemover });
                            break;

                        case '9':
                            await enviarResposta(sender, { 
                                text: `👥 *Entrar em Grupo*\n\n1️⃣ Adicione o número *+${BOT_NUMBER}* no grupo\n2️⃣ Dê permissão de *ADMIN*\n3️⃣ Digite *!menu* no grupo\n\n⚠️ O bot só responde comandos que começam com ! em grupos` 
                            });
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

                // ========== ADMIN: IMPORTAR COM PARSER ==========
                else if (userState.step === 'admin_importar_parser' && isAdmin) {
                    if (text === 'auto' || text === 'AUTO') {
                        await enviarResposta(sender, { text: '⏳ Processando arquivo local...' });

                        try {
                            if (!fs.existsSync('contas_steam_nyuxstore.txt')) {
                                await enviarResposta(sender, { text: '❌ Arquivo não encontrado! Envie o arquivo primeiro.' });
                                userStates.set(sender, { step: 'admin_menu' });
                                return;
                            }

                            const conteudo = fs.readFileSync('contas_steam_nyuxstore.txt', 'utf-8');
                            const parser = new ContasSteamParser();
                            parser.extrairContas(conteudo);

                            const resumo = parser.gerarResumo();
                            let adicionadas = 0;

                            for (const conta of parser.contas) {
                                try {
                                    db.addConta(conta.jogo, conta.categoria, conta.login, conta.senha);
                                    adicionadas++;
                                } catch (e) {}
                            }

                            userStates.set(sender, { step: 'admin_menu' });

                            let msgResultado = `✅ *IMPORTAÇÃO CONCLUÍDA!*\n\n`;
                            msgResultado += `✅ Aprovadas: ${resumo.aprovadas}\n`;
                            msgResultado += `❌ Removidas: ${resumo.removidas}\n`;
                            msgResultado += `💾 Adicionadas: ${adicionadas}`;

                            await enviarResposta(sender, { text: msgResultado });

                        } catch (err) {
                            console.error('Erro:', err);
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

                            const resumo = parser.gerarResumo();
                            let adicionadas = 0;

                            for (const conta of parser.contas) {
                                try {
                                    db.addConta(conta.jogo, conta.categoria, conta.login, conta.senha);
                                    adicionadas++;
                                } catch (e) {}
                            }

                            userStates.set(sender, { step: 'admin_menu' });

                            let msgResultado = `✅ *ARQUIVO PROCESSADO!*\n\n`;
                            msgResultado += `✅ Válidas: ${resumo.aprovadas}\n`;
                            msgResultado += `❌ Removidas: ${resumo.removidas}\n`;
                            msgResultado += `💾 Adicionadas: ${adicionadas}`;

                            await enviarResposta(sender, { text: msgResultado });

                        } catch (err) {
                            console.error('Erro:', err);
                            await enviarResposta(sender, { text: '❌ Erro ao processar arquivo.' });
                            userStates.set(sender, { step: 'admin_menu' });
                        }
                    } else {
                        await enviarResposta(sender, { 
                            text: `📄 *Aguardando arquivo...*\n\nEnvie o arquivo ou digite *AUTO*` 
                        });
                    }
                }

                // ========== ADMIN: ADICIONAR CONTA ==========
                else if (userState.step === 'admin_add_nome' && isAdmin) {
                    const temp = userState.tempConta || {};
                    temp.jogo = text;
                    userStates.set(sender, { step: 'admin_add_cat', tempConta: temp });

                    const categorias = [
                        '🗡️ Ação', '🔫 Tiro', '🧟 Terror', '⚽ Esportes',
                        '🏎️ Corrida', '🎲 RPG', '🥊 Luta', '🕵️ Aventura',
                        '👻 Survival', '🚀 Estratégia', '🎯 Simulação', '🎮 Indie'
                    ];

                    let msgCat = '➕ Escolha a *categoria*:\n\n';
                    categorias.forEach((cat, i) => {
                        msgCat += `${i + 1}. ${cat}\n`;
                    });
                    await enviarResposta(sender, { text: msgCat });
                }

                else if (userState.step === 'admin_add_cat' && isAdmin) {
                    const cats = ['Ação', 'Tiro', 'Terror', 'Esportes', 'Corrida', 'RPG', 'Luta', 'Aventura', 'Survival', 'Estratégia', 'Simulação', 'Indie'];
                    const escolha = parseInt(text) - 1;

                    if (escolha >= 0 && escolha < cats.length) {
                        const temp = userState.tempConta || {};
                        temp.categoria = cats[escolha];
                        userStates.set(sender, { step: 'admin_add_login', tempConta: temp });
                        await enviarResposta(sender, { text: '➕ Digite o *login*:' });
                    } else {
                        await enviarResposta(sender, { text: '❌ Categoria inválida! Digite 1-12:' });
                    }
                }

                else if (userState.step === 'admin_add_login' && isAdmin) {
                    const temp = userState.tempConta || {};
                    temp.login = text;
                    userStates.set(sender, { step: 'admin_add_senha', tempConta: temp });
                    await enviarResposta(sender, { text: '➕ Digite a *senha*:' });
                }

                else if (userState.step === 'admin_add_senha' && isAdmin) {
                    const temp = userState.tempConta || {};
                    temp.senha = text;

                    db.addConta(temp.jogo, temp.categoria, temp.login, temp.senha);
                    userStates.set(sender, { step: 'admin_menu' });

                    await enviarResposta(sender, {
                        text: `✅ *Conta adicionada!*\n\n🎮 ${temp.jogo}\n👤 ${temp.login}` 
                    });
                }

                // ========== ADMIN: GERAR KEY ==========
                else if (userState.step === 'admin_gerar_key' && isAdmin) {
                    let plano, dias;

                    if (text === '1') { plano = '7 dias'; dias = 7; }
                    else if (text === '2') { plano = '1 mês'; dias = 30; }
                    else if (text === '3') { plano = 'Lifetime'; dias = 99999; }
                    else {
                        await enviarResposta(sender, { text: '❌ Opção inválida! Digite 1, 2 ou 3:' });
                        return;
                    }

                    const key = `NYUX-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
                    db.criarKey(key, plano, dias);
                    userStates.set(sender, { step: 'admin_menu' });

                    await enviarResposta(sender, {
                        text: `🔑 *KEY GERADA!*\n\n*${key}*\n\n⏱️ ${plano}` 
                    });
                }

                // ========== ADMIN: GERAR KEY TESTE ==========
                else if (userState.step === 'admin_gerar_teste' && isAdmin) {
                    let duracao, horas;

                    if (text === '1') { duracao = '1 hora'; horas = 1; }
                    else if (text === '2') { duracao = '2 horas'; horas = 2; }
                    else if (text === '3') { duracao = '6 horas'; horas = 6; }
                    else {
                        await enviarResposta(sender, { text: '❌ Opção inválida! Digite 1, 2 ou 3:' });
                        return;
                    }

                    const key = `TESTE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                    db.criarKey(key, duracao, horas, true);
                    userStates.set(sender, { step: 'admin_menu' });

                    await enviarResposta(sender, {
                        text: `🎁 *KEY TESTE!*\n\n*${key}*\n\n⏱️ ${duracao}` 
                    });
                }

                // ========== ADMIN: BROADCAST ==========
                else if (userState.step === 'admin_broadcast' && isAdmin) {
                    const clientes = db.getTodosClientes();
                    let enviados = 0;

                    await enviarResposta(sender, { text: `📢 Enviando para ${clientes.length} clientes...` });

                    for (const cliente of clientes) {
                        try {
                            await sock.sendMessage(cliente.numero, {
                                text: `📢 *${STORE_NAME}*\n\n${text}` 
                            });
                            enviados++;
                            await delay(1500);
                        } catch (e) {}
                    }

                    userStates.set(sender, { step: 'admin_menu' });
                    await enviarResposta(sender, { text: `✅ Enviado para ${enviados} clientes.` });
                }

                // ========== ADMIN: REMOVER CONTA ==========
                else if (userState.step === 'admin_remover_lista' && isAdmin) {
                    const escolha = parseInt(text);
                    const lista = userState.tempLista || db.getTodosJogosDisponiveis();

                    if (!isNaN(escolha) && escolha > 0 && escolha <= lista.length) {
                        const conta = lista[escolha - 1];
                        userStates.set(sender, { 
                            step: 'admin_remover_confirmar', 
                            tempConta: conta 
                        });
                        await enviarResposta(sender, { 
                            text: `❌ *Confirmar remoção?*\n\n🎮 ${conta.jogo}\n👤 ${conta.login}\n\nDigite *sim* ou *não*:` 
                        });
                    } else {
                        const resultado = db.buscarConta(text);
                        if (resultado) {
                            userStates.set(sender, { 
                                step: 'admin_remover_confirmar', 
                                tempConta: resultado 
                            });
                            await enviarResposta(sender, { 
                                text: `❌ *Confirmar remoção?*\n\n🎮 ${resultado.jogo}\n👤 ${resultado.login}\n\nDigite *sim* ou *não*:` 
                            });
                        } else {
                            await enviarResposta(sender, { text: '❌ Conta não encontrada.' });
                        }
                    }
                }

                else if (userState.step === 'admin_remover_confirmar' && isAdmin) {
                    if (text === 'sim' || text === 's') {
                        const conta = userState.tempConta;
                        const resultado = db.removerConta(conta.jogo, conta.login);

                        if (resultado.sucesso) {
                            userStates.set(sender, { step: 'admin_menu' });
                            await enviarResposta(sender, { 
                                text: `✅ *Removida!*\n\n🎮 ${conta.jogo}\n📊 Restante: ${resultado.totalRestante}` 
                            });
                        } else {
                            await enviarResposta(sender, { text: `❌ Erro: ${resultado.erro}` });
                        }
                    } else {
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: '✅ Cancelado.' });
                    }
                }

                // ========== COMANDO MENU/VOLTAR ==========
                if (text === 'menu' || text === 'voltar') {
                    userStates.set(sender, { step: 'menu' });
                    const perfilAtual = db.getPerfil(sender);

                    if (perfilAtual.usouTeste && !perfilAtual.temAcesso && !isAdmin) {
                        await enviarResposta(sender, { text: `😢 *Teste Expirado*\n\n1️⃣ Comprar\n2️⃣ Falar com Admin\n0️⃣ Atendente` });
                    } else {
                        await enviarResposta(sender, { text: getMenuPrincipal(pushName) });
                    }
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
