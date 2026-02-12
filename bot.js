const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const Database = require('./database');
const moment = require('moment');

// Configurações
const ADMIN_NUMBER = '5518997972598'; // Seu número (acesso admin)
const BOT_NUMBER = '556183040115';    // Número do bot
const STORE_NAME = 'NyuxStore';

const db = new Database();
const userStates = new Map();

// Detectar categoria
function detectarCategoria(nomeJogo) {
    const jogo = nomeJogo.toLowerCase();
    if (/corrida|forza|speed|nfs|truck|f1|grid/.test(jogo)) return '🏎️ Corrida';
    if (/call of duty|cod|cs|battlefield|war|tiro|fps/.test(jogo)) return '🔫 FPS/Tiro';
    if (/assassin|witcher|elden|souls|rpg|final fantasy/.test(jogo)) return '⚔️ RPG/Aventura';
    if (/resident evil|horror|fear|terror|evil|dead/.test(jogo)) return '👻 Terror';
    if (/fifa|pes|nba|esporte|football/.test(jogo)) return '⚽ Esportes';
    if (/simulator|simulation|tycoon|manager/.test(jogo)) return '🏗️ Simulador';
    if (/lego|minecraft|cartoon/.test(jogo)) return '🎮 Casual/Família';
    if (/gta|red dead|mafia|saints/.test(jogo)) return '🚔 Mundo Aberto';
    return '🎯 Ação/Aventura';
}

// Gerar Key
function gerarKey() {
    const prefixo = 'NYUX';
    const meio = Math.random().toString(36).substring(2, 6).toUpperCase();
    const sufixo = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `${prefixo}-${meio}-${sufixo}`;
}

// Menus
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

0️⃣ *Falar com Atendente* 💬

_Digite o número da opção_`;
}

function getMenuAdmin() {
    return `
🔧 *PAINEL ADMIN - ${STORE_NAME}*

*Escolha uma opção:*

1️⃣ *Adicionar Conta* ➕
2️⃣ *Gerar Key* 🔑
3️⃣ *Importar Contas (TXT)* 📁
4️⃣ *Estatísticas* 📊
5️⃣ *Listar Jogos* 📋
6️⃣ *Broadcast* 📢

0️⃣ *Voltar ao Menu*`;
}

// Conectar
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

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
            console.log('📱 Escaneie o QR Code com o número: +', BOT_NUMBER);
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Bot online!');
            console.log('🤖 Número do Bot:', sock.user.id.split(':')[0]);
            console.log('📱 Número configurado:', BOT_NUMBER);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Processar mensagens de TODOS que enviarem para o bot
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        const pushName = msg.pushName || 'Cliente';

        // Ignora grupos - só responde no privado
        if (isGroup) return;

        // Extrai texto
        let text = '';
        if (msg.message.conversation) text = msg.message.conversation;
        else if (msg.message.extendedTextMessage) text = msg.message.extendedTextMessage.text;
        else if (msg.message.documentMessage) text = '[documento]';
        else if (msg.message.imageMessage) text = '[imagem]';

        text = text.toLowerCase().trim();

        const numeroLimpo = sender.replace('@s.whatsapp.net', '');
        
        // Verifica se é admin (seu número pessoal)
        const isAdmin = numeroLimpo === ADMIN_NUMBER;

        const userState = userStates.get(sender) || { step: 'menu' };

        console.log(`📩 ${pushName} (${numeroLimpo}): ${text.substring(0, 30)}... | Admin: ${isAdmin}`);

        try {
            // Saudações iniciais
            if (['oi', 'ola', 'olá', 'hey', 'eai', 'eae', 'bom dia', 'boa tarde', 'boa noite', 'hi', 'hello'].includes(text)) {
                await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                return;
            }

            // MENU PRINCIPAL (todos podem usar)
            if (userState.step === 'menu') {
                switch(text) {
                    case '1':
                        await sock.sendMessage(sender, {
                            text: `💳 *Comprar Key*\n\n💰 *Valores:*\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• 1 ano: R$ 80\n• Lifetime: R$ 150\n\n📱 Chame: wa.me/${ADMIN_NUMBER}`
                        });
                        break;

                    case '2':
                        userStates.set(sender, { step: 'resgatar_key' });
                        await sock.sendMessage(sender, {
                            text: '🎁 *Resgatar Key*\n\nDigite sua key:\n_Exemplo: NYUX-AB12-CD34_'
                        });
                        break;

                    case '3':
                        const temAcesso = db.verificarAcesso(sender);
                        if (!temAcesso) {
                            await sock.sendMessage(sender, {
                                text: '❌ *Acesso Negado*\n\nVocê precisa de uma key ativa!\n\n💡 Digite *2* para resgatar sua key.\n💳 Digite *1* para comprar.'
                            });
                            return;
                        }
                        userStates.set(sender, { step: 'buscar_jogo' });
                        await sock.sendMessage(sender, {
                            text: '🔍 *Buscar Jogo*\n\nDigite o nome do jogo que deseja:\n_Ex: GTA 5, Minecraft, FIFA..._'
                        });
                        break;

                    case '4':
                        const cats = db.getCategoriasResumo();
                        let msg = '📋 *Categorias de Jogos*\n\n';
                        for (const [cat, total] of Object.entries(cats)) {
                            msg += `${cat}: *${total} jogos*\n`;
                        }
                        msg += `\n🎮 *Total: ${db.getTotalJogos()} jogos*\n\n💡 Digite *3* para buscar um jogo específico.`;
                        await sock.sendMessage(sender, { text: msg });
                        break;

                    case '5':
                        const perfil = db.getPerfil(sender);
                        let perfilMsg = '👤 *Seu Perfil*\n\n';
                        perfilMsg += `📱 Número: ${numeroLimpo}\n`;
                        perfilMsg += `⏰ Acesso: ${perfil.temAcesso ? '✅ Ativo' : '❌ Inativo'}\n`;
                        if (perfil.keyInfo) {
                            perfilMsg += `🔑 Key: ${perfil.keyInfo.key}\n`;
                            perfilMsg += `📅 Expira: ${perfil.keyInfo.expira}\n`;
                        }
                        perfilMsg += `🎮 Jogos resgatados: ${perfil.totalResgatados}\n\n`;
                        perfilMsg += `_Digite *menu* para voltar_`;
                        await sock.sendMessage(sender, { text: perfilMsg });
                        break;

                    case '0':
                        await sock.sendMessage(sender, {
                            text: `💬 *Falar com Atendente*\n\nAguarde um momento...\n\nOu chame direto: wa.me/${ADMIN_NUMBER}`
                        });
                        // Notifica admin
                        await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                            text: `📞 *Novo Atendimento*\n\n👤 Nome: ${pushName}\n📱 Número: ${numeroLimpo}\n💬 Mensagem: ${text}\n\nO cliente está aguardando no bot.`
                        });
                        break;

                    case 'admin':
                    case 'adm':
                        if (!isAdmin) {
                            await sock.sendMessage(sender, { 
                                text: '❌ *Acesso negado!*\n\nEste comando é apenas para administradores.\n\n_Digite *menu* para ver suas opções._' 
                            });
                            return;
                        }
                        userStates.set(sender, { step: 'admin_menu' });
                        await sock.sendMessage(sender, { text: getMenuAdmin() });
                        break;

                    default:
                        await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                }
            }

            // RESGATAR KEY (todos podem)
            else if (userState.step === 'resgatar_key') {
                const key = text.toUpperCase().replace(/\s/g, '');
                
                if (!key.startsWith('NYUX')) {
                    await sock.sendMessage(sender, { 
                        text: '❌ *Key inválida!*\n\nFormato correto: NYUX-XXXX-XXXX\n\nTente novamente ou digite *menu*:' 
                    });
                    return;
                }
                
                const resultado = db.resgatarKey(key, sender, pushName);
                
                if (resultado.sucesso) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, {
                        text: `✅ *Key Resgatada com Sucesso!*\n\n🏆 Plano: ${resultado.plano}\n⏰ Duração: ${resultado.duracao}\n📅 Expira em: ${resultado.expira}\n\n🎮 Agora você pode buscar jogos!\n\nDigite *3* para começar.`
                    });
                } else {
                    await sock.sendMessage(sender, {
                        text: `❌ *${resultado.erro}*\n\nVerifique se digitou corretamente ou digite *menu*:`
                    });
                }
            }

            // BUSCAR JOGO (todos com acesso podem)
            else if (userState.step === 'buscar_jogo') {
                if (text.length < 3) {
                    await sock.sendMessage(sender, { 
                        text: '❌ Digite pelo menos 3 letras!\n\nTente novamente:' 
                    });
                    return;
                }
                
                const conta = db.buscarConta(text);
                
                if (conta) {
                    db.marcarContaUsada(conta.id, sender);
                    userStates.set(sender, { step: 'menu' });
                    
                    await sock.sendMessage(sender, {
                        text: `🎮 *${conta.jogo}*\n📂 ${conta.categoria}\n\n👤 *Login:* \`${conta.login}\`\n🔒 *Senha:* \`${conta.senha}\`\n\n⚠️ *IMPORTANTE:*\n1️⃣ Faça login na Steam\n2️⃣ Baixe o jogo\n3️⃣ Ative *MODO OFFLINE*\n4️⃣ Jogue!\n\n🔒 *Não altere a senha!*\n⏰ Conta válida por 24h\n\n_Digite *menu* para voltar_`
                    });
                } else {
                    await sock.sendMessage(sender, {
                        text: `❌ *"${text}" não encontrado*\n\nTente outro nome ou digite *4* para ver a lista completa.`
                    });
                }
            }

            // MENU ADMIN (somente seu número)
            else if (userState.step === 'admin_menu') {
                if (!isAdmin) {
                    await sock.sendMessage(sender, { 
                        text: '❌ *Acesso negado!*\n\nVocê não tem permissão para acessar o painel admin.' 
                    });
                    userStates.set(sender, { step: 'menu' });
                    return;
                }

                switch(text) {
                    case '1':
                        userStates.set(sender, { step: 'admin_add' });
                        await sock.sendMessage(sender, {
                            text: '➕ *Adicionar Conta*\n\nFormato:\n`Jogo | Categoria | Login | Senha`\n\nOu deixe auto:\n`Jogo | auto | Login | Senha`\n\n_Exemplo: GTA 5 | auto | user123 | pass456_'
                        });
                        break;

                    case '2':
                        userStates.set(sender, { step: 'admin_key' });
                        await sock.sendMessage(sender, {
                            text: '🔑 *Gerar Key*\n\nEscolha:\n\n1️⃣ 7 dias - R$ 10\n2️⃣ 1 mês - R$ 25\n3️⃣ 1 ano - R$ 80\n4️⃣ Lifetime - R$ 150\n\nDigite o número:'
                        });
                        break;

                    case '3':
                        userStates.set(sender, { step: 'admin_import' });
                        await sock.sendMessage(sender, {
                            text: '📁 *Importar Contas*\n\nEnvie o arquivo .txt com as contas Steam.\n\nO bot detectará automaticamente:\n• Nome do jogo\n• Login e senha\n• Categoria\n\n_Aguarde o arquivo..._'
                        });
                        break;

                    case '4':
                        const stats = db.getEstatisticas();
                        await sock.sendMessage(sender, {
                            text: `📊 *Estatísticas*\n\n🎮 Total Jogos: ${stats.totalJogos}\n✅ Disponíveis: ${stats.disponiveis}\n❌ Usados: ${stats.usados}\n🔑 Keys Ativas: ${stats.keysAtivas}\n👥 Clientes: ${stats.totalClientes}\n📂 Categorias: ${stats.totalCategorias}\n\n_Digite *menu* para voltar_`
                        });
                        break;

                    case '5':
                        const total = db.getTotalJogos();
                        const disponiveis = db.getCategoriasResumo();
                        let lista = `📋 *Total: ${total} jogos*\n\n`;
                        for (const [cat, qtd] of Object.entries(disponiveis)) {
                            lista += `${cat}: ${qtd}\n`;
                        }
                        await sock.sendMessage(sender, { text: lista });
                        break;

                    case '6':
                        userStates.set(sender, { step: 'admin_broadcast' });
                        await sock.sendMessage(sender, {
                            text: '📢 *Broadcast*\n\nDigite a mensagem que será enviada para todos os clientes:\n\n_Ex: 🎉 Novo jogo: Elden Ring adicionado!_'
                        });
                        break;

                    case '0':
                    case 'menu':
                        userStates.set(sender, { step: 'menu' });
                        await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                        break;

                    default:
                        await sock.sendMessage(sender, { text: getMenuAdmin() });
                }
            }

            // ADMIN: Adicionar conta
            else if (userState.step === 'admin_add') {
                if (!isAdmin) return;
                
                const partes = text.split('|').map(p => p.trim());
                if (partes.length >= 4) {
                    const [jogo, cat, login, senha] = partes;
                    const categoria = (cat === 'auto' || !cat) ? detectarCategoria(jogo) : cat;
                    
                    db.addConta(jogo, categoria, login, senha);
                    userStates.set(sender, { step: 'admin_menu' });
                    await sock.sendMessage(sender, { 
                        text: `✅ *Conta adicionada!*\n\n🎮 ${jogo}\n📂 ${categoria}\n\n_Digite *menu* ou envie outra conta._` 
                    });
                } else {
                    await sock.sendMessage(sender, { 
                        text: '❌ Formato inválido!\n\nUse: `Jogo | Categoria | Login | Senha`' 
                    });
                }
            }

            // ADMIN: Gerar key
            else if (userState.step === 'admin_key') {
                if (!isAdmin) return;
                
                const opcoes = {
                    '1': ['7 dias', 7],
                    '2': ['1 mês', 30],
                    '3': ['1 ano', 365],
                    '4': ['Lifetime', 99999]
                };
                
                if (!opcoes[text]) {
                    await sock.sendMessage(sender, { text: '❌ Digite 1, 2, 3 ou 4' });
                    return;
                }
                
                const [duracao, dias] = opcoes[text];
                const key = gerarKey();
                db.criarKey(key, duracao, dias);
                
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, {
                    text: `🔑 *Key Gerada*\n\n\`\`\`${key}\`\`\`\n⏰ ${duracao}\n\n✅ Copie e envie ao cliente!`
                });
            }

            // ADMIN: Importar
            else if (userState.step === 'admin_import') {
                if (!isAdmin) return;
                
                if (msg.message.documentMessage) {
                    await sock.sendMessage(sender, { text: '⏳ *Processando arquivo...*' });
                    
                    try {
                        const stream = await sock.downloadContentFromMessage(msg.message.documentMessage, 'document');
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                        
                        const resultado = db.importarTXT(buffer.toString('utf-8'));
                        userStates.set(sender, { step: 'admin_menu' });
                        
                        await sock.sendMessage(sender, {
                            text: `✅ *Importação Concluída!*\n\n📊 ${resultado.adicionadas} contas\n🎮 ${resultado.jogosUnicos} jogos únicos\n📂 ${resultado.categorias} categorias\n❌ ${resultado.erros} erros\n\n*Resumo:*\n${resultado.resumoCategorias}`
                        });
                    } catch (err) {
                        console.error('Erro importação:', err);
                        await sock.sendMessage(sender, { text: '❌ Erro ao processar arquivo!' });
                    }
                } else {
                    await sock.sendMessage(sender, { text: '📁 Envie o arquivo .txt (não digite nada)' });
                }
            }

            // ADMIN: Broadcast
            else if (userState.step === 'admin_broadcast') {
                if (!isAdmin) return;
                
                const clientes = db.getTodosClientes();
                if (clientes.length === 0) {
                    userStates.set(sender, { step: 'admin_menu' });
                    await sock.sendMessage(sender, { text: '❌ Nenhum cliente cadastrado.' });
                    return;
                }
                
                await sock.sendMessage(sender, { text: `📢 Enviando para ${clientes.length} clientes...` });
                
                let enviados = 0;
                for (const cliente of clientes) {
                    try {
                        await sock.sendMessage(cliente.numero, { 
                            text: `📢 *NyuxStore*\n\n${text}\n\n_Digite *menu* para opções_` 
                        });
                        enviados++;
                        await delay(500);
                    } catch (e) { console.log('Erro envio:', cliente.numero); }
                }
                
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, { text: `✅ Enviado para ${enviados}/${clientes.length} clientes!` });
            }

            // Voltar ao menu
            if (text === 'menu' || text === 'voltar' || text === 'sair') {
                userStates.set(sender, { step: 'menu' });
                await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
            }

        } catch (error) {
            console.error('❌ Erro:', error);
            await sock.sendMessage(sender, { text: '❌ Erro! Digite *menu* para recomeçar.' });
        }
    });

    return sock;
}

console.log('🚀 NyuxStore WhatsApp');
console.log('🤖 Bot:', BOT_NUMBER);
console.log('👤 Admin:', ADMIN_NUMBER);
connectToWhatsApp();
