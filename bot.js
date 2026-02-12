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
const userStates = new Map();
const mensagensProcessadas = new Set();

// ========== FUNÇÕES DE MENU GRID ==========

// Criar menu com botões em GRID
function criarMenuGrid(sock, sender, titulo, texto, opcoes) {
    const sections = [{
        title: 'Opções',
        rows: opcoes.map((op, index) => ({
            title: op.titulo,
            description: op.descricao || '',
            rowId: op.id || `${index + 1}`
        }))
    }];

    const listMessage = {
        text: texto,
        footer: 'NyuxStore © 2024',
        title: titulo,
        buttonText: 'Ver Opções 📋',
        sections
    };

    return sock.sendMessage(sender, listMessage);
}

// Menu Principal em GRID
async function enviarMenuPrincipalGrid(sock, sender, nome) {
    const opcoes = [
        { titulo: '💳 Comprar Key', descricao: 'Ver preços e planos', id: 'comprar' },
        { titulo: '🎁 Resgatar Key', descricao: 'Ativar sua key', id: 'resgatar' },
        { titulo: '🔍 Buscar Jogo', descricao: 'Procurar na biblioteca', id: 'buscar' },
        { titulo: '📋 Ver Jogos', descricao: 'Lista completa', id: 'jogos' },
        { titulo: '👤 Meu Perfil', descricao: 'Status e informações', id: 'perfil' },
        { titulo: '🎉 Key Teste Grátis', descricao: '1h, 2h ou 6h grátis', id: 'teste' },
        { titulo: '💬 Falar com Atendente', descricao: 'Suporte humano', id: 'atendente' }
    ];

    await criarMenuGrid(sock, sender, `🎮 ${STORE_NAME}`, 
        `Olá, ${nome}! 👋\n\nEscolha uma opção abaixo:`, opcoes);
}

// Menu Admin em GRID
async function enviarMenuAdminGrid(sock, sender) {
    const opcoes = [
        { titulo: '➕ Adicionar Conta', descricao: 'Novo jogo manual', id: 'add_conta' },
        { titulo: '🔑 Gerar Key', descricao: '7 dias, 1 mês, Lifetime', id: 'gerar_key' },
        { titulo: '🎁 Gerar Key Teste', descricao: '1h, 2h, 6h', id: 'gerar_teste' },
        { titulo: '📄 Importar Contas', descricao: 'Via arquivo TXT', id: 'importar' },
        { titulo: '📊 Estatísticas', descricao: 'Ver dados do sistema', id: 'stats' },
        { titulo: '📋 Listar Jogos', descricao: 'Todos os jogos', id: 'listar' },
        { titulo: '📢 Broadcast', descricao: 'Mensagem para todos', id: 'broadcast' },
        { titulo: '🔙 Voltar ao Menu', descricao: 'Menu principal', id: 'voltar' }
    ];

    await criarMenuGrid(sock, sender, '🔧 PAINEL ADMIN', 
        'Escolha uma função:', opcoes);
}

// Menu Teste Expirado em GRID
async function enviarMenuTesteExpiradoGrid(sock, sender, nome) {
    const opcoes = [
        { titulo: '💳 Comprar Key', descricao: '7 dias, 1 mês ou Lifetime', id: 'comprar' },
        { titulo: '👑 Falar com Admin', descricao: 'Chamar no privado', id: 'falar_admin' },
        { titulo: '💬 Suporte', descricao: 'Falar com atendente', id: 'suporte' }
    ];

    await criarMenuGrid(sock, sender, '😢 Teste Expirado', 
        `Ei ${nome}! Seu teste acabou.\n\nQuer continuar jogando?`, opcoes);
}

// Menu de Duração em GRID
async function enviarDuracaoGrid(sock, sender, tipo = 'normal') {
    let opcoes;
    
    if (tipo === 'teste') {
        opcoes = [
            { titulo: '⏱️ 1 hora', descricao: 'Teste rápido', id: 'dur_1h' },
            { titulo: '⏱️ 2 horas', descricao: 'Teste médio', id: 'dur_2h' },
            { titulo: '⏱️ 6 horas', descricao: 'Teste longo', id: 'dur_6h' }
        ];
    } else {
        opcoes = [
            { titulo: '📅 7 dias - R$ 10', descricao: 'Acesso curto', id: 'dur_7d' },
            { titulo: '📅 1 mês - R$ 25', descricao: 'Acesso mensal', id: 'dur_1m' },
            { titulo: '💎 Lifetime - R$ 80', descricao: 'Acesso vitalício', id: 'dur_life' }
        ];
    }

    await criarMenuGrid(sock, sender, '⏱️ DURAÇÃO', 'Escolha:', opcoes);
}

// Menu de Categorias em GRID
async function enviarCategoriasGrid(sock, sender) {
    const categorias = [
        { titulo: '🗡️ Assassin\'s Creed', descricao: 'Série AC', id: 'cat_1' },
        { titulo: '🔫 Call of Duty', descricao: 'COD e Warzone', id: 'cat_2' },
        { titulo: '🧟 Resident Evil', descricao: 'Série RE', id: 'cat_3' },
        { titulo: '⚽ Esportes', descricao: 'FIFA, PES, NBA', id: 'cat_4' },
        { titulo: '🏎️ Corrida', descricao: 'Forza, NFS, F1', id: 'cat_5' },
        { titulo: '🚗 Rockstar Games', descricao: 'GTA, RDR2', id: 'cat_6' },
        { titulo: '🦸 Super-Heróis', descricao: 'Marvel, DC, LEGO', id: 'cat_7' },
        { titulo: '⚔️ Soulslike', descricao: 'Elden Ring, Dark Souls', id: 'cat_8' },
        { titulo: '🐺 CD Projekt Red', descricao: 'Witcher, Cyberpunk', id: 'cat_9' },
        { titulo: '🚜 Simuladores', descricao: 'Farming, Simuladores', id: 'cat_10' },
        { titulo: '👻 Terror', descricao: 'Horror games', id: 'cat_11' },
        { titulo: '🎲 RPG', descricao: 'RPGs diversos', id: 'cat_12' },
        { titulo: '🥊 Luta', descricao: 'MK, Tekken, Street Fighter', id: 'cat_13' },
        { titulo: '🕵️ Stealth', descricao: 'Hitman, Thief', id: 'cat_14' },
        { titulo: '🧠 Estratégia', descricao: 'Age of Empires, Civ', id: 'cat_15' },
        { titulo: '🌲 Survival', descricao: 'Ark, Rust, Forest', id: 'cat_16' },
        { titulo: '🍄 Nintendo', descricao: 'Mario, Zelda, Pokémon', id: 'cat_17' },
        { titulo: '💙 Sega', descricao: 'Sonic, Atlus', id: 'cat_18' },
        { titulo: '💣 Guerra', descricao: 'Battlefield, Squad', id: 'cat_19' },
        { titulo: '🎮 Ação/Aventura', descricao: 'Outros jogos', id: 'cat_20' }
    ];

    await criarMenuGrid(sock, sender, '📂 CATEGORIAS', 
        'Escolha a categoria do jogo:', categorias);
}

// ========== SERVIDOR HTTP PARA QR CODE ==========

let qrCodeAtual = null;
let qrCodeGerado = false;

const server = http.createServer((req, res) => {
    if (req.url === '/qr' && qrCodeAtual) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>NyuxStore - QR Code</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: white; font-family: Arial, sans-serif; }
                    h1 { color: #00d4ff; }
                    .qr-container { background: white; padding: 20px; border-radius: 10px; margin: 20px; }
                    .info { margin-top: 20px; text-align: center; color: #888; }
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
                </div>
            </body>
            </html>
        `);
    } else if (req.url === '/qr') {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<h1>Aguardando QR Code...</h1>');
    } else {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<h1>NyuxStore Bot Online!</h1><p>Acesse <a href="/qr">/qr</a></p>');
    }
});

// ========== FUNÇÕES AUXILIARES ==========

function verificarAdmin(numero) {
    const numLimpo = numero.replace(/\D/g, '');
    const adminLimpo = ADMIN_NUMBER.replace(/\D/g, '');
    console.log(`🔍 Verificando: ${numLimpo} === ${adminLimpo} = ${numLimpo === adminLimpo}`);
    return numLimpo === adminLimpo;
}

function getNomeCategoria(id) {
    const cats = {
        'cat_1': '🗡️ Assassin\'s Creed', 'cat_2': '🔫 Call of Duty',
        'cat_3': '🧟 Resident Evil', 'cat_4': '⚽ Esportes',
        'cat_5': '🏎️ Corrida', 'cat_6': '🚗 Rockstar Games',
        'cat_7': '🦸 Super-Heróis', 'cat_8': '⚔️ Soulslike',
        'cat_9': '🐺 CD Projekt Red', 'cat_10': '🚜 Simuladores',
        'cat_11': '👻 Terror', 'cat_12': '🎲 RPG',
        'cat_13': '🥊 Luta', 'cat_14': '🕵️ Stealth',
        'cat_15': '🧠 Estratégia', 'cat_16': '🌲 Survival',
        'cat_17': '🍄 Nintendo', 'cat_18': '💙 Sega',
        'cat_19': '💣 Guerra', 'cat_20': '🎮 Ação/Aventura'
    };
    return cats[id] || '🎮 Ação/Aventura';
}

// ========== CONEXÃO WHATSAPP ==========

async function connectToWhatsApp() {
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = await import('@whiskeysockets/baileys');
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    console.log(`📱 Baileys v${version.join('.')}`);

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
                qrCodeAtual = await QRCode.toDataURL(qr, { width: 400, margin: 2 });
                
                console.log('✅ QR Code gerado!');
                console.log('🌐 Acesse: http://localhost:3000/qr');
                
                const QRCodeTerminal = require('qrcode-terminal');
                QRCodeTerminal.generate(qr, { small: false });
                
                setTimeout(() => { qrCodeAtual = null; qrCodeGerado = false; }, 60000);
            } catch (err) {
                console.error('❌ Erro QR:', err);
            }
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexão fechada:', shouldReconnect);
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

    // ========== PROCESSAR MENSAGENS ==========
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        
        if (!msg.message || msg.key.fromMe) return;
        if (msg.key.remoteJid === 'status@broadcast') return;
        
        const msgId = `${msg.key.id}_${msg.key.remoteJid}`;
        
        if (mensagensProcessadas.has(msgId)) {
            console.log('🚫 Duplicada:', msgId);
            return;
        }
        
        mensagensProcessadas.add(msgId);
        if (mensagensProcessadas.size > 100) {
            const primeiro = mensagensProcessadas.values().next().value;
            mensagensProcessadas.delete(primeiro);
        }
        
        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        const pushName = msg.pushName || 'Cliente';
        
        console.log(`👤 ${pushName} (${sender})`);
        
        // Extrai texto
        let text = '';
        if (msg.message.conversation) text = msg.message.conversation;
        else if (msg.message.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
        else if (msg.message.listResponseMessage?.singleSelectReply?.selectedRowId) text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        else if (msg.message.buttonsResponseMessage?.selectedButtonId) text = msg.message.buttonsResponseMessage.selectedButtonId;
        else if (msg.message.documentMessage) text = '[documento]';
        
        text = text.toLowerCase().trim();
        console.log(`💬 "${text}"`);
        
        const numeroLimpo = sender.replace('@s.whatsapp.net', '').replace('@g.us', '');
        const isAdmin = verificarAdmin(numeroLimpo);
        
        const perfil = db.getPerfil(sender);
        const testeExpirado = perfil.usouTeste && !perfil.temAcesso;
        
        let userState = userStates.get(sender) || { step: 'menu' };
        
        try {
            // ========== COMANDOS GLOBAIS ==========
            
            // Admin - acesso ao painel
            if ((text === 'admin' || text === 'adm') && isAdmin) {
                userStates.set(sender, { step: 'admin_menu' });
                await enviarMenuAdminGrid(sock, sender);
                return;
            }
            
            // Admin negado
            if ((text === 'admin' || text === 'adm') && !isAdmin) {
                await sock.sendMessage(sender, { text: '❌ *Acesso negado!*\nVocê não é administrador.' });
                return;
            }
            
            // Menu / Voltar / Saudações
            if (['menu', 'voltar', 'oi', 'ola', 'olá', 'hey', 'eai', 'eae'].includes(text)) {
                userStates.set(sender, { step: 'menu' });
                if (testeExpirado && !isAdmin) {
                    await enviarMenuTesteExpiradoGrid(sock, sender, pushName);
                } else {
                    await enviarMenuPrincipalGrid(sock, sender, pushName);
                }
                return;
            }
            
            // ========== MENU PRINCIPAL ==========
            if (userState.step === 'menu') {
                
                // Teste expirado - menu especial
                if (testeExpirado && !isAdmin) {
                    switch(text) {
                        case 'comprar':
                        case '1':
                            await sock.sendMessage(sender, { 
                                text: `💳 *Comprar Key*\n\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 Chame: +${ADMIN_NUMBER}` 
                            });
                            break;
                        case 'falar_admin':
                        case '2':
                            await sock.sendMessage(sender, { text: '👑 *Chamando Admin...*' });
                            await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { 
                                text: `🚨 *CLIENTE QUER COMPRAR!*\n\nNome: ${pushName}\nNúmero: ${numeroLimpo}\nStatus: Teste expirado` 
                            });
                            await sock.sendMessage(sender, { 
                                text: `✅ *Admin notificado!*\nAguarde ou chame:\n👤 +${ADMIN_NUMBER}` 
                            });
                            break;
                        case 'suporte':
                        case '0':
                            await sock.sendMessage(sender, { text: `💬 *Suporte*\n\nAguarde: +${ADMIN_NUMBER}` });
                            await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { 
                                text: `📩 *Suporte*\n\n${pushName} - ${numeroLimpo}` 
                            });
                            break;
                        default:
                            await enviarMenuTesteExpiradoGrid(sock, sender, pushName);
                    }
                    return;
                }
                
                // Menu normal
                switch(text) {
                    case 'comprar':
                    case '1':
                        await sock.sendMessage(sender, { 
                            text: `💳 *Comprar Key*\n\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 Chame: +${ADMIN_NUMBER}` 
                        });
                        break;
                        
                    case 'resgatar':
                    case '2':
                        userStates.set(sender, { step: 'resgatar_key' });
                        await sock.sendMessage(sender, { text: '🎁 *Resgatar Key*\n\nDigite sua key:\nNYUX-XXXX-XXXX' });
                        break;
                        
                    case 'buscar':
                    case '3':
                        if (!db.verificarAcesso(sender)) {
                            await sock.sendMessage(sender, { text: '❌ *Sem acesso!*\n\nDigite *6* para teste grátis ou compre uma key.' });
                            return;
                        }
                        const jogos = db.getJogosDisponiveisPorCategoria();
                        let msg = '🎮 *Jogos Disponíveis*\n\n';
                        for (const [cat, lista] of Object.entries(jogos)) {
                            msg += `${cat} (${lista.length})\n`;
                            lista.slice(0, 5).forEach(j => msg += `  • ${j.jogo}\n`);
                            if (lista.length > 5) msg += `  ... e mais ${lista.length - 5}\n`;
                            msg += '\n';
                        }
                        msg += '🔍 *Digite o nome do jogo:*';
                        userStates.set(sender, { step: 'buscar_jogo' });
                        await sock.sendMessage(sender, { text: msg });
                        break;
                        
                    case 'jogos':
                    case '4':
                        if (!db.verificarAcesso(sender)) {
                            await sock.sendMessage(sender, { text: '❌ *Sem acesso!*\n\nDigite *6* para teste grátis.' });
                            return;
                        }
                        const lista = db.getJogosDisponiveisPorCategoria();
                        let msg2 = '📋 *Jogos por Categoria*\n\n';
                        let total = 0;
                        for (const [cat, jogos] of Object.entries(lista)) {
                            msg2 += `${cat}: ${jogos.length} jogos\n`;
                            total += jogos.length;
                        }
                        msg2 += `\n🎮 *Total: ${total} jogos*\n\nUse *3* para buscar específico.`;
                        await sock.sendMessage(sender, { text: msg2 });
                        break;
                        
                    case 'perfil':
                    case '5':
                        const p = db.getPerfil(sender);
                        let msg3 = `👤 *Seu Perfil*\n\n📱 ${numeroLimpo}\n⏱️ ${p.temAcesso ? '✅ Ativo' : '❌ Inativo'}\n`;
                        if (p.keyInfo) {
                            msg3 += `🔑 ${p.keyInfo.key}\n📅 ${p.keyInfo.expira}\n⏰ ${p.keyInfo.tipo}\n`;
                        }
                        msg3 += `\n🎮 Jogos: ${p.totalResgatados}`;
                        if (p.usouTeste && !p.temAcesso) msg3 += '\n\n😢 *Teste expirou!*';
                        await sock.sendMessage(sender, { text: msg3 });
                        break;
                        
                    case 'teste':
                    case '6':
                        if (db.verificarTesteUsado(sender)) {
                            await sock.sendMessage(sender, { text: '❌ *Você já usou o teste!*\n\nCompre uma key:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80' });
                            return;
                        }
                        userStates.set(sender, { step: 'resgatar_key_teste' });
                        await enviarDuracaoGrid(sock, sender, 'teste');
                        break;
                        
                    case 'atendente':
                    case '0':
                        await sock.sendMessage(sender, { text: `💬 *Atendimento*\n\nAguarde ou chame:\n👤 +${ADMIN_NUMBER}` });
                        await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { 
                            text: `📩 *Atendimento*\n\n${pushName}\n${numeroLimpo}` 
                        });
                        break;
                        
                    default:
                        await enviarMenuPrincipalGrid(sock, sender, pushName);
                }
            }
            
            // ========== RESGATAR KEY ==========
            else if (userState.step === 'resgatar_key') {
                const key = text.toUpperCase().replace(/\s/g, '');
                const r = db.resgatarKey(key, sender, pushName);
                userStates.set(sender, { step: 'menu' });
                
                if (r.sucesso) {
                    await sock.sendMessage(sender, { 
                        text: `✅ *Key Ativada!*\n\n🎆 ${r.plano}\n📅 ${r.expira}\n\n🎮 Aproveite!` 
                    });
                } else {
                    await sock.sendMessage(sender, { text: `❌ ${r.erro}` });
                }
            }
            
            // ========== RESGATAR TESTE ==========
            else if (userState.step === 'resgatar_key_teste') {
                let duracao, horas;
                
                if (text === 'dur_1h' || text === '1') { duracao = '1 hora'; horas = 1; }
                else if (text === 'dur_2h' || text === '2') { duracao = '2 horas'; horas = 2; }
                else if (text === 'dur_6h' || text === '3') { duracao = '6 horas'; horas = 6; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Escolha 1, 2 ou 3:' });
                    return;
                }
                
                if (db.verificarTesteUsado(sender)) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { text: '❌ *Já usou teste!*' });
                    return;
                }
                
                const key = `TESTE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                const r = db.criarKeyTeste(key, duracao, horas, sender, pushName);
                userStates.set(sender, { step: 'menu' });
                
                if (r.sucesso) {
                    await sock.sendMessage(sender, { 
                        text: `🎉 *Teste Ativado!*\n\n🔑 ${key}\n⏱️ ${duracao}\n📅 ${r.expira}\n\n✅ Acesso liberado!` 
                    });
                }
            }
            
            // ========== BUSCAR JOGO ==========
            else if (userState.step === 'buscar_jogo') {
                const conta = db.buscarConta(text);
                userStates.set(sender, { step: 'menu' });
                
                if (conta) {
                    await sock.sendMessage(sender, { 
                        text: `🎮 *${conta.jogo}*\n📂 ${conta.categoria}\n\n👤 ${conta.login}\n🔒 ${conta.senha}\n\n⚠️ *MODO OFFLINE*\n🔒 Não altere a senha!` 
                    });
                } else {
                    await sock.sendMessage(sender, { text: '❌ Jogo não encontrado.\n\nTente outro nome ou digite *menu*' });
                }
            }
            
            // ========== MENU ADMIN ==========
            else if (userState.step === 'admin_menu' && isAdmin) {
                
                switch(text) {
                    case 'add_conta':
                    case '1':
                        userStates.set(sender, { step: 'admin_add_nome', tempConta: {} });
                        await sock.sendMessage(sender, { text: '➕ *Nome do jogo:*' });
                        break;
                        
                    case 'gerar_key':
                    case '2':
                        userStates.set(sender, { step: 'admin_gerar_key' });
                        await enviarDuracaoGrid(sock, sender, 'normal');
                        break;
                        
                    case 'gerar_teste':
                    case '3':
                        userStates.set(sender, { step: 'admin_gerar_teste' });
                        await enviarDuracaoGrid(sock, sender, 'teste');
                        break;
                        
                    case 'importar':
                    case '4':
                        userStates.set(sender, { step: 'admin_importar' });
                        await sock.sendMessage(sender, { text: '📄 *Envie o arquivo .txt*' });
                        break;
                        
                    case 'stats':
                    case '5':
                        const s = db.getEstatisticas();
                        await sock.sendMessage(sender, { 
                            text: `📊 *Estatísticas*\n\n🎮 ${s.totalJogos} jogos\n✅ ${s.disponiveis} disponíveis\n🔑 ${s.keysAtivas} keys\n🎉 ${s.keysTeste} testes\n👥 ${s.totalClientes} clientes` 
                        });
                        break;
                        
                    case 'listar':
                    case '6':
                        const jogos = db.getTodosJogosDisponiveis();
                        let msg = `📋 *${jogos.length} Jogos*\n\n`;
                        jogos.slice(0, 40).forEach(j => msg += `• ${j.jogo}\n`);
                        if (jogos.length > 40) msg += `\n...e mais ${jogos.length - 40}`;
                        await sock.sendMessage(sender, { text: msg });
                        break;
                        
                    case 'broadcast':
                    case '7':
                        userStates.set(sender, { step: 'admin_broadcast' });
                        await sock.sendMessage(sender, { text: '📢 *Digite a mensagem:*' });
                        break;
                        
                    case 'voltar':
                    case '0':
                    case 'menu':
                        userStates.set(sender, { step: 'menu' });
                        await enviarMenuPrincipalGrid(sock, sender, pushName);
                        break;
                        
                    default:
                        await enviarMenuAdminGrid(sock, sender);
                }
                return;
            }
            
            // ========== ADMIN - ADICIONAR CONTA ==========
            else if (userState.step === 'admin_add_nome' && isAdmin) {
                userState.tempConta.jogo = text;
                userStates.set(sender, { step: 'admin_add_cat', tempConta: userState.tempConta });
                await enviarCategoriasGrid(sock, sender);
            }
            
            else if (userState.step === 'admin_add_cat' && isAdmin) {
                const catNome = getNomeCategoria(text);
                userState.tempConta.categoria = catNome;
                userStates.set(sender, { step: 'admin_add_login', tempConta: userState.tempConta });
                await sock.sendMessage(sender, { text: '➕ *Login (email/usuário):*' });
            }
            
            else if (userState.step === 'admin_add_login' && isAdmin) {
                userState.tempConta.login = text;
                userStates.set(sender, { step: 'admin_add_senha', tempConta: userState.tempConta });
                await sock.sendMessage(sender, { text: '➕ *Senha:*' });
            }
            
            else if (userState.step === 'admin_add_senha' && isAdmin) {
                userState.tempConta.senha = text;
                db.addConta(userState.tempConta.jogo, userState.tempConta.categoria, userState.tempConta.login, userState.tempConta.senha);
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, { 
                    text: `✅ *Conta Adicionada!*\n\n🎮 ${userState.tempConta.jogo}\n📂 ${userState.tempConta.categoria}\n👤 ${userState.tempConta.login}` 
                });
            }
            
            // ========== ADMIN - GERAR KEY ==========
            else if (userState.step === 'admin_gerar_key' && isAdmin) {
                let dur, dias;
                
                if (text === 'dur_7d' || text === '1') { dur = '7 dias'; dias = 7; }
                else if (text === 'dur_1m' || text === '2') { dur = '1 mês'; dias = 30; }
                else if (text === 'dur_life' || text === '3') { dur = 'Lifetime'; dias = 99999; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Escolha 1, 2 ou 3:' });
                    return;
                }
                
                const key = `NYUX-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
                db.criarKey(key, dur, dias);
                userStates.set(sender, { step: 'admin_menu' });
                
                await sock.sendMessage(sender, { 
                    text: `🔑 *Key Gerada!*\n\n${key}\n⏱️ ${dur}\n\nCopie e envie ao cliente.` 
                });
            }
            
            // ========== ADMIN - GERAR TESTE ==========
            else if (userState.step === 'admin_gerar_teste' && isAdmin) {
                let dur, h;
                
                if (text === 'dur_1h' || text === '1') { dur = '1 hora'; h = 1; }
                else if (text === 'dur_2h' || text === '2') { dur = '2 horas'; h = 2; }
                else if (text === 'dur_6h' || text === '3') { dur = '6 horas'; h = 6; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Escolha 1, 2 ou 3:' });
                    return;
                }
                
                const key = `TESTE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                db.criarKey(key, dur, h, true);
                userStates.set(sender, { step: 'admin_menu' });
                
                await sock.sendMessage(sender, { 
                    text: `🎁 *Key Teste!*\n\n${key}\n⏱️ ${dur}` 
                });
            }
            
            // ========== ADMIN - IMPORTAR ==========
            else if (userState.step === 'admin_importar' && isAdmin) {
                if (msg.message.documentMessage) {
                    await sock.sendMessage(sender, { text: '⏳ *Processando...*' });
                    
                    try {
                        const stream = await sock.downloadContentFromMessage(msg.message.documentMessage, 'document');
                        let buf = Buffer.from([]);
                        for await (const c of stream) buf = Buffer.concat([buf, c]);
                        
                        const r = db.importarTXT(buf.toString('utf-8'));
                        userStates.set(sender, { step: 'admin_menu' });
                        
                        await sock.sendMessage(sender, { 
                            text: `✅ *Importado!*\n\n📊 ${r.adicionadas} contas\n🎮 ${r.jogosUnicos} jogos\n📂 ${r.categorias} categorias\n❌ ${r.erros} erros` 
                        });
                    } catch (e) {
                        await sock.sendMessage(sender, { text: '❌ *Erro no arquivo!*' });
                    }
                } else {
                    await sock.sendMessage(sender, { text: '📄 *Envie um arquivo .txt*' });
                }
            }
            
            // ========== ADMIN - BROADCAST ==========
            else if (userState.step === 'admin_broadcast' && isAdmin) {
                const clientes = db.getTodosClientes();
                let enviados = 0;
                
                await sock.sendMessage(sender, { text: `📢 *Enviando para ${clientes.length} clientes...*` });
                
                for (const c of clientes) {
                    try {
                        await sock.sendMessage(c.numero, { text: `📢 *NyuxStore*\n\n${text}` });
                        enviados++;
                        await delay(500);
                    } catch (e) {}
                }
                
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, { text: `✅ *Enviado!*\n\n${enviados}/${clientes.length} mensagens` });
            }
            
        } catch (error) {
            console.error('❌ Erro:', error);
            await sock.sendMessage(sender, { text: '❌ *Erro!*\n\nDigite *menu* para voltar.' });
        }
    });

    return sock;
}

// Iniciar
server.listen(3000, () => {
    console.log('🌐 Web: http://localhost:3000/qr');
});

console.log('🚀 Iniciando NyuxStore...');
console.log('👑 Admin:', ADMIN_NUMBER);
connectToWhatsApp();
