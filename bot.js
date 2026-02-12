const pino = require('pino');
const fs = require('fs');
const http = require('http');
const Database = require('./database');
const moment = require('moment');

// Configurações
const BOT_NUMBER = '556183040115';
const ADMIN_NUMBER = '5518997972598';
const STORE_NAME = 'NyuxStore';

const db = new Database();

// Estados dos usuários
const userStates = new Map();

// Menu Principal
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

// Menu quando teste expirou
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

// Menu Admin
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

0️⃣ *Voltar ao Menu*

_Digite o número da opção_
`;
}

// Servidor HTTP para mostrar QR Code
let qrCodeAtual = null;
let qrCodeGerado = false;

const server = http.createServer((req, res) => {
    if (req.url === '/qr' && qrCodeAtual) {
        // Gera página HTML com QR Code
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>NyuxStore - QR Code</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        background: #1a1a2e;
                        color: white;
                        font-family: Arial, sans-serif;
                    }
                    h1 { color: #00d4ff; }
                    .qr-container {
                        background: white;
                        padding: 20px;
                        border-radius: 10px;
                        margin: 20px;
                    }
                    .info {
                        margin-top: 20px;
                        text-align: center;
                        color: #888;
                    }
                </style>
            </head>
            <body>
                <h1>📱 NyuxStore Bot</h1>
                <div class="qr-container">
                    <img src="${qrCodeAtual}" alt="QR Code" width="300" height="300">
                </div>
                <p>Escaneie com seu WhatsApp!</p>
                <div class="info">
                    <p>⏰ Válido por 60 segundos</p>
                    <p>Atualize a página se expirar</p>
                </div>
            </body>
            </html>
        `);
    } else if (req.url === '/qr') {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<h1>Aguardando QR Code...</h1><p>Recarregue em alguns segundos</p>');
    } else {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<h1>NyuxStore Bot Online!</h1><p>Acesse <a href="/qr">/qr</a> para ver o QR Code</p>');
    }
});

// Conectar ao WhatsApp
async function connectToWhatsApp() {
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = await import('@whiskeysockets/baileys');
    
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
        shouldIgnoreJid: jid => false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !qrCodeGerado) {
            qrCodeGerado = true;
            console.log('📱 Gerando QR Code...');
            
            try {
                const QRCode = require('qrcode');
                
                // Gera QR Code como Data URL (base64)
                qrCodeAtual = await QRCode.toDataURL(qr, {
                    width: 400,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
                console.log('✅ QR Code gerado!');
                console.log('');
                console.log('🌐 Acesse: http://localhost:3000/qr');
                console.log('   ou a URL do Railway + /qr');
                console.log('');
                console.log('📱 Ou escaneie o QR Code abaixo:');
                console.log('');
                
                // Também mostra no terminal como fallback
                const QRCodeTerminal = require('qrcode-terminal');
                QRCodeTerminal.generate(qr, { small: false });
                
                console.log('');
                console.log('⏰ QR Code válido por 60 segundos');
                console.log('🔄 Recarregue a página se necessário');
                
                // Limpa após 60 segundos
                setTimeout(() => {
                    qrCodeAtual = null;
                    qrCodeGerado = false;
                    console.log('🗑️ QR Code expirado');
                }, 60000);
                
            } catch (err) {
                console.error('❌ Erro:', err);
            }
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexão fechada. Reconectando:', shouldReconnect);
            qrCodeGerado = false;
            qrCodeAtual = null;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Bot conectado!');
            console.log('📱 Número:', sock.user.id.split(':')[0]);
            qrCodeAtual = null;
            qrCodeGerado = false;
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Processar mensagens
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        const pushName = msg.pushName || 'Cliente';
        
        let text = '';
        if (msg.message.conversation) text = msg.message.conversation;
        else if (msg.message.extendedTextMessage) text = msg.message.extendedTextMessage.text;
        else if (msg.message.buttonsResponseMessage) text = msg.message.buttonsResponseMessage.selectedButtonId;
        else if (msg.message.listResponseMessage) text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        else if (msg.message.documentMessage) text = '[documento]';
        
        text = text.toLowerCase().trim();
        
        const numeroLimpo = sender.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/\D/g, '');
        const isAdmin = numeroLimpo === ADMIN_NUMBER.replace(/\D/g, '');
        
        const perfil = db.getPerfil(sender);
        const testeExpirado = perfil.usouTeste && !perfil.temAcesso;
        
        const userState = userStates.get(sender) || { step: 'menu' };

        try {
            if (!isGroup && text !== '[documento]') {
                const comandosValidos = ['1', '2', '3', '4', '5', '6', '0', 'menu', 'admin', 'voltar', 'oi', 'ola', 'olá', 'hey', 'eai', 'eae'];
                if (!comandosValidos.includes(text) && userState.step === 'menu') {
                    if (testeExpirado && !isAdmin) {
                        await sock.sendMessage(sender, { text: `Olá! 👋\n\n${getMenuTesteExpirado(pushName)}` });
                    } else {
                        await sock.sendMessage(sender, { text: `Olá! 👋\n\n${getMenuPrincipal(pushName)}` });
                    }
                    return;
                }
            }

            if (userState.step === 'menu') {
                if (testeExpirado && !isAdmin) {
                    if (text === '1' || text.includes('comprar')) {
                        await sock.sendMessage(sender, { text: `💳 *Comprar Key*\n\nValores:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 Chame: +${ADMIN_NUMBER}` });
                    } else if (text === '2' || text.includes('admin')) {
                        await sock.sendMessage(sender, { text: `👑 *Chamando Admin...*` });
                        await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { text: `🚨 *CLIENTE QUER COMPRAR!*\n\nNome: ${pushName}\nNúmero: ${numeroLimpo}\nStatus: Teste expirado` });
                        await sock.sendMessage(sender, { text: `✅ *Admin notificado!*\n\nAguarde contato ou chame:\n👤 +${ADMIN_NUMBER}` });
                    } else if (text === '0') {
                        await sock.sendMessage(sender, { text: `💬 *Atendimento*\n\nAguarde ou chame: +${ADMIN_NUMBER}` });
                        await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { text: `📩 *Atendimento*\n\n${pushName} - ${numeroLimpo}` });
                    } else {
                        await sock.sendMessage(sender, { text: getMenuTesteExpirado(pushName) });
                    }
                    return;
                }

                if (text === '1') {
                    await sock.sendMessage(sender, { text: `💳 *Comprar Key*\n\nValores:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 Chame: +${ADMIN_NUMBER}` });
                } else if (text === '2') {
                    userStates.set(sender, { step: 'resgatar_key' });
                    await sock.sendMessage(sender, { text: '🎁 *Resgatar Key*\n\nDigite: NYUX-XXXX-XXXX' });
                } else if (text === '3') {
                    if (!db.verificarAcesso(sender)) {
                        await sock.sendMessage(sender, { text: '❌ *Sem acesso!*\n\nDigite *2* para resgatar key ou *6* para teste.' });
                        return;
                    }
                    const jogos = db.getJogosDisponiveisPorCategoria();
                    let msg = '🎮 *Jogos:*\n\n';
                    for (const [cat, lista] of Object.entries(jogos)) {
                        msg += `${cat}\n`;
                        lista.forEach((j, i) => msg += `${i + 1}. ${j.jogo}\n`);
                        msg += '\n';
                    }
                    msg += '🔍 *Digite o nome do jogo:*';
                    userStates.set(sender, { step: 'buscar_jogo' });
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '4') {
                    if (!db.verificarAcesso(sender)) {
                        await sock.sendMessage(sender, { text: '❌ *Sem acesso!*\n\nDigite *2* ou *6*' });
                        return;
                    }
                    const jogos = db.getJogosDisponiveisPorCategoria();
                    let msg = '📋 *Jogos:*\n\n';
                    let total = 0;
                    for (const [cat, lista] of Object.entries(jogos)) {
                        msg += `${cat} (${lista.length})\n`;
                        lista.forEach((j) => { msg += `• ${j.jogo}\n`; total++; });
                        msg += '\n';
                    }
                    msg += `🎮 Total: ${total}`;
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '5') {
                    const p = db.getPerfil(sender);
                    let msg = `👤 *Perfil*\n\n📱 ${numeroLimpo}\n⏱️ ${p.temAcesso ? '✅ Ativo' : '❌ Inativo'}\n`;
                    if (p.keyInfo) msg += `🔑 ${p.keyInfo.key}\n📅 ${p.keyInfo.expira}\n⏰ ${p.keyInfo.tipo}\n`;
                    msg += `\n🎮 Jogos: ${p.totalResgatados}`;
                    if (p.usouTeste && !p.temAcesso) msg += `\n\n😢 *Teste expirou!*`;
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '6') {
                    userStates.set(sender, { step: 'resgatar_key_teste' });
                    await sock.sendMessage(sender, { text: '🎉 *Teste Grátis*\n\n1️⃣ 1 hora\n2️⃣ 2 horas\n3️⃣ 6 horas\n\n⚠️ Só 1 por pessoa!\n\nDigite:' });
                } else if (text === '0') {
                    await sock.sendMessage(sender, { text: `💬 *Atendimento*\n\nAguarde: +${ADMIN_NUMBER}` });
                    await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { text: `📩 *Atendimento*\n\n${pushName} - ${numeroLimpo}` });
                } else if (isAdmin && (text === 'admin' || text === 'adm')) {
                    userStates.set(sender, { step: 'admin_menu' });
                    await sock.sendMessage(sender, { text: getMenuAdmin() });
                } else {
                    await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                }
            } else if (userState.step === 'resgatar_key') {
                const key = text.toUpperCase().replace(/\s/g, '');
                const r = db.resgatarKey(key, sender, pushName);
                userStates.set(sender, { step: 'menu' });
                if (r.sucesso) {
                    await sock.sendMessage(sender, { text: `✅ *Key Ativada!*\n\n🎆 ${r.plano}\n📅 ${r.expira}\n\n🎮 Aproveite!` });
                } else {
                    await sock.sendMessage(sender, { text: `❌ ${r.erro}` });
                }
            } else if (userState.step === 'resgatar_key_teste') {
                let duracao, horas;
                if (text === '1') { duracao = '1 hora'; horas = 1; }
                else if (text === '2') { duracao = '2 horas'; horas = 2; }
                else if (text === '3') { duracao = '6 horas'; horas = 6; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Digite 1, 2 ou 3:' });
                    return;
                }
                if (db.verificarTesteUsado(sender)) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { text: '❌ *Já usou teste!*\n\nCompre: +'+ADMIN_NUMBER });
                    return;
                }
                const key = `TESTE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                const r = db.criarKeyTeste(key, duracao, horas, sender, pushName);
                userStates.set(sender, { step: 'menu' });
                if (r.sucesso) {
                    await sock.sendMessage(sender, { text: `🎉 *Teste Ativado!*\n\n🔑 ${key}\n⏱️ ${duracao}\n📅 ${r.expira}` });
                }
            } else if (userState.step === 'buscar_jogo') {
                const conta = db.buscarConta(text);
                userStates.set(sender, { step: 'menu' });
                if (conta) {
                    await sock.sendMessage(sender, { text: `🎮 *${conta.jogo}*\n\n👤 ${conta.login}\n🔒 ${conta.senha}\n\n⚠️ Modo Offline!\n🔒 Não altere a senha!` });
                } else {
                    await sock.sendMessage(sender, { text: '❌ Jogo não encontrado.' });
                }
            } else if (userState.step === 'admin_menu' && isAdmin) {
                if (text === '1') {
                    userStates.set(sender, { step: 'admin_add_conta_nome', tempConta: {} });
                    await sock.sendMessage(sender, { text: '➕ Nome do jogo:' });
                } else if (text === '2') {
                    userStates.set(sender, { step: 'admin_gerar_key' });
                    await sock.sendMessage(sender, { text: '🔑 Duração:\n1️⃣ 7 dias\n2️⃣ 1 mês\n3️⃣ Lifetime' });
                } else if (text === '3') {
                    userStates.set(sender, { step: 'admin_gerar_key_teste' });
                    await sock.sendMessage(sender, { text: '🎁 Teste:\n1️⃣ 1h\n2️⃣ 2h\n3️⃣ 6h' });
                } else if (text === '4') {
                    userStates.set(sender, { step: 'admin_importar' });
                    await sock.sendMessage(sender, { text: '📄 Envie arquivo .txt' });
                } else if (text === '5') {
                    const s = db.getEstatisticas();
                    await sock.sendMessage(sender, { text: `📊 Stats\n\n🎮 ${s.totalJogos} jogos\n✅ ${s.disponiveis} disp\n🔑 ${s.keysAtivas} keys\n👥 ${s.totalClientes} clientes` });
                } else if (text === '6') {
                    const jogos = db.getTodosJogosDisponiveis();
                    let msg = '📋 Jogos:\n\n';
                    jogos.forEach(j => msg += `• ${j.jogo}\n`);
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '7') {
                    userStates.set(sender, { step: 'admin_broadcast' });
                    await sock.sendMessage(sender, { text: '📢 Mensagem para todos:' });
                } else if (text === '0') {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                } else {
                    await sock.sendMessage(sender, { text: getMenuAdmin() });
                }
            } else if (userState.step === 'admin_add_conta_nome' && isAdmin) {
                userState.tempConta.jogo = text;
                userStates.set(sender, { step: 'admin_add_conta_categoria', tempConta: userState.tempConta });
                const cats = ['1. 🗡️ AC', '2. 🔫 COD', '3. 🧟 RE', '4. ⚽ Esportes', '5. 🏎️ Corrida', '6. 🚗 Rockstar', '7. 🦸 Herois', '8. ⚔️ Souls', '9. 🐺 CDPR', '10. 🚜 Sim', '11. 👻 Terror', '12. 🎲 RPG', '13. 🥊 Luta', '14. 🕵️ Stealth', '15. 🧠 Estratégia', '16. 🌲 Survival', '17. 🍄 Nintendo', '18. 💙 Sega', '19. 💣 Guerra', '20. 🎮 Ação'];
                await sock.sendMessage(sender, { text: '➕ Categoria (1-20):\n\n' + cats.join('\n') });
            } else if (userState.step === 'admin_add_conta_categoria' && isAdmin) {
                const cats = ['🗡️ AC', '🔫 COD', '🧟 RE', '⚽ Esportes', '🏎️ Corrida', '🚗 Rockstar', '🦸 Herois', '⚔️ Souls', '🐺 CDPR', '🚜 Sim', '👻 Terror', '🎲 RPG', '🥊 Luta', '🕵️ Stealth', '🧠 Estratégia', '🌲 Survival', '🍄 Nintendo', '💙 Sega', '💣 Guerra', '🎮 Ação'];
                const esc = parseInt(text) - 1;
                if (esc >= 0 && esc < 20) {
                    userState.tempConta.categoria = cats[esc];
                    userStates.set(sender, { step: 'admin_add_conta_login', tempConta: userState.tempConta });
                    await sock.sendMessage(sender, { text: '➕ Login:' });
                } else {
                    await sock.sendMessage(sender, { text: '❌ 1-20:' });
                }
            } else if (userState.step === 'admin_add_conta_login' && isAdmin) {
                userState.tempConta.login = text;
                userStates.set(sender, { step: 'admin_add_conta_senha', tempConta: userState.tempConta });
                await sock.sendMessage(sender, { text: '➕ Senha:' });
            } else if (userState.step === 'admin_add_conta_senha' && isAdmin) {
                userState.tempConta.senha = text;
                db.addConta(userState.tempConta.jogo, userState.tempConta.categoria, userState.tempConta.login, userState.tempConta.senha);
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, { text: `✅ Adicionado!\n\n🎮 ${userState.tempConta.jogo}` });
            } else if (userState.step === 'admin_gerar_key' && isAdmin) {
                let dur, dias;
                if (text === '1') { dur = '7 dias'; dias = 7; }
                else if (text === '2') { dur = '1 mês'; dias = 30; }
                else if (text === '3') { dur = 'Lifetime'; dias = 99999; }
                else { await sock.sendMessage(sender, { text: '❌ 1-3:' }); return; }
                const key = `NYUX-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
                db.criarKey(key, dur, dias);
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, { text: `🔑 ${key}\n⏱️ ${dur}` });
            } else if (userState.step === 'admin_gerar_key_teste' && isAdmin) {
                let dur, h;
                if (text === '1') { dur = '1h'; h = 1; }
                else if (text === '2') { dur = '2h'; h = 2; }
                else if (text === '3') { dur = '6h'; h = 6; }
                else { await sock.sendMessage(sender, { text: '❌ 1-3:' }); return; }
                const key = `TESTE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                db.criarKey(key, dur, h, true);
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, { text: `🎁 ${key}\n⏱️ ${dur}` });
            } else if (userState.step === 'admin_importar' && isAdmin) {
                if (msg.message.documentMessage) {
                    await sock.sendMessage(sender, { text: '⏳...' });
                    try {
                        const stream = await sock.downloadContentFromMessage(msg.message.documentMessage, 'document');
                        let buf = Buffer.from([]);
                        for await (const c of stream) buf = Buffer.concat([buf, c]);
                        const r = db.importarTXT(buf.toString('utf-8'));
                        userStates.set(sender, { step: 'admin_menu' });
                        await sock.sendMessage(sender, { text: `✅ ${r.adicionadas} contas\n🎮 ${r.jogosUnicos} jogos` });
                    } catch (e) {
                        await sock.sendMessage(sender, { text: '❌ Erro' });
                    }
                } else {
                    await sock.sendMessage(sender, { text: '📄 Envie .txt' });
                }
            } else if (userState.step === 'admin_broadcast' && isAdmin) {
                const cli = db.getTodosClientes();
                let env = 0;
                for (const c of cli) {
                    try {
                        await sock.sendMessage(c.numero, { text: `📢 ${text}` });
                        env++;
                        await delay(500);
                    } catch (e) {}
                }
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, { text: `✅ ${env}/${cli.length}` });
            }

            if (text === 'menu' || text === 'voltar') {
                userStates.set(sender, { step: 'menu' });
                const p = db.getPerfil(sender);
                if (p.usouTeste && !p.temAcesso && !isAdmin) {
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

// Inicia servidor HTTP
server.listen(3000, () => {
    console.log('🌐 Servidor web: http://localhost:3000/qr');
});

console.log('🚀 Iniciando NyuxStore...');
connectToWhatsApp();
