const pino = require('pino');
const qrcode = require('qrcode-terminal');
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

// Conectar ao WhatsApp
async function connectToWhatsApp() {
    // Importa Baileys dinamicamente (ES Module)
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = await import('@whiskeysockets/baileys');
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    console.log(`📱 Usando Baileys v${version.join('.')}, Latest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['NyuxStore Bot', 'Chrome', '1.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        keepAliveIntervalMs: 30000,
        shouldIgnoreJid: jid => false
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 Escaneie o QR Code com seu WhatsApp');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexão fechada. Reconectando:', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Bot conectado ao WhatsApp!');
            console.log('📱 Número:', sock.user.id.split(':')[0]);
            console.log('🤖 Nome:', sock.user.name);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Processar mensagens
    sock.ev.on('messages.upsert', async (m) => {
        console.log('📩 Nova mensagem:', m.type);
        
        const msg = m.messages[0];
        
        if (!msg.message || msg.key.fromMe) {
            return;
        }

        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        const pushName = msg.pushName || 'Cliente';
        
        console.log(`👤 De: ${pushName} (${sender})`);
        console.log(`👥 Grupo: ${isGroup}`);

        // Extrai texto da mensagem
        let text = '';
        
        if (msg.message.conversation) {
            text = msg.message.conversation;
        } else if (msg.message.extendedTextMessage) {
            text = msg.message.extendedTextMessage.text;
        } else if (msg.message.buttonsResponseMessage) {
            text = msg.message.buttonsResponseMessage.selectedButtonId;
        } else if (msg.message.listResponseMessage) {
            text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        } else if (msg.message.documentMessage) {
            text = '[documento]';
        }

        text = text.toLowerCase().trim();
        console.log(`💬 Texto: "${text}"`);

        // Verifica se é admin
        const numeroLimpo = sender.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/\D/g, '');
        const isAdmin = numeroLimpo === ADMIN_NUMBER.replace(/\D/g, '');

        // Verifica se é cliente com teste expirado
        const perfil = db.getPerfil(sender);
        const testeExpirado = perfil.usouTeste && !perfil.temAcesso;

        // Estado atual do usuário
        const userState = userStates.get(sender) || { step: 'menu' };

        try {
            // Se não reconhecer comando no menu, mostra menu apropriado
            if (!isGroup && text !== '[documento]') {
                const comandosValidos = ['1', '2', '3', '4', '5', '6', '0', 'menu', 'admin', 'voltar', 'oi', 'ola', 'olá', 'hey', 'eai', 'eae'];
                
                if (!comandosValidos.includes(text) && userState.step === 'menu') {
                    // Se teste expirou, mostra menu especial
                    if (testeExpirado && !isAdmin) {
                        await sock.sendMessage(sender, {
                            text: `Olá! 👋 Não entendi.\n\n${getMenuTesteExpirado(pushName)}`
                        });
                    } else {
                        await sock.sendMessage(sender, {
                            text: `Olá! 👋 Não entendi.\n\n${getMenuPrincipal(pushName)}`
                        });
                    }
                    return;
                }
            }

            // MENU PRINCIPAL OU MENU TESTE EXPIRADO
            if (userState.step === 'menu') {
                
                // Se teste expirou, mostra menu especial (exceto para admin)
                if (testeExpirado && !isAdmin) {
                    
                    if (text === '1' || text.includes('comprar')) {
                        await sock.sendMessage(sender, {
                            text: `💳 *Comprar Key*\n\nPara comprar uma key, faça o pagamento via:\n\n• Pix\n• Transferência\n• Cartão\n\n💰 *Valores:*\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 Chame o admin: +${ADMIN_NUMBER}`
                        });

                    } else if (text === '2' || text.includes('admin') || text.includes('falar')) {
                        // Chama admin no privado
                        await sock.sendMessage(sender, {
                            text: `👑 *Chamando Admin...*\n\nAguarde, estou te conectando com o admin!`
                        });
                        
                        // Notifica admin
                        await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                            text: `🚨 *CLIENTE QUER COMPRAR!*\n\nCliente: ${pushName}\nNúmero: ${numeroLimpo}\nStatus: *Teste expirado, quer comprar key!*\n\n💬 Responda aqui para negociar.`
                        });
                        
                        // Envia contato do cliente para o admin
                        await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                            contacts: {
                                displayName: pushName,
                                contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${pushName}\nTEL;waid=${numeroLimpo}:+${numeroLimpo}\nEND:VCARD` }]
                            }
                        });
                        
                        await sock.sendMessage(sender, {
                            text: `✅ *Admin notificado!*\n\nO admin foi avisado e vai te chamar em breve.\n\nEnquanto isso, pode mandar mensagem direto:\n👤 +${ADMIN_NUMBER}`
                        });

                    } else if (text === '0' || text.includes('atendente')) {
                        await sock.sendMessage(sender, {
                            text: `💬 *Falar com Atendente*\n\nAguarde um momento...\n\nOu chame direto: +${ADMIN_NUMBER}`
                        });
                        await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                            text: `📩 *Novo Atendimento*\n\nCliente: ${pushName}\nNúmero: ${numeroLimpo}\nStatus: *Teste expirado*\n\nEstá aguardando atendimento.`
                        });

                    } else if (['oi', 'ola', 'olá', 'hey', 'eai', 'eae', 'menu', 'voltar'].includes(text)) {
                        await sock.sendMessage(sender, { 
                            text: getMenuTesteExpirado(pushName)
                        });

                    } else {
                        await sock.sendMessage(sender, { 
                            text: getMenuTesteExpirado(pushName)
                        });
                    }
                    
                    return; // Sai aqui para não executar o menu normal
                }

                // MENU NORMAL (quem tem acesso ou nunca usou teste)
                if (text === '1' || text.includes('comprar')) {
                    await sock.sendMessage(sender, {
                        text: `💳 *Comprar Key*\n\nPara comprar uma key, faça o pagamento via:\n\n• Pix\n• Transferência\n• Cartão\n\n💰 *Valores:*\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 Chame o admin: +${ADMIN_NUMBER}`
                    });

                } else if (text === '2' || text.includes('resgatar')) {
                    userStates.set(sender, { step: 'resgatar_key' });
                    await sock.sendMessage(sender, {
                        text: '🎁 *Resgatar Key*\n\nDigite sua key no formato:\nNYUX-XXXX-XXXX\n\n_Exemplo: NYUX-AB12-CD34_'
                    });

                } else if (text === '3' || text.includes('buscar')) {
                    const temAcesso = db.verificarAcesso(sender);
                    if (!temAcesso) {
                        await sock.sendMessage(sender, {
                            text: '❌ *Acesso Negado*\n\nVocê precisa de uma key ativa!\n\nDigite *2* para resgatar sua key ou *6* para teste grátis.'
                        });
                        return;
                    }
                    
                    // Mostra lista de jogos disponíveis por categoria primeiro
                    const jogosPorCategoria = db.getJogosDisponiveisPorCategoria();
                    let msg = '🎮 *Jogos Disponíveis*\n\n';
                    
                    for (const [categoria, jogos] of Object.entries(jogosPorCategoria)) {
                        msg += `${categoria}\n`;
                        jogos.forEach((jogo, index) => {
                            msg += `${index + 1}. ${jogo.jogo}\n`;
                        });
                        msg += '\n';
                    }
                    
                    msg += '🔍 *Digite o nome do jogo que deseja:*\n\n_Exemplo: GTA 5, Minecraft, FIFA..._';
                    
                    userStates.set(sender, { step: 'buscar_jogo' });
                    await sock.sendMessage(sender, { text: msg });

                } else if (text === '4' || text.includes('jogos') || text.includes('lista')) {
                    const temAcesso = db.verificarAcesso(sender);
                    if (!temAcesso) {
                        await sock.sendMessage(sender, {
                            text: '❌ *Acesso Negado*\n\nVocê precisa de uma key ativa!\n\nDigite *2* para resgatar sua key ou *6* para teste grátis.'
                        });
                        return;
                    }
                    
                    const jogosPorCategoria = db.getJogosDisponiveisPorCategoria();
                    let msg = '📋 *Lista de Jogos Disponíveis*\n\n';
                    
                    let totalJogos = 0;
                    for (const [categoria, jogos] of Object.entries(jogosPorCategoria)) {
                        msg += `${categoria} (${jogos.length} jogos)\n`;
                        jogos.forEach((jogo, index) => {
                            msg += `  ${index + 1}. ${jogo.jogo}\n`;
                            totalJogos++;
                        });
                        msg += '\n';
                    }
                    
                    msg += `🎮 *Total: ${totalJogos} jogos disponíveis*\n\n`;
                    msg += '💡 Para resgatar uma conta, use a opção *3 - Buscar Jogo*';
                    
                    // Divide em partes se for muito grande
                    if (msg.length > 4000) {
                        const partes = msg.match(/[\s\S]{1,4000}/g) || [msg];
                        for (let i = 0; i < partes.length; i++) {
                            await delay(1000);
                            await sock.sendMessage(sender, { text: partes[i] + (i < partes.length - 1 ? '\n\n(continua...)' : '') });
                        }
                    } else {
                        await sock.sendMessage(sender, { text: msg });
                    }

                } else if (text === '5' || text.includes('perfil')) {
                    const perfilUser = db.getPerfil(sender);
                    let msg = '👤 *Seu Perfil*\n\n';
                    msg += `📱 Número: ${numeroLimpo}\n`;
                    msg += `⏱️ Acesso: ${perfilUser.temAcesso ? '✅ Ativo' : '❌ Inativo'}\n`;
                    
                    if (perfilUser.keyInfo) {
                        msg += `🔑 Key: ${perfilUser.keyInfo.key}\n`;
                        msg += `📅 Expira: ${perfilUser.keyInfo.expira}\n`;
                        msg += `⏰ Tipo: ${perfilUser.keyInfo.tipo || 'Normal'}\n`;
                    }
                    
                    msg += `\n🎮 Jogos resgatados: ${perfilUser.totalResgatados}`;
                    
                    // Se teste expirado, avisa
                    if (perfilUser.usouTeste && !perfilUser.temAcesso) {
                        msg += `\n\n😢 *Seu teste expirou!*\nDigite *menu* para ver opções de compra.`;
                    }
                    
                    await sock.sendMessage(sender, { text: msg });

                } else if (text === '6' || text.includes('teste') || text.includes('gratis') || text.includes('grátis')) {
                    userStates.set(sender, { step: 'resgatar_key_teste' });
                    await sock.sendMessage(sender, {
                        text: '🎉 *Key Teste Grátis*\n\nEscolha a duração do teste:\n\n1️⃣ 1 hora\n2️⃣ 2 horas\n3️⃣ 6 horas\n\n⚠️ *Atenção:* Você só pode gerar 1 key de teste!\n\nDigite o número:'
                    });

                } else if (text === '0' || text.includes('atendente')) {
                    await sock.sendMessage(sender, {
                        text: `💬 *Falar com Atendente*\n\nAguarde um momento...\n\nOu chame direto: +${ADMIN_NUMBER}`
                    });
                    await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                        text: `📩 *Novo Atendimento*\n\nCliente: ${pushName}\nNúmero: ${numeroLimpo}\n\nEstá aguardando atendimento.`
                    });

                } else if (isAdmin && (text === 'admin' || text === 'adm')) {
                    userStates.set(sender, { step: 'admin_menu' });
                    await sock.sendMessage(sender, { text: getMenuAdmin() });

                } else if (['oi', 'ola', 'olá', 'hey', 'eai', 'eae'].includes(text)) {
                    await sock.sendMessage(sender, { 
                        text: getMenuPrincipal(pushName)
                    });

                } else {
                    await sock.sendMessage(sender, { 
                        text: getMenuPrincipal(pushName)
                    });
                }
            }

            // RESGATAR KEY NORMAL
            else if (userState.step === 'resgatar_key') {
                const key = text.toUpperCase().replace(/\s/g, '');
                const resultado = db.resgatarKey(key, sender, pushName);
                
                if (resultado.sucesso) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, {
                        text: `✅ *Key Resgatada com Sucesso!*\n\n🎆 Plano: ${resultado.plano}\n⏱️ Duração: ${resultado.duracao}\n📅 Expira em: ${resultado.expira}\n\nAgora você pode:\n• Buscar jogos (opção 3)\n• Ver lista de jogos (opção 4)\n\n🎮 Aproveite!`
                    });
                } else {
                    await sock.sendMessage(sender, {
                        text: `❌ *Key Inválida*\n\n${resultado.erro}\n\nTente novamente ou digite *menu* para voltar.`
                    });
                }
            }

            // RESGATAR KEY TESTE GRÁTIS
            else if (userState.step === 'resgatar_key_teste') {
                let duracao, horas;
                
                if (text === '1') { duracao = '1 hora'; horas = 1; }
                else if (text === '2') { duracao = '2 horas'; horas = 2; }
                else if (text === '3') { duracao = '6 horas'; horas = 6; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Opção inválida. Digite 1, 2 ou 3:' });
                    return;
                }
                
                // Verifica se já usou teste
                const jaUsouTeste = db.verificarTesteUsado(sender);
                if (jaUsouTeste) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, {
                        text: '❌ *Você já usou seu teste grátis!*\n\nCompre uma key para ter acesso ilimitado:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 Chame o admin: +' + ADMIN_NUMBER
                    });
                    return;
                }
                
                const prefixo = 'TESTE';
                const sufixo = Math.random().toString(36).substring(2, 8).toUpperCase();
                const meio = Math.random().toString(36).substring(2, 6).toUpperCase();
                const key = `${prefixo}-${meio}-${sufixo}`;
                
                const resultado = db.criarKeyTeste(key, duracao, horas, sender, pushName);
                
                if (resultado.sucesso) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, {
                        text: `🎉 *Key Teste Gerada!*\n\n🔑 Key: ${key}\n⏱️ Duração: ${duracao}\n📅 Expira em: ${resultado.expira}\n\n✅ Agora você tem acesso completo ao catálogo!\n\n🎮 Aproveite seu teste!`
                    });
                } else {
                    await sock.sendMessage(sender, {
                        text: `❌ *Erro ao gerar teste*\n\n${resultado.erro}\n\nDigite *menu* para voltar.`
                    });
                }
            }

            // BUSCAR JOGO - NÃO MARCA COMO USADA (CONTAS ILIMITADAS)
            else if (userState.step === 'buscar_jogo') {
                const conta = db.buscarConta(text);
                
                if (conta) {
                    userStates.set(sender, { step: 'menu' });
                    
                    await sock.sendMessage(sender, {
                        text: `🎮 *Conta Encontrada!*\n\n*Jogo:* ${conta.jogo}\n*Categoria:* ${conta.categoria}\n\n👤 *Login:* ${conta.login}\n🔒 *Senha:* ${conta.senha}\n\n⚠️ *IMPORTANTE:*\n1. Faça login na Steam\n2. Baixe o jogo\n3. Ative o *MODO OFFLINE*\n4. Jogue!\n\n🔒 Não altere a senha!\n\n✅ Esta conta é compartilhada - você pode usar quantas vezes quiser!\n\nDigite *menu* para voltar.`
                    });
                } else {
                    await sock.sendMessage(sender, {
                        text: `❌ *Jogo não encontrado ou indisponível*\n\nNão temos "${text}" disponível no momento.\n\nDigite *4* para ver a lista de jogos ou tente outro nome.`
                    });
                }
            }

            // MENU ADMIN
            else if (userState.step === 'admin_menu' && isAdmin) {
                if (text === '1') {
                    userStates.set(sender, { step: 'admin_add_conta_nome' });
                    await sock.sendMessage(sender, {
                        text: '➕ *Adicionar Conta - Passo 1/4*\n\nDigite o *NOME DO JOGO*:\n\n_Exemplo: GTA 5, FIFA 24, Call of Duty..._'
                    });

                } else if (text === '2') {
                    userStates.set(sender, { step: 'admin_gerar_key' });
                    await sock.sendMessage(sender, {
                        text: '🔑 *Gerar Key*\n\nEscolha a duração:\n\n1️⃣ 7 dias\n2️⃣ 1 mês  \n3️⃣ Lifetime\n\nDigite o número:'
                    });

                } else if (text === '3') {
                    userStates.set(sender, { step: 'admin_gerar_key_teste' });
                    await sock.sendMessage(sender, {
                        text: '🎁 *Gerar Key Teste (Admin)*\n\nEscolha a duração:\n\n1️⃣ 1 hora\n2️⃣ 2 horas\n3️⃣ 6 horas\n\nDigite o número:'
                    });

                } else if (text === '4') {
                    userStates.set(sender, { step: 'admin_importar' });
                    await sock.sendMessage(sender, {
                        text: '📄 *Importar Contas*\n\nEnvie o arquivo .txt com as contas.\n\nO sistema detectará automaticamente:\n• Nome do jogo\n• Login e senha\n• Categoria\n\nAguardando arquivo...'
                    });

                } else if (text === '5') {
                    const stats = db.getEstatisticas();
                    await sock.sendMessage(sender, {
                        text: `📊 *Estatísticas*\n\n🎮 Total de Jogos: ${stats.totalJogos}\n✅ Disponíveis: ${stats.disponiveis}\n❌ Usados: ${stats.usados}\n🔑 Keys Ativas: ${stats.keysAtivas}\n🎉 Keys Teste: ${stats.keysTeste}\n👥 Clientes: ${stats.totalClientes}\n📂 Categorias: ${stats.totalCategorias}`
                    });

                } else if (text === '6') {
                    const jogos = db.getTodosJogosDisponiveis();
                    let msg = '📋 *Todos os Jogos Disponíveis*\n\n';
                    
                    let parteAtual = '';
                    const partes = [];
                    
                    for (const jogo of jogos) {
                        const linha = `• ${jogo.jogo} (${jogo.categoria})\n`;
                        if ((parteAtual + linha).length > 4000) {
                            partes.push(parteAtual);
                            parteAtual = linha;
                        } else {
                            parteAtual += linha;
                        }
                    }
                    partes.push(parteAtual);
                    
                    await sock.sendMessage(sender, { text: msg + partes[0] });
                    
                    for (let i = 1; i < partes.length; i++) {
                        await delay(1000);
                        await sock.sendMessage(sender, { text: partes[i] });
                    }

                } else if (text === '7') {
                    userStates.set(sender, { step: 'admin_broadcast' });
                    await sock.sendMessage(sender, {
                        text: '📢 *Broadcast*\n\nDigite a mensagem que será enviada para todos os clientes:\n\n_Exemplo: Novo jogo adicionado! Call of Duty Modern Warfare 3 já disponível!_'
                    });

                } else if (text === '0' || text === 'menu') {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });

                } else {
                    await sock.sendMessage(sender, { text: getMenuAdmin() });
                }
            }

            // ADMIN: ADICIONAR CONTA - PASSO 1 (NOME)
            else if (userState.step === 'admin_add_conta_nome' && isAdmin) {
                userStates.set(sender, { 
                    step: 'admin_add_conta_categoria',
                    tempConta: { jogo: text }
                });
                
                const categorias = [
                    '🗡️ Assassin\'s Creed',
                    '🔫 Call of Duty',
                    '🧟 Resident Evil',
                    '⚽ Esportes',
                    '🏎️ Corrida',
                    '🚗 Rockstar Games',
                    '🦸 Super-Heróis',
                    '⚔️ Soulslike',
                    '🐺 CD Projekt Red',
                    '🚜 Simuladores',
                    '👻 Terror',
                    '🎲 RPG',
                    '🥊 Luta',
                    '🕵️ Stealth',
                    '🧠 Estratégia',
                    '🌲 Survival',
                    '🍄 Nintendo',
                    '💙 Sega',
                    '💣 Guerra',
                    '🎮 Ação/Aventura'
                ];
                
                let msg = '➕ *Adicionar Conta - Passo 2/4*\n\nEscolha a *CATEGORIA*:\n\n';
                categorias.forEach((cat, index) => {
                    msg += `${index + 1}. ${cat}\n`;
                });
                msg += '\nDigite o número da categoria:';
                
                await sock.sendMessage(sender, { text: msg });
            }

            // ADMIN: ADICIONAR CONTA - PASSO 2 (CATEGORIA)
            else if (userState.step === 'admin_add_conta_categoria' && isAdmin) {
                const categorias = [
                    '🗡️ Assassin\'s Creed',
                    '🔫 Call of Duty',
                    '🧟 Resident Evil',
                    '⚽ Esportes',
                    '🏎️ Corrida',
                    '🚗 Rockstar Games',
                    '🦸 Super-Heróis',
                    '⚔️ Soulslike',
                    '🐺 CD Projekt Red',
                    '🚜 Simuladores',
                    '👻 Terror',
                    '🎲 RPG',
                    '🥊 Luta',
                    '🕵️ Stealth',
                    '🧠 Estratégia',
                    '🌲 Survival',
                    '🍄 Nintendo',
                    '💙 Sega',
                    '💣 Guerra',
                    '🎮 Ação/Aventura'
                ];
                
                const escolha = parseInt(text) - 1;
                
                if (escolha >= 0 && escolha < categorias.length) {
                    const temp = userState.tempConta || {};
                    temp.categoria = categorias[escolha];
                    
                    userStates.set(sender, { 
                        step: 'admin_add_conta_login',
                        tempConta: temp
                    });
                    
                    await sock.sendMessage(sender, {
                        text: '➕ *Adicionar Conta - Passo 3/4*\n\nDigite o *LOGIN* (usuário/email):'
                    });
                } else {
                    await sock.sendMessage(sender, {
                        text: '❌ Opção inválida. Digite um número de 1 a 20:'
                    });
                }
            }

            // ADMIN: ADICIONAR CONTA - PASSO 3 (LOGIN)
            else if (userState.step === 'admin_add_conta_login' && isAdmin) {
                const temp = userState.tempConta || {};
                temp.login = text;
                
                userStates.set(sender, { 
                    step: 'admin_add_conta_senha',
                    tempConta: temp
                });
                
                await sock.sendMessage(sender, {
                    text: '➕ *Adicionar Conta - Passo 4/4*\n\nDigite a *SENHA*:'
                });
            }

            // ADMIN: ADICIONAR CONTA - PASSO 4 (SENHA)
            else if (userState.step === 'admin_add_conta_senha' && isAdmin) {
                const temp = userState.tempConta || {};
                temp.senha = text;
                
                db.addConta(temp.jogo, temp.categoria, temp.login, temp.senha);
                
                userStates.set(sender, { step: 'admin_menu' });
                
                await sock.sendMessage(sender, {
                    text: `✅ *Conta adicionada com sucesso!*\n\n🎮 ${temp.jogo}\n📂 ${temp.categoria}\n👤 ${temp.login}\n\n✅ Conta compartilhada - todos podem usar!\n\nDigite *menu* para voltar ao painel admin.`
                });
            }

            // ADMIN: GERAR KEY NORMAL
            else if (userState.step === 'admin_gerar_key' && isAdmin) {
                let duracao, dias;
                
                if (text === '1') { duracao = '7 dias'; dias = 7; }
                else if (text === '2') { duracao = '1 mês'; dias = 30; }
                else if (text === '3') { duracao = 'Lifetime'; dias = 99999; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Opção inválida. Digite 1, 2 ou 3:' });
                    return;
                }
                
                const prefixo = 'NYUX';
                const sufixo = Math.random().toString(36).substring(2, 10).toUpperCase();
                const meio = Math.random().toString(36).substring(2, 6).toUpperCase();
                const key = `${prefixo}-${meio}-${sufixo}`;
                
                db.criarKey(key, duracao, dias);
                userStates.set(sender, { step: 'admin_menu' });
                
                await sock.sendMessage(sender, {
                    text: `🔑 *Key Gerada!*\n\n*Key:* ${key}\n*Duração:* ${duracao}\n*Status:* ✅ Ativa\n\nCopie e envie para o cliente.`
                });
            }

            // ADMIN: GERAR KEY TESTE
            else if (userState.step === 'admin_gerar_key_teste' && isAdmin) {
                let duracao, horas;
                
                if (text === '1') { duracao = '1 hora'; horas = 1; }
                else if (text === '2') { duracao = '2 horas'; horas = 2; }
                else if (text === '3') { duracao = '6 horas'; horas = 6; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Opção inválida. Digite 1, 2 ou 3:' });
                    return;
                }
                
                const prefixo = 'TESTE';
                const sufixo = Math.random().toString(36).substring(2, 8).toUpperCase();
                const meio = Math.random().toString(36).substring(2, 6).toUpperCase();
                const key = `${prefixo}-${meio}-${sufixo}`;
                
                db.criarKey(key, duracao, horas, true);
                userStates.set(sender, { step: 'admin_menu' });
                
                await sock.sendMessage(sender, {
                    text: `🎁 *Key Teste Gerada (Admin)!*\n\n*Key:* ${key}\n*Duração:* ${duracao}\n*Status:* ✅ Ativa\n\nEnvie para o cliente testar.`
                });
            }

            // ADMIN: IMPORTAR TXT
            else if (userState.step === 'admin_importar' && isAdmin) {
                if (msg.message.documentMessage) {
                    await sock.sendMessage(sender, { text: '⏳ Processando arquivo...' });
                    
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
                            text: `✅ *Importação Concluída!*\n\n📊 ${resultado.adicionadas} contas adicionadas\n🎮 ${resultado.jogosUnicos} jogos únicos\n📂 ${resultado.categorias} categorias\n❌ ${resultado.erros} erros\n\n✅ Todas as contas são compartilhadas (ilimitadas)!\n\nResumo por categoria:\n${resultado.resumoCategorias}`
                        });
                        
                    } catch (err) {
                        await sock.sendMessage(sender, {
                            text: '❌ Erro ao processar arquivo. Certifique-se de que é um .txt válido.'
                        });
                    }
                } else {
                    await sock.sendMessage(sender, {
                        text: '📄 Aguardando arquivo .txt...\n\nEnvie o arquivo com as contas.'
                    });
                }
            }

            // ADMIN: BROADCAST
            else if (userState.step === 'admin_broadcast' && isAdmin) {
                const clientes = db.getTodosClientes();
                let enviados = 0;
                
                await sock.sendMessage(sender, {
                    text: `📢 Enviando para ${clientes.length} clientes...`
                });
                
                for (const cliente of clientes) {
                    try {
                        await sock.sendMessage(cliente.numero, {
                            text: `📢 *Mensagem da NyuxStore*\n\n${text}\n\n_Digite menu para ver opções_`
                        });
                        enviados++;
                        await delay(1000);
                    } catch (e) {
                        console.log('Erro ao enviar para:', cliente.numero);
                    }
                }
                
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, {
                    text: `✅ *Broadcast enviado!*\n\n📤 ${enviados}/${clientes.length} mensagens entregues.`
                });
            }

            // COMANDO MENU (qualquer momento)
            if (text === 'menu' || text === 'voltar') {
                userStates.set(sender, { step: 'menu' });
                
                // Verifica se teste expirou para mostrar menu correto
                const perfilAtual = db.getPerfil(sender);
                if (perfilAtual.usouTeste && !perfilAtual.temAcesso && !isAdmin) {
                    await sock.sendMessage(sender, { 
                        text: getMenuTesteExpirado(pushName)
                    });
                } else {
                    await sock.sendMessage(sender, { 
                        text: getMenuPrincipal(pushName)
                    });
                }
            }

        } catch (error) {
            console.error('Erro:', error);
            await sock.sendMessage(sender, {
                text: '❌ Ocorreu um erro. Digite *menu* para recomeçar.'
            });
        }
    });

    return sock;
}

// Iniciar
console.log('🚀 Iniciando NyuxStore WhatsApp...');
console.log('🤖 Bot Number:', BOT_NUMBER);
console.log('👑 Admin Number:', ADMIN_NUMBER);
connectToWhatsApp();
