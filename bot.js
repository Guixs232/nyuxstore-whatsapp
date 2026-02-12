const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const http = require('http');
const Database = require('./database');
const moment = require('moment');

// Configurações
const BOT_NUMBER = '556183040115';
const ADMIN_NUMBER = '5518997972598'; // Seu número principal (apenas dígitos)
const STORE_NAME = 'NyuxStore';
const PORT = process.env.PORT || 8080;

const db = new Database();
const userStates = new Map();

// Controle de mensagens processadas (evita duplicatas)
const mensagensProcessadas = new Set();
const TEMPO_LIMPEZA_MS = 5 * 60 * 1000; // Limpa mensagens antigas a cada 5 minutos

// Variáveis globais
let qrCodeDataURL = null;
let botConectado = false;
let sockGlobal = null;

// Limpa mensagens antigas periodicamente
setInterval(() => {
    mensagensProcessadas.clear();
    console.log('🧹 Cache de mensagens limpo');
}, TEMPO_LIMPEFA_MS);

// ===== SERVIDOR WEB =====
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    const url = req.url;

    if (url === '/') {
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${STORE_NAME} - Bot WhatsApp</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 50px; 
                        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                        color: white;
                        min-height: 100vh;
                        margin: 0;
                    }
                    .status { 
                        padding: 20px; 
                        border-radius: 15px; 
                        margin: 20px auto;
                        font-size: 20px;
                        max-width: 500px;
                        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    }
                    .online { background: linear-gradient(135deg, #4CAF50, #45a049); }
                    .offline { background: linear-gradient(135deg, #f44336, #da190b); }
                    h1 { color: #00d9ff; text-shadow: 0 0 10px rgba(0,217,255,0.5); }
                    .btn {
                        background: linear-gradient(135deg, #00d9ff, #0099cc);
                        color: #1a1a2e;
                        padding: 20px 40px;
                        text-decoration: none;
                        border-radius: 30px;
                        font-weight: bold;
                        font-size: 18px;
                        display: inline-block;
                        margin: 20px;
                        box-shadow: 0 4px 15px rgba(0,217,255,0.4);
                    }
                    .info {
                        background: rgba(255,255,255,0.1);
                        padding: 20px;
                        border-radius: 15px;
                        margin: 20px auto;
                        max-width: 600px;
                    }
                </style>
            </head>
            <body>
                <h1>🎮 ${STORE_NAME} Bot</h1>
                <div class="status ${botConectado ? 'online' : 'offline'}">
                    ${botConectado ? '✅ Bot Conectado e Online!' : '⏳ Aguardando QR Code...'}
                </div>
                ${!botConectado ? `<a href="/qr" class="btn">📱 Ver QR Code</a>` : '<div class="btn" style="background: #4CAF50;">🚀 Bot Online!</div>'}
                <div class="info">
                    <p><strong>🤖 Bot:</strong> +${BOT_NUMBER}</p>
                    <p><strong>👑 Admin:</strong> +${ADMIN_NUMBER}</p>
                </div>
            </body>
            </html>
        `);
    }
    else if (url === '/qr') {
        if (botConectado) {
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Conectado - ${STORE_NAME}</title>
                    <style>
                        body { font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white; }
                        .success { background: #4CAF50; padding: 40px; border-radius: 20px; margin: 50px auto; max-width: 500px; }
                    </style>
                </head>
                <body>
                    <div class="success">
                        <h1>✅ Bot Já Conectado!</h1>
                        <p>O bot está online.</p>
                    </div>
                </body>
                </html>
            `);
        } else if (qrCodeDataURL) {
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>QR Code - ${STORE_NAME}</title>
                    <meta http-equiv="refresh" content="5">
                    <style>
                        body { 
                            font-family: Arial; 
                            text-align: center; 
                            padding: 20px; 
                            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                            color: white;
                            min-height: 100vh;
                            margin: 0;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                        }
                        .qr-container {
                            background: white;
                            padding: 30px;
                            border-radius: 25px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                            margin: 20px;
                        }
                        .qr-container img { width: 400px; max-width: 90vw; }
                        .info {
                            background: rgba(255,255,255,0.1);
                            padding: 25px;
                            border-radius: 15px;
                            margin: 30px auto;
                            max-width: 500px;
                        }
                        .atualizando {
                            color: #ffd700;
                            animation: pulse 1.5s infinite;
                            font-weight: bold;
                        }
                        @keyframes pulse {
                            0%, 100% { opacity: 1; }
                            50% { opacity: 0.7; }
                        }
                    </style>
                </head>
                <body>
                    <h1>🎮 ${STORE_NAME}</h1>
                    <h2>📱 Escaneie o QR Code</h2>
                    <div class="qr-container">
                        <img src="${qrCodeDataURL}" alt="QR Code">
                    </div>
                    <div class="info">
                        <p class="atualizando">🔄 Atualizando automaticamente...</p>
                        <p>1. Abra o WhatsApp no celular</p>
                        <p>2. Configurações → WhatsApp Web</p>
                        <p>3. Aponte a câmera para o QR Code</p>
                    </div>
                </body>
                </html>
            `);
        } else {
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Gerando - ${STORE_NAME}</title>
                    <meta http-equiv="refresh" content="3">
                    <style>
                        body { font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white; }
                        .loading { font-size: 28px; animation: pulse 1s infinite; }
                        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                    </style>
                </head>
                <body>
                    <h1>⏳ Gerando QR Code...</h1>
                    <p class="loading">Aguarde...</p>
                </body>
                </html>
            `);
        }
    }
    else if (url === '/api/status') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            conectado: botConectado,
            numero: botConectado ? BOT_NUMBER : null,
            temQR: !!qrCodeDataURL,
            timestamp: new Date().toISOString()
        }));
    }
    else if (url === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok', bot: botConectado }));
    }
    else {
        res.writeHead(302, { 'Location': '/' });
        res.end();
    }
});

// INICIA SERVIDOR PRIMEIRO
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor web rodando na porta ${PORT}`);
    console.log(`📱 QR Code disponível em: http://localhost:${PORT}/qr`);
});

// Função para atualizar QR Code
async function atualizarQRCode(qr) {
    try {
        const QRCode = require('qrcode');
        qrCodeDataURL = await QRCode.toDataURL(qr, {
            width: 500,
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' }
        });
        console.log('📱 QR Code atualizado na web!');
        qrcode.generate(qr, { small: true });
    } catch (err) {
        console.error('Erro ao gerar QR Code:', err);
    }
}

// Função para verificar se é admin (CORRIGIDA)
function verificarAdmin(sender) {
    // Remove @s.whatsapp.net e @g.us e qualquer sufixo após :
    const numeroLimpo = sender
        .replace('@s.whatsapp.net', '')
        .replace('@g.us', '')
        .split(':')[0]; // Remove o :1 ou :2 que o WhatsApp adiciona
    
    console.log('🔍 DEBUG - Sender original:', sender);
    console.log('🔍 DEBUG - Número limpo:', numeroLimpo);
    console.log('🔍 DEBUG - ADMIN_NUMBER:', ADMIN_NUMBER);
    console.log('🔍 DEBUG - Comparação:', numeroLimpo === ADMIN_NUMBER);
    
    return numeroLimpo === ADMIN_NUMBER;
}

// Menus
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

_Digite o número da opção desejada_`;
}

function getMenuTesteExpirado(nome) {
    return `😢 *${STORE_NAME} - Teste Expirado*

Ei ${nome}, seu teste grátis acabou!

Quer continuar jogando? 🎮

*Escolha uma opção:*

1️⃣ *Comprar Key* 💰
   • 7 dias: R$ 10
   • 1 mês: R$ 25
   • Lifetime: R$ 80

2️⃣ *Falar com Admin* 👑

0️⃣ *Falar com Atendente* 💬

_Digite o número da opção desejada_`;
}

function getMenuAdmin() {
    return `🔧 *PAINEL ADMIN - ${STORE_NAME}*

*Escolha uma opção:*

1️⃣ *Adicionar Conta* ➕
2️⃣ *Gerar Key* 🔑
3️⃣ *Gerar Key Teste* 🎁
4️⃣ *Importar Contas (TXT)* 📄
5️⃣ *Estatísticas* 📊
6️⃣ *Listar Jogos* 📋
7️⃣ *Broadcast* 📢
8️⃣ *Entrar em Grupo* 👥

0️⃣ *Voltar ao Menu*

_Digite o número da opção_`;
}

// Conectar ao WhatsApp
async function connectToWhatsApp() {
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, delay, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = await import('@whiskeysockets/baileys');
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    console.log(`📱 Usando Baileys v${version.join('.')}, Latest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        browser: ['NyuxStore Bot', 'Chrome', '1.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        keepAliveIntervalMs: 30000,
        shouldIgnoreJid: jid => false,
        // Configurações para evitar duplicatas
        msgRetryCounterMap: {},
        defaultQueryTimeoutMs: undefined,
        syncFullHistory: false
    });

    sockGlobal = sock;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 Novo QR Code recebido!');
            await atualizarQRCode(qr);
        }
        
        if (connection === 'close') {
            botConectado = false;
            qrCodeDataURL = null;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexão fechada. Reconectando:', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            botConectado = true;
            qrCodeDataURL = null;
            console.log('✅ Bot conectado ao WhatsApp!');
            console.log('📱 Número:', sock.user.id.split(':')[0]);
            console.log('🤖 Nome:', sock.user.name);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Processar mensagens com controle de duplicatas
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        
        // Ignora mensagens do próprio bot
        if (!msg.message || msg.key.fromMe) return;

        // Cria ID único da mensagem para evitar duplicatas
        const msgId = msg.key.id;
        const participant = msg.key.participant || msg.key.remoteJid;
        const uniqueId = `${msgId}_${participant}`;
        
        // Verifica se já processou esta mensagem
        if (mensagensProcessadas.has(uniqueId)) {
            console.log('🔄 Mensagem duplicada ignorada:', msgId);
            return;
        }
        
        // Marca como processada
        mensagensProcessadas.add(uniqueId);
        
        // Limita tamanho do cache
        if (mensagensProcessadas.size > 1000) {
            const iterator = mensagensProcessadas.values();
            mensagensProcessadas.delete(iterator.next().value);
        }

        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        const pushName = msg.pushName || 'Cliente';
        
        // Extrai texto da mensagem
        let text = '';
        let isMentioned = false;
        
        if (msg.message.conversation) {
            text = msg.message.conversation;
        } else if (msg.message.extendedTextMessage) {
            text = msg.message.extendedTextMessage.text;
            if (msg.message.extendedTextMessage.contextInfo?.mentionedJid) {
                const mentioned = msg.message.extendedTextMessage.contextInfo.mentionedJid;
                isMentioned = mentioned.includes(sock.user.id);
            }
        } else if (msg.message.buttonsResponseMessage) {
            text = msg.message.buttonsResponseMessage.selectedButtonId;
        } else if (msg.message.listResponseMessage) {
            text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        } else if (msg.message.documentMessage) {
            text = '[documento]';
        }

        text = text.toLowerCase().trim();
        
        console.log(`\n📩 Nova mensagem de ${pushName} (${sender}): "${text}"`);
        
        // No grupo, só responde se mencionado ou com !
        if (isGroup) {
            const isCommand = text.startsWith('!');
            if (!isMentioned && !isCommand) return;
            if (isCommand) text = text.substring(1).trim();
        }

        // Verifica admin usando função corrigida
        const isAdmin = verificarAdmin(sender);
        const perfil = db.getPerfil(sender);
        const testeExpirado = perfil.usouTeste && !perfil.temAcesso;
        const userState = userStates.get(sender) || { step: 'menu' };

        try {
            // COMANDO ADMIN - COM LOGS DETALHADOS
            if (text === 'admin' || text === 'adm') {
                console.log('🔑 Tentativa de acesso admin');
                console.log('🔑 isAdmin:', isAdmin);
                
                if (isAdmin) {
                    console.log('✅ Admin autorizado!');
                    userStates.set(sender, { step: 'admin_menu' });
                    await sock.sendMessage(sender, { text: getMenuAdmin() });
                } else {
                    console.log('❌ Acesso negado para:', sender);
                    await sock.sendMessage(sender, { 
                        text: '⛔ *Acesso Negado*\n\nVocê não tem permissão para acessar o painel admin.\n\nSe você é o dono, verifique se o número está correto no código.' 
                    });
                }
                return;
            }

            // COMANDOS DE GRUPO
            if (isGroup) {
                if (text === 'menu' || text === 'ajuda') {
                    await sock.sendMessage(sender, {
                        text: `🎮 *${STORE_NAME}* - Comandos:\n\n• !menu - Este menu\n• !jogos - Lista de jogos\n• !precos - Preços\n• !comprar - Como comprar\n• !teste - Teste grátis (PV)\n\n💬 Me chame no privado!`
                    });
                    return;
                }
                if (text === 'jogos') {
                    const jogos = db.getJogosDisponiveisPorCategoria();
                    let msg = '📋 *Jogos:*\n\n';
                    let total = 0;
                    for (const [cat, lista] of Object.entries(jogos).slice(0, 3)) {
                        msg += `${cat}: ${lista.length} jogos\n`;
                        total += lista.length;
                    }
                    msg += `\n🎮 Total: ${total} jogos\n\n💬 Chame no PV: +${BOT_NUMBER}`;
                    await sock.sendMessage(sender, { text: msg });
                    return;
                }
                if (text === 'precos') {
                    await sock.sendMessage(sender, {
                        text: `💰 *Preços:*\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n📱 +${BOT_NUMBER}`
                    });
                    return;
                }
                if (text === 'comprar' || text === 'teste') {
                    await sock.sendMessage(sender, {
                        text: `👋 ${pushName}, me chame no privado!\n\n📱 wa.me/${BOT_NUMBER}\n\nPara usar o teste grátis!`
                    });
                    return;
                }
            }

            // MENU PRINCIPAL
            if (userState.step === 'menu') {
                if (testeExpirado && !isAdmin) {
                    if (text === '1') {
                        await sock.sendMessage(sender, { text: `💰 Preços:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 +${ADMIN_NUMBER}` });
                    } else if (text === '2') {
                        await sock.sendMessage(sender, { text: '👑 Chamando admin...' });
                        await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                            text: `🚨 *CLIENTE QUER COMPRAR!*\n\n${pushName}\n${sender.replace('@s.whatsapp.net', '').split(':')[0]}\nStatus: Teste expirado!`
                        });
                    } else {
                        await sock.sendMessage(sender, { text: getMenuTesteExpirado(pushName) });
                    }
                    return;
                }

                if (text === '1') {
                    await sock.sendMessage(sender, { text: `💰 Preços:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 +${ADMIN_NUMBER}` });
                } else if (text === '2') {
                    userStates.set(sender, { step: 'resgatar_key' });
                    await sock.sendMessage(sender, { text: '🎁 Digite sua key (NYUX-XXXX-XXXX):' });
                } else if (text === '3') {
                    if (!db.verificarAcesso(sender)) {
                        await sock.sendMessage(sender, { text: '❌ Precisa de key! Digite 2 ou 6' });
                        return;
                    }
                    const jogos = db.getJogosDisponiveisPorCategoria();
                    let msg = '🎮 *Jogos:*\n\n';
                    for (const [cat, lista] of Object.entries(jogos)) {
                        msg += `${cat}\n`;
                        lista.slice(0, 5).forEach((j, i) => msg += `${i + 1}. ${j.jogo}\n`);
                        if (lista.length > 5) msg += `...e mais ${lista.length - 5}\n`;
                        msg += '\n';
                    }
                    msg += '🔍 Digite o nome do jogo:';
                    userStates.set(sender, { step: 'buscar_jogo' });
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '4') {
                    if (!db.verificarAcesso(sender)) {
                        await sock.sendMessage(sender, { text: '❌ Precisa de key! Digite 2 ou 6' });
                        return;
                    }
                    const jogos = db.getJogosDisponiveisPorCategoria();
                    let msg = '📋 *Lista:*\n\n';
                    let total = 0;
                    for (const [cat, lista] of Object.entries(jogos)) {
                        msg += `${cat} (${lista.length})\n`;
                        lista.forEach((j, i) => msg += `  ${i + 1}. ${j.jogo}\n`);
                        total += lista.length;
                    }
                    msg += `\n🎮 Total: ${total}`;
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '5') {
                    const p = db.getPerfil(sender);
                    const numLimpo = sender.replace('@s.whatsapp.net', '').split(':')[0];
                    let msg = `👤 *Perfil*\n📱 ${numLimpo}\n⏱️ ${p.temAcesso ? '✅' : '❌'}\n🎮 Jogos: ${p.totalResgatados}`;
                    if (p.keyInfo) msg += `\n🔑 ${p.keyInfo.key}\n📅 ${p.keyInfo.expira}`;
                    if (p.usouTeste && !p.temAcesso) msg += `\n\n😢 Teste expirou!`;
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '6') {
                    userStates.set(sender, { step: 'resgatar_key_teste' });
                    await sock.sendMessage(sender, { text: '🎉 *Teste Grátis*\n\n1️⃣ 1 hora\n2️⃣ 2 horas\n3️⃣ 6 horas\n\n⚠️ Só 1 por pessoa!\n\nDigite:' });
                } else if (text === '0') {
                    await sock.sendMessage(sender, { text: '💬 Aguarde...' });
                    await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { 
                        text: `📩 ${pushName}\n${sender.replace('@s.whatsapp.net', '').split(':')[0]}` 
                    });
                } else {
                    await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                }
            }
            // RESGATAR KEY
            else if (userState.step === 'resgatar_key') {
                const key = text.toUpperCase().replace(/\s/g, '');
                const r = db.resgatarKey(key, sender, pushName);
                if (r.sucesso) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { text: `✅ *Key Ativada!*\n\n🎆 ${r.plano}\n📅 ${r.expira}` });
                } else {
                    await sock.sendMessage(sender, { text: `❌ ${r.erro}` });
                }
            }
            // TESTE GRÁTIS
            else if (userState.step === 'resgatar_key_teste') {
                let dur, hrs;
                if (text === '1') { dur = '1 hora'; hrs = 1; }
                else if (text === '2') { dur = '2 horas'; hrs = 2; }
                else if (text === '3') { dur = '6 horas'; hrs = 6; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Digite 1, 2 ou 3:' });
                    return;
                }
                
                if (db.verificarTesteUsado(sender)) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { text: '❌ Já usou teste!\n\nCompre:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80' });
                    return;
                }
                
                const key = `TESTE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                const r = db.criarKeyTeste(key, dur, hrs, sender, pushName);
                
                if (r.sucesso) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { text: `🎉 *Teste Ativado!*\n\n🔑 ${key}\n⏱️ ${dur}\n📅 ${r.expira}\n\n✅ Acesso liberado!` });
                }
            }
            // BUSCAR JOGO
            else if (userState.step === 'buscar_jogo') {
                const conta = db.buscarConta(text);
                if (conta) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, {
                        text: `🎮 *${conta.jogo}*\n📂 ${conta.categoria}\n\n👤 ${conta.login}\n🔒 ${conta.senha}\n\n⚠️ Modo Offline!\n🔒 Não altere a senha!`
                    });
                } else {
                    await sock.sendMessage(sender, { text: `❌ "${text}" não encontrado` });
                }
            }
            // MENU ADMIN
            else if (userState.step === 'admin_menu' && isAdmin) {
                if (text === '1') {
                    userStates.set(sender, { step: 'admin_add_nome', tempConta: {} });
                    await sock.sendMessage(sender, { text: '➕ Nome do jogo:' });
                } else if (text === '2') {
                    userStates.set(sender, { step: 'admin_gerar_key' });
                    await sock.sendMessage(sender, { text: '🔑 Duração:\n1️⃣ 7 dias\n2️⃣ 1 mês\n3️⃣ Lifetime' });
                } else if (text === '3') {
                    userStates.set(sender, { step: 'admin_gerar_teste' });
                    await sock.sendMessage(sender, { text: '🎁 Teste:\n1️⃣ 1h\n2️⃣ 2h\n3️⃣ 6h' });
                } else if (text === '4') {
                    userStates.set(sender, { step: 'admin_importar' });
                    await sock.sendMessage(sender, { text: '📄 Envie .txt:' });
                } else if (text === '5') {
                    const s = db.getEstatisticas();
                    await sock.sendMessage(sender, { text: `📊 Estatísticas:\n🎮 ${s.totalJogos} jogos\n✅ ${s.disponiveis} disponíveis\n🔑 ${s.keysAtivas} keys\n👥 ${s.totalClientes} clientes` });
                } else if (text === '6') {
                    const jogos = db.getTodosJogosDisponiveis();
                    let msg = '📋 Jogos:\n\n';
                    jogos.forEach(j => msg += `• ${j.jogo}\n`);
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '7') {
                    userStates.set(sender, { step: 'admin_broadcast' });
                    await sock.sendMessage(sender, { text: '📢 Digite a mensagem:' });
                } else if (text === '8') {
                    await sock.sendMessage(sender, {
                        text: `👥 *Entrar em Grupo*\n\n1️⃣ Adicione +${BOT_NUMBER} no grupo\n2️⃣ Dê permissão de ADMIN\n3️⃣ Digite !menu no grupo\n\n⚠️ O bot só responde comandos com ! no grupo`
                    });
                } else if (text === '0' || text === 'menu') {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                } else {
                    await sock.sendMessage(sender, { text: getMenuAdmin() });
                }
            }
            // ADMIN: ADICIONAR CONTA
            else if (userState.step === 'admin_add_nome' && isAdmin) {
                const temp = userState.tempConta || {};
                temp.jogo = text;
                userStates.set(sender, { step: 'admin_add_cat', tempConta: temp });
                
                const cats = ['🗡️ Assassin\'s Creed', '🔫 Call of Duty', '🧟 Resident Evil', '⚽ Esportes', '🏎️ Corrida', '🚗 Rockstar Games', '🦸 Super-Heróis', '⚔️ Soulslike', '🐺 CD Projekt Red', '🚜 Simuladores', '👻 Terror', '🎲 RPG', '🥊 Luta', '🕵️ Stealth', '🧠 Estratégia', '🌲 Survival', '🍄 Nintendo', '💙 Sega', '💣 Guerra', '🎮 Ação/Aventura'];
                let msg = '➕ Escolha categoria:\n\n';
                cats.forEach((c, i) => msg += `${i + 1}. ${c}\n`);
                await sock.sendMessage(sender, { text: msg });
            }
            else if (userState.step === 'admin_add_cat' && isAdmin) {
                const cats = ['🗡️ Assassin\'s Creed', '🔫 Call of Duty', '🧟 Resident Evil', '⚽ Esportes', '🏎️ Corrida', '🚗 Rockstar Games', '🦸 Super-Heróis', '⚔️ Soulslike', '🐺 CD Projekt Red', '🚜 Simuladores', '👻 Terror', '🎲 RPG', '🥊 Luta', '🕵️ Stealth', '🧠 Estratégia', '🌲 Survival', '🍄 Nintendo', '💙 Sega', '💣 Guerra', '🎮 Ação/Aventura'];
                const escolha = parseInt(text) - 1;
                if (escolha >= 0 && escolha < cats.length) {
                    const temp = userState.tempConta || {};
                    temp.categoria = cats[escolha];
                    userStates.set(sender, { step: 'admin_add_login', tempConta: temp });
                    await sock.sendMessage(sender, { text: '➕ Digite o *LOGIN*:' });
                } else {
                    await sock.sendMessage(sender, { text: '❌ Digite 1-20:' });
                }
            }
            else if (userState.step === 'admin_add_login' && isAdmin) {
                const temp = userState.tempConta || {};
                temp.login = text;
                userStates.set(sender, { step: 'admin_add_senha', tempConta: temp });
                await sock.sendMessage(sender, { text: '➕ Digite a *SENHA*:' });
            }
            else if (userState.step === 'admin_add_senha' && isAdmin) {
                const temp = userState.tempConta || {};
                temp.senha = text;
                db.addConta(temp.jogo, temp.categoria, temp.login, temp.senha);
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, {
                    text: `✅ *Conta adicionada!*\n\n🎮 ${temp.jogo}\n📂 ${temp.categoria}\n👤 ${temp.login}`
                });
            }
            // ADMIN: GERAR KEYS
            else if (userState.step === 'admin_gerar_key' && isAdmin) {
                let duracao, dias;
                if (text === '1') { duracao = '7 dias'; dias = 7; }
                else if (text === '2') { duracao = '1 mês'; dias = 30; }
                else if (text === '3') { duracao = 'Lifetime'; dias = 99999; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Digite 1, 2 ou 3:' });
                    return;
                }
                const key = `NYUX-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
                db.criarKey(key, duracao, dias);
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, {
                    text: `🔑 *Key Gerada!*\n\n${key}\n⏱️ ${duracao}\n\nCopie e envie!`
                });
            }
            else if (userState.step === 'admin_gerar_teste' && isAdmin) {
                let duracao, horas;
                if (text === '1') { duracao = '1 hora'; horas = 1; }
                else if (text === '2') { duracao = '2 horas'; horas = 2; }
                else if (text === '3') { duracao = '6 horas'; horas = 6; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Digite 1, 2 ou 3:' });
                    return;
                }
                const key = `TESTE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                db.criarKey(key, duracao, horas, true);
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, {
                    text: `🎁 *Key Teste!*\n\n${key}\n⏱️ ${duracao}\n\nEnvie para o cliente!`
                });
            }
            // ADMIN: IMPORTAR
            else if (userState.step === 'admin_importar' && isAdmin) {
                if (msg.message.documentMessage) {
                    await sock.sendMessage(sender, { text: '⏳ Processando...' });
                    try {
                        const stream = await sock.downloadContentFromMessage(msg.message.documentMessage, 'document');
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }
                        const texto = buffer.toString('utf-8');
                        const resultado = db.importarTXT(texto);
                        userStates.set(sender, { step: 'admin_menu' });
                        await sock.sendMessage(sender, {
                            text: `✅ *Importado!*\n\n📊 ${resultado.adicionadas} contas\n🎮 ${resultado.jogosUnicos} jogos\n📂 ${resultado.categorias} categorias`
                        });
                    } catch (err) {
                        await sock.sendMessage(sender, { text: '❌ Erro no arquivo.' });
                    }
                } else {
                    await sock.sendMessage(sender, { text: '📄 Envie o .txt:' });
                }
            }
            // ADMIN: BROADCAST
            else if (userState.step === 'admin_broadcast' && isAdmin) {
                const clientes = db.getTodosClientes();
                let enviados = 0;
                await sock.sendMessage(sender, { text: `📢 Enviando para ${clientes.length} clientes...` });
                for (const cliente of clientes) {
                    try {
                        await sock.sendMessage(cliente.numero, {
                            text: `📢 *NyuxStore*\n\n${text}`
                        });
                        enviados++;
                        await delay(1000);
                    } catch (e) {
                        console.log('Erro:', cliente.numero);
                    }
                }
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, { text: `✅ Enviado: ${enviados}/${clientes.length}` });
            }

            // MENU
            if (text === 'menu' || text === 'voltar') {
                userStates.set(sender, { step: 'menu' });
                const perfilAtual = db.getPerfil(sender);
                if (perfilAtual.usouTeste && !perfilAtual.temAcesso && !isAdmin) {
                    await sock.sendMessage(sender, { text: getMenuTesteExpirado(pushName) });
                } else {
                    await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                }
            }

        } catch (error) {
            console.error('❌ Erro ao processar mensagem:', error);
        }
    });

    return sock;
}

// Iniciar
console.log('🚀 Iniciando NyuxStore...');
console.log('👑 Admin configurado:', ADMIN_NUMBER);
console.log('🤖 Bot:', BOT_NUMBER);
connectToWhatsApp();
