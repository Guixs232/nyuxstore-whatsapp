const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    delay 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const Database = require('./database');
const moment = require('moment');

// Configurações
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '5511915473617'; // Seu número com código do país
const STORE_NAME = 'NyuxStore';

const db = new Database();

// Estados dos usuários
const userStates = new Map();

// Categorias automáticas
function detectarCategoria(nomeJogo) {
    const jogo = nomeJogo.toLowerCase();
    
    if (/corrida|forza|speed|nfs|truck|f1|grid|motorsport/.test(jogo)) return '🏎️ Corrida';
    if (/call of duty|cod|cs|battlefield|war|tiro|fps|shooter|valorant/.test(jogo)) return '🔫 FPS/Tiro';
    if (/assassin|witcher|elden|souls|rpg|final fantasy|dragon|skyrim|fallout/.test(jogo)) return '⚔️ RPG/Aventura';
    if (/resident evil|horror|fear|terror|evil|dead|silent hill|outlast/.test(jogo)) return '👻 Terror';
    if (/fifa|pes|nba|esporte|football|soccer|nfl|ufc|wwe/.test(jogo)) return '⚽ Esportes';
    if (/simulator|simulation|tycoon|manager|tycoon|city|farming/.test(jogo)) return '🏗️ Simulador';
    if (/lego|minecraft|cartoon|sonic|mario|party/.test(jogo)) return '🎮 Casual/Família';
    if (/gta|red dead|mafia|saints|gangster|crime/.test(jogo)) return '🚔 Mundo Aberto/Ação';
    if (/strategy|strategy|xcom|civilization|age of|total war/.test(jogo)) return '🧠 Estratégia';
    
    return '🎯 Ação/Aventura';
}

// Gerar Key
function gerarKey(duracao) {
    const prefixo = 'NYUX';
    const sufixo = Math.random().toString(36).substring(2, 10).toUpperCase();
    const meio = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefixo}-${meio}-${sufixo}`;
}

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
3️⃣ *Importar Contas (TXT)* 📁
4️⃣ *Estatísticas* 📊
5️⃣ *Listar Jogos* 📋
6️⃣ *Broadcast* 📢

0️⃣ *Voltar ao Menu*

_Digite o número da opção_
`;
}

// Conectar ao WhatsApp
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['NyuxStore Bot', 'Chrome', '1.0']
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 Escaneie o QR Code acima com seu WhatsApp');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexão fechada. Reconectando:', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Bot conectado ao WhatsApp!');
            console.log('📱 Número:', sock.user.id.split(':')[0]);
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
        
        // Ignora grupos (só responde no privado)
        if (isGroup) return;

        let text = '';
        if (msg.message.conversation) {
            text = msg.message.conversation;
        } else if (msg.message.extendedTextMessage) {
            text = msg.message.extendedTextMessage.text;
        } else if (msg.message.buttonsResponseMessage) {
            text = msg.message.buttonsResponseMessage.selectedButtonId;
        } else if (msg.message.listResponseMessage) {
            text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        }

        text = text.toLowerCase().trim();
        
        console.log(`📩 ${pushName}: ${text}`);

        // Verifica se é admin
        const numeroLimpo = sender.replace('@s.whatsapp.net', '').replace('@g.us', '');
        const isAdmin = numeroLimpo === ADMIN_NUMBER.replace(/\D/g, '');

        // Estado atual do usuário
        const userState = userStates.get(sender) || { step: 'menu' };

        try {
            // MENU PRINCIPAL
            if (userState.step === 'menu') {
                if (text === '1' || text.includes('comprar')) {
                    await sock.sendMessage(sender, {
                        text: `💳 *Comprar Key*\n\nPara comprar uma key, faça o pagamento via:\n\n• Pix\n• Transferência\n• Cartão\n\n💰 *Valores:*\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• 1 ano: R$ 80\n• Lifetime: R$ 150\n\n💬 Chame o admin: ${ADMIN_NUMBER}`
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
                            text: '❌ *Acesso Negado*\n\nVocê precisa de uma key ativa!\n\nDigite *2* para resgatar sua key.'
                        });
                        return;
                    }
                    userStates.set(sender, { step: 'buscar_jogo' });
                    await sock.sendMessage(sender, {
                        text: '🔍 *Buscar Jogo*\n\nDigite o nome do jogo que deseja:\n\n_Exemplo: GTA 5, Minecraft, FIFA..._'
                    });

                } else if (text === '4' || text.includes('jogos') || text.includes('lista')) {
                    const categorias = db.getCategoriasResumo();
                    let msg = '📋 *Categorias de Jogos*\n\n';
                    
                    for (const [cat, total] of Object.entries(categorias)) {
                        msg += `${cat}: *${total} jogos*\n`;
                    }
                    
                    msg += `\n🎮 *Total: ${db.getTotalJogos()} jogos*\n\nPara ver todos os jogos de uma categoria, digite o nome da categoria.`;
                    
                    await sock.sendMessage(sender, { text: msg });

                } else if (text === '5' || text.includes('perfil')) {
                    const perfil = db.getPerfil(sender);
                    let msg = '👤 *Seu Perfil*\n\n';
                    msg += `📱 Número: ${numeroLimpo}\n`;
                    msg += `⏰ Acesso: ${perfil.temAcesso ? '✅ Ativo' : '❌ Inativo'}\n`;
                    
                    if (perfil.keyInfo) {
                        msg += `🔑 Key: ${perfil.keyInfo.key}\n`;
                        msg += `📅 Expira: ${perfil.keyInfo.expira}\n`;
                    }
                    
                    msg += `\n🎮 Jogos resgatados: ${perfil.totalResgatados}`;
                    await sock.sendMessage(sender, { text: msg });

                } else if (text === '0' || text.includes('atendente')) {
                    await sock.sendMessage(sender, {
                        text: `💬 *Falar com Atendente*\n\nAguarde um momento... \n\nOu chame direto: ${ADMIN_NUMBER}`
                    });
                    // Notifica admin
                    await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                        text: `📞 *Novo Atendimento*\n\nCliente: ${pushName}\nNúmero: ${numeroLimpo}\n\nEstá aguardando atendimento.`
                    });

                } else if (isAdmin && (text === 'admin' || text === 'adm')) {
                    userStates.set(sender, { step: 'admin_menu' });
                    await sock.sendMessage(sender, { text: getMenuAdmin() });

                } else {
                    await sock.sendMessage(sender, { 
                        text: getMenuPrincipal(pushName),
                        footer: 'NyuxStore © 2024'
                    });
                }
            }

            // RESGATAR KEY
            else if (userState.step === 'resgatar_key') {
                const key = text.toUpperCase().replace(/\s/g, '');
                const resultado = db.resgatarKey(key, sender, pushName);
                
                if (resultado.sucesso) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, {
                        text: `✅ *Key Resgatada com Sucesso!*\n\n🏆 Plano: ${resultado.plano}\n⏰ Duração: ${resultado.duracao}\n📅 Expira em: ${resultado.expira}\n\nAgora você pode:\n• Buscar jogos (opção 3)\n• Ver lista de jogos (opção 4)\n\n🎮 Aproveite!`
                    });
                } else {
                    await sock.sendMessage(sender, {
                        text: `❌ *Key Inválida*\n\n${resultado.erro}\n\nTente novamente ou digite *menu* para voltar.`
                    });
                }
            }

            // BUSCAR JOGO
            else if (userState.step === 'buscar_jogo') {
                const conta = db.buscarConta(text);
                
                if (conta) {
                    db.marcarContaUsada(conta.id, sender);
                    userStates.set(sender, { step: 'menu' });
                    
                    await sock.sendMessage(sender, {
                        text: `🎮 *Conta Encontrada!*\n\n*Jogo:* ${conta.jogo}\n*Categoria:* ${conta.categoria}\n\n👤 *Login:* ${conta.login}\n🔒 *Senha:* ${conta.senha}\n\n⚠️ *IMPORTANTE:*\n1. Faça login na Steam\n2. Baixe o jogo\n3. Ative o *MODO OFFLINE*\n4. Jogue!\n\n🔒 Não altere a senha!\n\nDigite *menu* para voltar.`
                    });
                } else {
                    await sock.sendMessage(sender, {
                        text: `❌ *Jogo não encontrado*\n\nNão temos "${text}" disponível no momento.\n\nDigite *4* para ver a lista de jogos ou tente outro nome.`
                    });
                }
            }

            // MENU ADMIN
            else if (userState.step === 'admin_menu' && isAdmin) {
                if (text === '1') {
                    userStates.set(sender, { step: 'admin_add_conta' });
                    await sock.sendMessage(sender, {
                        text: '➕ *Adicionar Conta*\n\nEnvie os dados no formato:\n\nJogo | Categoria | Login | Senha\n\n_Exemplo:_\nGTA 5 | Mundo Aberto | usuario123 | senha456'
                    });

                } else if (text === '2') {
                    userStates.set(sender, { step: 'admin_gerar_key' });
                    await sock.sendMessage(sender, {
                        text: '🔑 *Gerar Key*\n\nEscolha a duração:\n\n1️⃣ 7 dias\n2️⃣ 1 mês  \n3️⃣ 1 ano\n4️⃣ Lifetime\n\nDigite o número:'
                    });

                } else if (text === '3') {
                    userStates.set(sender, { step: 'admin_importar' });
                    await sock.sendMessage(sender, {
                        text: '📁 *Importar Contas*\n\nEnvie o arquivo .txt com as contas.\n\nO sistema detectará automaticamente:\n• Nome do jogo\n• Login e senha\n• Categoria\n\nAguardando arquivo...'
                    });

                } else if (text === '4') {
                    const stats = db.getEstatisticas();
                    await sock.sendMessage(sender, {
                        text: `📊 *Estatísticas*\n\n🎮 Total de Jogos: ${stats.totalJogos}\n✅ Disponíveis: ${stats.disponiveis}\n❌ Usados: ${stats.usados}\n🔑 Keys Ativas: ${stats.keysAtivas}\n👥 Clientes: ${stats.totalClientes}\n📂 Categorias: ${stats.totalCategorias}`
                    });

                } else if (text === '5') {
                    const jogos = db.getTodosJogos();
                    let msg = '📋 *Todos os Jogos*\n\n';
                    
                    // Divide em partes se for muito grande
                    const partes = [];
                    let parteAtual = '';
                    
                    for (const jogo of jogos) {
                        const linha = `• ${jogo.nome} (${jogo.categoria}) - ${jogo.status}\n`;
                        if ((parteAtual + linha).length > 4000) {
                            partes.push(parteAtual);
                            parteAtual = linha;
                        } else {
                            parteAtual += linha;
                        }
                    }
                    partes.push(parteAtual);
                    
                    // Envia primeira parte
                    await sock.sendMessage(sender, { text: msg + partes[0] });
                    
                    // Envia restante se houver
                    for (let i = 1; i < partes.length; i++) {
                        await delay(1000);
                        await sock.sendMessage(sender, { text: partes[i] });
                    }

                } else if (text === '6') {
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

            // ADMIN: ADICIONAR CONTA
            else if (userState.step === 'admin_add_conta' && isAdmin) {
                const partes = text.split('|').map(p => p.trim());
                
                if (partes.length >= 4) {
                    const [jogo, categoria, login, senha] = partes;
                    const catFinal = categoria || detectarCategoria(jogo);
                    
                    db.addConta(jogo, catFinal, login, senha);
                    userStates.set(sender, { step: 'admin_menu' });
                    
                    await sock.sendMessage(sender, {
                        text: `✅ *Conta adicionada!*\n\n🎮 ${jogo}\n📂 ${catFinal}\n👤 ${login}\n\nDigite *menu* para voltar ao painel admin.`
                    });
                } else {
                    await sock.sendMessage(sender, {
                        text: '❌ Formato inválido!\n\nUse: Jogo | Categoria | Login | Senha\n\nTente novamente:'
                    });
                }
            }

            // ADMIN: GERAR KEY
            else if (userState.step === 'admin_gerar_key' && isAdmin) {
                let duracao, dias;
                
                if (text === '1') { duracao = '7 dias'; dias = 7; }
                else if (text === '2') { duracao = '1 mês'; dias = 30; }
                else if (text === '3') { duracao = '1 ano'; dias = 365; }
                else if (text === '4') { duracao = 'Lifetime'; dias = 99999; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Opção inválida. Digite 1, 2, 3 ou 4:' });
                    return;
                }
                
                const key = gerarKey(duracao);
                db.criarKey(key, duracao, dias);
                userStates.set(sender, { step: 'admin_menu' });
                
                await sock.sendMessage(sender, {
                    text: `🔑 *Key Gerada!*\n\n*Key:* ${key}\n*Duração:* ${duracao}\n*Status:* ✅ Ativa\n\nCopie e envie para o cliente.`
                });
            }

            // ADMIN: IMPORTAR TXT
            else if (userState.step === 'admin_importar' && isAdmin) {
                // Verifica se é documento
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
                            text: `✅ *Importação Concluída!*\n\n📊 ${resultado.adicionadas} contas adicionadas\n🎮 ${resultado.jogosUnicos} jogos únicos\n📂 ${resultado.categorias} categorias\n❌ ${resultado.erros} erros\n\nResumo por categoria:\n${resultado.resumoCategorias}`
                        });
                        
                    } catch (err) {
                        await sock.sendMessage(sender, {
                            text: '❌ Erro ao processar arquivo. Certifique-se de que é um .txt válido.'
                        });
                    }
                } else {
                    await sock.sendMessage(sender, {
                        text: '📁 Aguardando arquivo .txt...\n\nEnvie o arquivo com as contas.'
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
                        await delay(500); // Evita flood
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
                await sock.sendMessage(sender, { 
                    text: getMenuPrincipal(pushName),
                    footer: 'NyuxStore © 2024'
                });
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
connectToWhatsApp();
