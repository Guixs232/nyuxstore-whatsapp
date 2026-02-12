const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const http = require('http');
const Database = require('./database');
const moment = require('moment');

// Configurações
const BOT_NUMBER = '556183040115';
const ADMIN_NUMBER = '5518997972598';
const STORE_NAME = 'NyuxStore';
const PORT = process.env.PORT || 3000;

const db = new Database();

// Estados dos usuários
const userStates = new Map();

// QR Code atual (para mostrar na web)
let qrCodeAtual = null;
let botConectado = false;
let sockGlobal = null;

// ===== SERVIDOR WEB PARA QR CODE =====
const server = http.createServer((req, res) => {
    const url = req.url;
    
    // Rota principal - status do bot
    if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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
                        background: #1a1a2e;
                        color: white;
                    }
                    .status { 
                        padding: 20px; 
                        border-radius: 10px; 
                        margin: 20px;
                        font-size: 18px;
                    }
                    .online { background: #4CAF50; }
                    .offline { background: #f44336; }
                    h1 { color: #00d9ff; }
                    .btn {
                        background: #00d9ff;
                        color: #1a1a2e;
                        padding: 15px 30px;
                        text-decoration: none;
                        border-radius: 25px;
                        font-weight: bold;
                        display: inline-block;
                        margin: 10px;
                    }
                </style>
            </head>
            <body>
                <h1>🎮 ${STORE_NAME} Bot</h1>
                <div class="status ${botConectado ? 'online' : 'offline'}">
                    ${botConectado ? '✅ Bot Conectado' : '⏳ Aguardando QR Code...'}
                </div>
                ${!botConectado ? `<a href="/qr" class="btn">📱 Ver QR Code</a>` : ''}
                <p>Bot número: <strong>+${BOT_NUMBER}</strong></p>
            </body>
            </html>
        `);
    }
    
    // Rota do QR Code
    else if (url === '/qr') {
        if (botConectado) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>QR Code - ${STORE_NAME}</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            text-align: center; 
                            padding: 50px; 
                            background: #1a1a2e;
                            color: white;
                        }
                        .success { 
                            background: #4CAF50; 
                            padding: 20px; 
                            border-radius: 10px;
                        }
                    </style>
                </head>
                <body>
                    <div class="success">
                        <h1>✅ Bot Já Conectado!</h1>
                        <p>O bot já está online e funcionando.</p>
                    </div>
                </body>
                </html>
            `);
        } else if (qrCodeAtual) {
            const QRCode = require('qrcode');
            QRCode.toDataURL(qrCodeAtual, { width: 400, margin: 2 }, (err, url) => {
                if (err) {
                    res.writeHead(500);
                    res.end('Erro ao gerar QR Code');
                    return;
                }
                
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>QR Code - ${STORE_NAME}</title>
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <meta http-equiv="refresh" content="10">
                        <style>
                            body { 
                                font-family: Arial, sans-serif; 
                                text-align: center; 
                                padding: 20px; 
                                background: #1a1a2e;
                                color: white;
                            }
                            h1 { color: #00d9ff; }
                            .qr-container {
                                background: white;
                                padding: 20px;
                                border-radius: 20px;
                                display: inline-block;
                                margin: 20px;
                            }
                            .qr-container img {
                                max-width: 100%;
                                height: auto;
                            }
                            .info {
                                background: #16213e;
                                padding: 15px;
                                border-radius: 10px;
                                margin: 20px auto;
                                max-width: 500px;
                            }
                            .atualizando {
                                color: #ffd700;
                                animation: pulse 1s infinite;
                            }
                            @keyframes pulse {
                                0%, 100% { opacity: 1; }
                                50% { opacity: 0.5; }
                            }
                        </style>
                    </head>
                    <body>
                        <h1>🎮 ${STORE_NAME}</h1>
                        <h2>📱 Escaneie o QR Code</h2>
                        <div class="qr-container">
                            <img src="${url}" alt="QR Code WhatsApp">
                        </div>
                        <div class="info">
                            <p class="atualizando">🔄 Atualizando automaticamente...</p>
                            <p>1. Abra o WhatsApp no seu celular</p>
                            <p>2. Vá em <strong>Configurações → WhatsApp Web</strong></p>
                            <p>3. Aponte a câmera para o QR Code</p>
                        </div>
                        <p>Esta página atualiza a cada 10 segundos</p>
                    </body>
                    </html>
                `);
            });
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Aguardando - ${STORE_NAME}</title>
                    <meta http-equiv="refresh" content="5">
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            text-align: center; 
                            padding: 50px; 
                            background: #1a1a2e;
                            color: white;
                        }
                        .loading {
                            font-size: 24px;
                            animation: pulse 1s infinite;
                        }
                    </style>
                </head>
                <body>
                    <h1>⏳ Gerando QR Code...</h1>
                    <p class="loading">Aguarde alguns segundos...</p>
                    <p>Esta página atualiza automaticamente</p>
                </body>
                </html>
            `);
        }
    }
    
    // API para status (JSON)
    else if (url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            conectado: botConectado,
            numero: botConectado ? BOT_NUMBER : null,
            timestamp: new Date().toISOString()
        }));
    }
    
    // Rota não encontrada
    else {
        res.writeHead(404);
        res.end('Página não encontrada');
    }
});

server.listen(PORT, () => {
    console.log(`🌐 Servidor web rodando na porta ${PORT}`);
    console.log(`🔗 QR Code disponível em: http://localhost:${PORT}/qr`);
});

// Menus (mantidos iguais)
function getMenuPrincipal(nome) {
    return `
🎮 *${STORE_NAME}*

Olá, ${nome}! 👋

*Escolha uma opção:*

1️⃣ *Comprar Key* 💳
2️⃣ *Resgatar Key* 🎁
3️⃣ *Buscar Jogo* 🔍
4️⃣ *Ver Jogos* 📋
5️⃣ *Meu Perfil* 👤
6️⃣ *Key Teste Grátis* 🎉

0️⃣ *Falar com Atendente* 💬

_Digite o número da opção desejada_
`;
}

function getMenuTesteExpirado(nome) {
    return `
😢 *${STORE_NAME} - Teste Expirado*

Ei ${nome}, seu teste grátis acabou!

Quer continuar jogando? 🎮

*Escolha uma opção:*

1️⃣ *Comprar Key* 💳
   • 7 dias: R$ 10
   • 1 mês: R$ 25
   • Lifetime: R$ 80

2️⃣ *Falar com Admin* 👑
   Chamar no privado para comprar

0️⃣ *Falar com Atendente* 💬

_Digite o número da opção desejada_
`;
}

function getMenuAdmin() {
    return `
🔧 *PAINEL ADMIN - ${STORE_NAME}*

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

_Digite o número da opção_
`;
}

// Conectar ao WhatsApp
async function connectToWhatsApp() {
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, delay, fetchLatestBaileysVersion, makeInMemoryStore } = await import('@whiskeysockets/baileys');
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    console.log(`📱 Usando Baileys v${version.join('.')}, Latest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ['NyuxStore Bot', 'Chrome', '1.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        keepAliveIntervalMs: 30000,
        shouldIgnoreJid: jid => false,
        // Configurações para grupos
        getMessage: async () => {
            return {
                conversation: 'Olá! Sou o bot da NyuxStore. Envie !menu para ver opções.'
            };
        }
    });

    sockGlobal = sock;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 Novo QR Code gerado!');
            qrCodeAtual = qr;
            // Também mostra no terminal como backup
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            botConectado = false;
            qrCodeAtual = null;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexão fechada. Reconectando:', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            botConectado = true;
            qrCodeAtual = null;
            console.log('✅ Bot conectado ao WhatsApp!');
            console.log('📱 Número:', sock.user.id.split(':')[0]);
            console.log('🤖 Nome:', sock.user.name);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Processar mensagens (privado e grupo)
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        
        if (!msg.message || msg.key.fromMe) return;

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
            // Verifica se o bot foi mencionado
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
        
        // No grupo, só responde se:
        // 1. For mencionado (@NyuxStore)
        // 2. Mensagem começar com !
        // 3. For mensagem privada no grupo (reply)
        if (isGroup) {
            const isCommand = text.startsWith('!');
            if (!isMentioned && !isCommand) return;
            
            // Remove o ! do início se existir
            if (isCommand) {
                text = text.substring(1).trim();
            }
        }

        // Verifica se é admin
        const numeroLimpo = sender.replace('@s.whatsapp.net', '').replace('@g.us', '');
        const isAdmin = numeroLimpo === ADMIN_NUMBER;
        
        // Debug logs
        if (text === 'admin' || text === 'debug') {
            console.log('🔍 DEBUG - Sender:', sender);
            console.log('🔍 DEBUG - Número limpo:', numeroLimpo);
            console.log('🔍 DEBUG - isAdmin:', isAdmin);
            console.log('🔍 DEBUG - isGroup:', isGroup);
        }

        const perfil = db.getPerfil(sender);
        const testeExpirado = perfil.usouTeste && !perfil.temAcesso;
        const userState = userStates.get(sender) || { step: 'menu' };

        try {
            // ===== COMANDOS DE GRUPO =====
            if (isGroup) {
                // Comandos básicos no grupo
                if (text === 'menu' || text === 'ajuda') {
                    await sock.sendMessage(sender, {
                        text: `🎮 *${STORE_NAME}* - Comandos no Grupo:\n\n• *!menu* - Ver este menu\n• *!jogos* - Lista de jogos\n• *!precos* - Preços das keys\n• *!teste* - Key teste grátis\n• *!comprar* - Como comprar\n• *!suporte* - Falar com admin\n\n💡 *Dica:* Me chame no privado para acessar todos os jogos!`
                    });
                    return;
                }
                
                if (text === 'jogos') {
                    const jogosPorCategoria = db.getJogosDisponiveisPorCategoria();
                    let msg = '📋 *Jogos Disponíveis:*\n\n';
                    
                    for (const [categoria, jogos] of Object.entries(jogosPorCategoria).slice(0, 5)) {
                        msg += `${categoria}:\n`;
                        jogos.slice(0, 3).forEach((jogo, index) => {
                            msg += `  ${index + 1}. ${jogo.jogo}\n`;
                        });
                        if (jogos.length > 3) msg += `  ...e mais ${jogos.length - 3} jogos\n`;
                        msg += '\n';
                    }
                    
                    msg += `\n🎮 Total: ${Object.values(jogosPorCategoria).flat().length} jogos\n\n💬 Chame no privado para ver todos e resgatar!`;
                    await sock.sendMessage(sender, { text: msg });
                    return;
                }
                
                if (text === 'precos') {
                    await sock.sendMessage(sender, {
                        text: `💰 *Preços das Keys:*\n\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💳 Pagamento via Pix, Transferência ou Cartão\n\n📱 Chame no privado: +${BOT_NUMBER}`
                    });
                    return;
                }
                
                if (text === 'comprar' || text === 'suporte') {
                    await sock.sendMessage(sender, {
                        text: `💬 *Falar com Admin:*\n\n📱 WhatsApp: +${ADMIN_NUMBER}\n🤖 Bot: +${BOT_NUMBER}\n\nOu me chame no privado clicando no meu número acima!`
                    });
                    return;
                }
                
                // No grupo, redireciona para privado para outras funções
                if (['1', '2', '3', '4', '5', '6', 'teste', 'gratis'].includes(text)) {
                    await sock.sendMessage(sender, {
                        text: `👋 Ei ${pushName}!\n\nPara acessar *todos os jogos* e usar o teste grátis, me chame no *privado*:\n\n📱 +${BOT_NUMBER}\n\nOu clique aqui: wa.me/${BOT_NUMBER}`,
                        mentions: [sender]
                    });
                    return;
                }
            }

            // ===== COMANDO ADMIN =====
            if (text === 'admin' || text === 'adm') {
                if (isAdmin) {
                    userStates.set(sender, { step: 'admin_menu' });
                    await sock.sendMessage(sender, { text: getMenuAdmin() });
                } else {
                    await sock.sendMessage(sender, { 
                        text: '⛔ *Acesso Negado*\n\nVocê não tem permissão.' 
                    });
                }
                return;
            }

            // ===== MENU PRINCIPAL =====
            if (userState.step === 'menu') {
                // Se teste expirou, mostra menu especial
                if (testeExpirado && !isAdmin) {
                    if (text === '1' || text.includes('comprar')) {
                        await sock.sendMessage(sender, {
                            text: `💳 *Comprar Key*\n\n💰 *Valores:*\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 Chame o admin: +${ADMIN_NUMBER}`
                        });
                    } else if (text === '2' || text.includes('admin')) {
                        await sock.sendMessage(sender, { text: '👑 *Chamando Admin...*' });
                        await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                            text: `🚨 *CLIENTE QUER COMPRAR!*\n\nCliente: ${pushName}\nNúmero: ${numeroLimpo}\nStatus: *Teste expirado!*`
                        });
                        await sock.sendMessage(sender, {
                            text: `✅ *Admin notificado!*\n\nO admin foi avisado e vai te chamar em breve.\n\n👤 +${ADMIN_NUMBER}`
                        });
                    } else if (text === '0') {
                        await sock.sendMessage(sender, { text: '💬 Aguarde...' });
                        await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                            text: `📩 *Atendimento*\n\nCliente: ${pushName}\nNúmero: ${numeroLimpo}`
                        });
                    } else {
                        await sock.sendMessage(sender, { text: getMenuTesteExpirado(pushName) });
                    }
                    return;
                }

                // Menu normal
                if (text === '1' || text.includes('comprar')) {
                    await sock.sendMessage(sender, {
                        text: `💳 *Comprar Key*\n\n💰 *Valores:*\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 Chame o admin: +${ADMIN_NUMBER}`
                    });
                } else if (text === '2' || text.includes('resgatar')) {
                    userStates.set(sender, { step: 'resgatar_key' });
                    await sock.sendMessage(sender, {
                        text: '🎁 *Resgatar Key*\n\nDigite sua key:\nNYUX-XXXX-XXXX\n\n_Ex: NYUX-AB12-CD34_'
                    });
                } else if (text === '3' || text.includes('buscar')) {
                    const temAcesso = db.verificarAcesso(sender);
                    if (!temAcesso) {
                        await sock.sendMessage(sender, {
                            text: '❌ *Acesso Negado*\n\nDigite *2* para resgatar key ou *6* para teste grátis.'
                        });
                        return;
                    }
                    const jogosPorCategoria = db.getJogosDisponiveisPorCategoria();
                    let msg = '🎮 *Jogos Disponíveis*\n\n';
                    for (const [categoria, jogos] of Object.entries(jogosPorCategoria)) {
                        msg += `${categoria}\n`;
                        jogos.forEach((jogo, index) => {
                            msg += `${index + 1}. ${jogo.jogo}\n`;
                        });
                        msg += '\n';
                    }
                    msg += '🔍 *Digite o nome do jogo:*';
                    userStates.set(sender, { step: 'buscar_jogo' });
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '4' || text.includes('jogos')) {
                    const temAcesso = db.verificarAcesso(sender);
                    if (!temAcesso) {
                        await sock.sendMessage(sender, {
                            text: '❌ *Acesso Negado*\n\nDigite *2* para resgatar key ou *6* para teste grátis.'
                        });
                        return;
                    }
                    const jogosPorCategoria = db.getJogosDisponiveisPorCategoria();
                    let msg = '📋 *Lista de Jogos*\n\n';
                    let total = 0;
                    for (const [categoria, jogos] of Object.entries(jogosPorCategoria)) {
                        msg += `${categoria} (${jogos.length})\n`;
                        jogos.forEach((jogo, index) => {
                            msg += `   ${index + 1}. ${jogo.jogo}\n`;
                            total++;
                        });
                        msg += '\n';
                    }
                    msg += `🎮 Total: ${total} jogos\n\n💡 Use opção *3* para buscar`;
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '5' || text.includes('perfil')) {
                    const perfilUser = db.getPerfil(sender);
                    let msg = '👤 *Seu Perfil*\n\n';
                    msg += `📱 ${numeroLimpo}\n`;
                    msg += `⏱️ ${perfilUser.temAcesso ? '✅ Ativo' : '❌ Inativo'}\n`;
                    if (perfilUser.keyInfo) {
                        msg += `🔑 ${perfilUser.keyInfo.key}\n`;
                        msg += `📅 ${perfilUser.keyInfo.expira}\n`;
                    }
                    msg += `\n🎮 Jogos: ${perfilUser.totalResgatados}`;
                    if (perfilUser.usouTeste && !perfilUser.temAcesso) {
                        msg += `\n\n😢 *Teste expirou!*\nDigite *menu* para comprar.`;
                    }
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '6' || text.includes('teste') || text.includes('gratis')) {
                    userStates.set(sender, { step: 'resgatar_key_teste' });
                    await sock.sendMessage(sender, {
                        text: '🎉 *Key Teste Grátis*\n\nEscolha:\n1️⃣ 1 hora\n2️⃣ 2 horas\n3️⃣ 6 horas\n\n⚠️ Só 1 teste por pessoa!\n\nDigite o número:'
                    });
                } else if (text === '0') {
                    await sock.sendMessage(sender, { text: '💬 Aguarde...' });
                    await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                        text: `📩 *Atendimento*\n\nCliente: ${pushName}\nNúmero: ${numeroLimpo}`
                    });
                } else if (['oi', 'ola', 'olá', 'hey'].includes(text)) {
                    await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                } else {
                    await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                }
            }

            // RESGATAR KEY NORMAL
            else if (userState.step === 'resgatar_key') {
                const key = text.toUpperCase().replace(/\s/g, '');
                const resultado = db.resgatarKey(key, sender, pushName);
                if (resultado.sucesso) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, {
                        text: `✅ *Key Resgatada!*\n\n🎆 ${resultado.plano}\n⏱️ ${resultado.duracao}\n📅 ${resultado.expira}\n\n🎮 Aproveite!`
                    });
                } else {
                    await sock.sendMessage(sender, {
                        text: `❌ ${resultado.erro}\n\nTente novamente ou digite *menu*`
                    });
                }
            }

            // RESGATAR KEY TESTE
            else if (userState.step === 'resgatar_key_teste') {
                let duracao, horas;
                if (text === '1') { duracao = '1 hora'; horas = 1; }
                else if (text === '2') { duracao = '2 horas'; horas = 2; }
                else if (text === '3') { duracao = '6 horas'; horas = 6; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Digite 1, 2 ou 3:' });
                    return;
                }
                
                const jaUsouTeste = db.verificarTesteUsado(sender);
                if (jaUsouTeste) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, {
                        text: '❌ *Você já usou seu teste!*\n\nCompre uma key:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 +' + ADMIN_NUMBER
                    });
                    return;
                }
                
                const key = `TESTE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                const resultado = db.criarKeyTeste(key, duracao, horas, sender, pushName);
                
                if (resultado.sucesso) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, {
                        text: `🎉 *Key Teste Gerada!*\n\n🔑 ${key}\n⏱️ ${duracao}\n📅 ${resultado.expira}\n\n✅ Acesso liberado!`
                    });
                }
            }

            // BUSCAR JOGO
            else if (userState.step === 'buscar_jogo') {
                const conta = db.buscarConta(text);
                if (conta) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, {
                        text: `🎮 *Conta Encontrada!*\n\n*${conta.jogo}*\n📂 ${conta.categoria}\n\n👤 *Login:* ${conta.login}\n🔒 *Senha:* ${conta.senha}\n\n⚠️ *Modo Offline na Steam!*\n🔒 Não altere a senha!\n\n✅ Conta compartilhada - use quantas vezes quiser!`
                    });
                } else {
                    await sock.sendMessage(sender, {
                        text: `❌ *"${text}" não encontrado*\n\nDigite *4* para ver a lista.`
                    });
                }
            }

            // MENU ADMIN
            else if (userState.step === 'admin_menu' && isAdmin) {
                if (text === '1') {
                    userStates.set(sender, { step: 'admin_add_conta_nome', tempConta: {} });
                    await sock.sendMessage(sender, { text: '➕ *Adicionar Conta*\n\nDigite o *NOME DO JOGO*:' });
                } else if (text === '2') {
                    userStates.set(sender, { step: 'admin_gerar_key' });
                    await sock.sendMessage(sender, { text: '🔑 *Gerar Key*\n\n1️⃣ 7 dias\n2️⃣ 1 mês\n3️⃣ Lifetime\n\nDigite:' });
                } else if (text === '3') {
                    userStates.set(sender, { step: 'admin_gerar_key_teste' });
                    await sock.sendMessage(sender, { text: '🎁 *Gerar Key Teste*\n\n1️⃣ 1 hora\n2️⃣ 2 horas\n3️⃣ 6 horas\n\nDigite:' });
                } else if (text === '4') {
                    userStates.set(sender, { step: 'admin_importar' });
                    await sock.sendMessage(sender, { text: '📄 Envie o arquivo .txt com as contas:' });
                } else if (text === '5') {
                    const stats = db.getEstatisticas();
                    await sock.sendMessage(sender, {
                        text: `📊 *Estatísticas*\n\n🎮 Jogos: ${stats.totalJogos}\n✅ Disponíveis: ${stats.disponiveis}\n🔑 Keys: ${stats.keysAtivas}\n🎉 Testes: ${stats.keysTeste}\n👥 Clientes: ${stats.totalClientes}`
                    });
                } else if (text === '6') {
                    const jogos = db.getTodosJogosDisponiveis();
                    let msg = '📋 *Jogos:*\n\n';
                    jogos.slice(0, 50).forEach(j => {
                        msg += `• ${j.jogo} (${j.categoria})\n`;
                    });
                    if (jogos.length > 50) msg += `\n...e mais ${jogos.length - 50}`;
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '7') {
                    userStates.set(sender, { step: 'admin_broadcast' });
                    await sock.sendMessage(sender, { text: '📢 *Broadcast*\n\nDigite a mensagem:' });
                } else if (text === '8') {
                    await sock.sendMessage(sender, {
                        text: `👥 *Entrar em Grupo*\n\nPara adicionar o bot em um grupo:\n\n1️⃣ Adicione o número +${BOT_NUMBER} no grupo\n2️⃣ Dê permissão de *ADMIN*\n3️⃣ Digite *!menu* no grupo\n\n⚠️ O bot só responde comandos com *!* no grupo\n(ex: !menu, !jogos, !precos)`
                    });
                } else if (text === '0' || text === 'menu') {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                } else {
                    await sock.sendMessage(sender, { text: getMenuAdmin() });
                }
            }

            // ADMIN: ADICIONAR CONTA
            else if (userState.step === 'admin_add_conta_nome' && isAdmin) {
                const temp = userState.tempConta || {};
                temp.jogo = text;
                userStates.set(sender, { step: 'admin_add_conta_categoria', tempConta: temp });
                
                const cats = ['🗡️ Assassin\'s Creed', '🔫 Call of Duty', '🧟 Resident Evil', '⚽ Esportes', '🏎️ Corrida', '🚗 Rockstar Games', '🦸 Super-Heróis', '⚔️ Soulslike', '🐺 CD Projekt Red', '🚜 Simuladores', '👻 Terror', '🎲 RPG', '🥊 Luta', '🕵️ Stealth', '🧠 Estratégia', '🌲 Survival', '🍄 Nintendo', '💙 Sega', '💣 Guerra', '🎮 Ação/Aventura'];
                let msg = '➕ Escolha categoria:\n\n';
                cats.forEach((c, i) => msg += `${i + 1}. ${c}\n`);
                await sock.sendMessage(sender, { text: msg });
            }

            else if (userState.step === 'admin_add_conta_categoria' && isAdmin) {
                const cats = ['🗡️ Assassin\'s Creed', '🔫 Call of Duty', '🧟 Resident Evil', '⚽ Esportes', '🏎️ Corrida', '🚗 Rockstar Games', '🦸 Super-Heróis', '⚔️ Soulslike', '🐺 CD Projekt Red', '🚜 Simuladores', '👻 Terror', '🎲 RPG', '🥊 Luta', '🕵️ Stealth', '🧠 Estratégia', '🌲 Survival', '🍄 Nintendo', '💙 Sega', '💣 Guerra', '🎮 Ação/Aventura'];
                const escolha = parseInt(text) - 1;
                if (escolha >= 0 && escolha < cats.length) {
                    const temp = userState.tempConta || {};
                    temp.categoria = cats[escolha];
                    userStates.set(sender, { step: 'admin_add_conta_login', tempConta: temp });
                    await sock.sendMessage(sender, { text: '➕ Digite o *LOGIN*:' });
                } else {
                    await sock.sendMessage(sender, { text: '❌ Digite 1-20:' });
                }
            }

            else if (userState.step === 'admin_add_conta_login' && isAdmin) {
                const temp = userState.tempConta || {};
                temp.login = text;
                userStates.set(sender, { step: 'admin_add_conta_senha', tempConta: temp });
                await sock.sendMessage(sender, { text: '➕ Digite a *SENHA*:' });
            }

            else if (userState.step === 'admin_add_conta_senha' && isAdmin) {
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

            else if (userState.step === 'admin_gerar_key_teste' && isAdmin) {
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
                await sock.sendMessage(sender, { text: `📢 Enviando para ${clientes.length}...` });
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
            console.error('Erro:', error);
            await sock.sendMessage(sender, { text: '❌ Erro. Digite *menu*' });
        }
    });

    return sock;
}

// Iniciar
console.log('🚀 Iniciando NyuxStore...');
console.log('👑 Admin:', ADMIN_NUMBER);
console.log('🤖 Bot:', BOT_NUMBER);
connectToWhatsApp();
