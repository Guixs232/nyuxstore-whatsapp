import { 
    default as makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion 
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import Database from './database.js';
import moment from 'moment';

// Configurações
const ADMIN_NUMBER = '5518997972598';
const BOT_NUMBER = '556183040115';
const STORE_NAME = 'NyuxStore';

const db = new Database();
const userStates = new Map();

// Detectar categoria automaticamente
function detectarCategoria(nomeJogo) {
    const jogo = nomeJogo.toLowerCase();
    
    // Corrida
    if (/forza|need for speed|nfs|f1|formula 1|grid|dirt|rally|crew|horizon|trackmania|beamng|assetto|iracing|project cars|wreckfest|hot wheels|burnout|midnight club|test drive|flatout|motorstorm|driveclub|the crew|forza horizon|forza motorsport|gran turismo|gt sport|gt7|wrc|v-rally|colin mcrae|sebastien loeb|dirt rally|f1 202|f1 2023|f1 2024|f1 22|f1 23|f1 24|automobilista|race|speed|corrida|car|moto|moto gp|ride| TT| Tourist Trophy| motogp/.test(jogo)) return '🏎️ Corrida';
    
    // FPS/Tiro
    if (/call of duty|cod|cod mw|cod bo|modern warfare|black ops|warzone|cold war|vanguard|mw2|mw3|bo2|bo3|bo4|csgo|cs 2|counter strike|valorant|apex|apex legends|fortnite|pubg|battlefield|bf1|bf4|bf5|bf2042|hardline|titanfall|overwatch|rainbow six|siege|destiny|halo|gears of war|doom|wolfenstein|borderlands|far cry|crysis|metro|stalker|dayz|escape from tarkov|eft|rust|ark|battle royale|shooter|fps|tiro|arma|arma 3|arma 2|squad|hell let loose|post scriptum|enlisted|war thunder|world of tanks|wot|world of warships|crossout/.test(jogo)) return '🔫 FPS/Tiro';
    
    // RPG/Aventura
    if (/elden ring|dark souls|demon souls|bloodborne|sekiro|soulslike|witcher|witcher 3|cyberpunk|skyrim|elder scrolls|oblivion|morrowind|fallout|fallout 4|fallout new vegas|mass effect|dragon age|divinity|baldur|baldur's gate|pathfinder|pillars of eternity|tyranny|outer worlds|avowed|starfield|no man's sky|subnautica|subnautica below zero|monster hunter|monster hunter world|monster hunter rise|dauntless|god of war|gow ragnarok|horizon|horizon zero dawn|horizon forbidden west|ghost of tsushima|assassin|assassin's creed|ac valhalla|ac odyssey|ac origins|ac unity|ac syndicate|ac black flag|ac revelations|ac brotherhood|ac 2|ac 3|ac mirage|red dead|rdr2|rdr 2|red dead redemption|red dead online|gta 5|gta v|gta online|watch dogs|legion|watch dogs 2|wd2|saints row|mafia|mafia 2|mafia 3|mafia definitive|sleeping dogs|true crime|yakuza|like a dragon|judgment|lost judgment|final fantasy|ff7|ff14|ffxiv|ff16|chrono trigger|chrono cross|dragon quest|dq11|dq 11|ni no kuni|tales of|tales of arise|persona|persona 5|p5|p5r|persona 4|p4g|persona 3|p3p|shin megami tensei|smt|soul hackers|metaphor|refantazio|star ocean|valkyrie profile|valkyria chronicles|atelier|ys|trails of cold steel|trails in the sky|legend of heroes|disgaea|la pucelle|phantom brave|soul nomad|z.hp|guided fate paradox|the witch and the hundred knight|revue starlight|sakura wars|sakura taisen|sakura wars|sakura taisen|sakura/.test(jogo)) return '⚔️ RPG/Aventura';
    
    // Terror
    if (/resident evil|re2|re3|re4|re5|re6|re7|re8|re village|biohazard|silent hill|sh2|sh3|sh4|silent hill 2|silent hill 3|dead space|ds1|ds2|ds3|dead space remake|alien isolation|outlast|outlast 2|amnesia|soma|layers of fear|blair witch|evil within|evil within 2|the evil within|darkwood|dont starve|dont starve together|little nightmares|ln1|ln2|little nightmares 2|inside|limbo|scorn|agony|madison|visage|phasmophobia|devour|pacify|lunch lady|forewarned|ghost watchers|ghost exorcism|demonologist|ghost hunters|paranormal|horror|terror|fear|slender|five nights at freddy's|fnaf|fnaf security breach|fnaf help wanted|bendy|batim|bendy and the ink machine|dark deception|boogeyman|visage|infliction|those who remain|tormented souls|song of horror|remothered|remothered tormented fathers|remothered broken porcelain|the medium|observer|observer system redux|callisto protocol|dead island|dying light|dying light 2|state of decay|days gone|world war z|back 4 blood|left 4 dead|l4d|l4d2|zombie|undead|survival horror/.test(jogo)) return '👻 Terror';
    
    // Esportes
    if (/fifa|fifa 23|fifa 24|ea fc|eafc|fc 24|fc 25|pes|efootball|winning eleven|pro evolution soccer|nba|nba 2k|nba 2k24|nba 2k23|wwe|wwe 2k|ufc|ufc 4|ufc 5|mma|bellator|boxing|fight night|fight night champion|undisputed|tony hawk|skate|skate 3|session|skater xl|riders republic|steep|ssx|cool boarders|nfl|madden|madden nfl|nhl|nhl 24|nhl 23|f1 manager|football manager|fm 24|fm 23|fm 2024|out of the park|ootp|mlb the show|mlb|baseball|golf|pga tour|pga 2k|everybody's golf|mario golf|mario tennis|mario strikers|mario sports|wii sports|nintendo switch sports|sports champions|kinect sports|ea sports|2k sports|sports/.test(jogo)) return '⚽ Esportes';
    
    // Simulador
    if (/simulator|simulation|sim|tycoon|tycoon|manager|management|city builder|cities skylines|city skylines|simcity|cities xl|citybound|foundation|surviving mars|surviving the aftermath|frostpunk|frostpunk 2|anno|anno 1800|anno 1404|anno 2070|anno 2205|settlers|the settlers|banished|patron|farthest frontier|going medieval|foundation|kingdoms reborn|before we leave|ixion|dyson sphere program|factorio|satisfactory|shapez|shapez 2|autonauts|infinifactory|while true learn|human resource machine|7 billion humans| Shenzhen I/O|TIS-100|exapunks|mobius front|opus magnum|infinifactory|spacechem|train valley|train valley 2|mini metro|mini motorways|manifold garden|baba is you|the witness|antichamber|portal|portal 2|the talos principle|the turing test|q.u.b.e|superliminal|viewfinder|maquette|the bridge|braid|fez|monument valley|monument valley 2|gorogoa|manifold garden|outer wilds|heaven's vault|journey|abzu|flower|sky|thatgamecompany|a short hike|firewatch|dear esther|everybody's gone to the rapture|vanishing of ethan carter|what remains of edith finch|gone home|tacoma|observer|layers of fear|blair witch|the medium|twelve minutes|her story|telling lies|immortality|sam barlow|bandersnatch|black mirror|not for broadcast|headliner|headliner novinews|beholder|papers please|this war of mine|frostpunk|frostpunk 2|they are billions|age of darkness|the riftbreaker|riftbreaker|starcraft|starcraft 2|warcraft|warcraft 3|age of empires|aoe|aoe2|aoe3|aoe4|empire earth|rise of nations|rise of legends|supreme commander|total annihilation|planetary annihilation|ashes of the singularity|dawn of war|dow|dow2|dow3|company of heroes|coh|coh2|coh3|men of war|gates of hell|combat mission|close combat|combat mission|graviteam tactics|theatre of war|panzer corps|panzer strategy|unity of command|unity of command 2|wargame|wargame red dragon|wargame airland battle|warno|regiments|armored brigade|armored brigade 2|flashpoint campaigns|command ops|decisive campaigns|war in the east|war in the west|gary grigsby|panzerkampf|tiger knight|chivalry|chivalry 2|mordhau|for honor|mount and blade|bannerlord|warband|viking conquest|prophesy of pendor|perisno|gekokujo|nova aetas|1257 ad|brytenwalda|a clash of kings|game of thrones|lotr|lord of the rings|last days|third age|divide and conquer|eldar scrolls|tamriel|skyrim together|enderal|vigilant|glenmoril|unsaad|apotheosis|legacy of the dragonborn|lotd|falskaar|wyrmstooth|beyond reach|bruma|beyond skyrim|skyblivion|skywind|morroblivion|tes renewal|openmw|openmw|morrowind|daggerfall|arena|redguard|battlespire|shadowkey|oblivion mobile|oblivion|skyrim|eso|elder scrolls online|fallout 76|fallout 4|fallout new vegas|fallout 3|fallout 2|fallout 1|fallout tactics|fallout brotherhood of steel|van buren|project brazil|the frontier|fallout miami|fallout london|fallout nuka break|fallout|apocalypse|post apocalyptic|wasteland|wasteland 2|wasteland 3|atom rpg|atom|pathologic|pathologic 2|ice pick lodge|knock knock|cargo|the void|turgor|tension|mor|ur|pathologic|marble nest|the sand plague|haruspex|changeling|bachelor|pathologic|metro|metro 2033|metro last light|metro exodus|metro 2033 redux|metro last light redux|metro exodus enhanced|s.t.a.l.k.e.r|stalker|shadow of chernobyl|clear sky|call of pripyat|heart of chornobyl|stalker 2|gsc game world|chernobyl|pripyat|zone|anomaly|dead air|gamma|efp|escape from pripyat|road to the north|spatial anomaly|deadcity|agroprom|rostock|bar|100 rads|sidorovich|strelok|degtyarev|skif|s.t.a.l.k.e.r|survival|survive|surviving|green hell|the forest|sons of the forest|raft|subnautica|subnautica below zero|the long dark|dont starve|dont starve together|oxygen not included|oni|rimworld|dwarf fortress|dwarf therapist|stonesense|dfhack|lazy newb pack|peridexiserrant|kruggsmash|boatmurdered|bronzemurdered|headshoots|syndrome|elephant|cats|magma|circus|clown|goblin|kobold|elf|human|dwarf|fortress|embark|biome|cavern|hell|hfs|hidden fun stuff|adamantine|raws|modding|dfhack|therapist|stonesense|sound sense|soundsense|soundcense|armok|armok vision|dwarf fortress|bay 12|tarn adams|zach adams|toady one|three toed sloth|threetoed|kitfox|steam|classic|premium|adventure|fortress mode|legends|arena|object testing arena|ota|modding|mods|graphics|ascii|tileset|phoebus|ironhand|spacefox|gemset|obsidian|mayday|jolly bastion|taffer|vherid|wanderlust|cla|dfgraphics|peridexis|peridexis errant|lazy newb pack|lnp|starter pack|quickfort|dfhack|therapist|stonesense|armok vision|dwarf therapist|sound sense|df to minecraft|df to rimworld|rimworld to df|df to gnomoria|gnomoria|craft the world|dig or die|it lurks below|starbound|terraria|edge of space|signs of life|planet centauri|crea|junk jack|junk jack x|pickaxe|mine|craft|build|explore|adventure|survival|creative|sandbox|open world|procedural|generated|random|seed|worldgen|world generation|history|legends|histories|entities|civilizations|sites|structures|artifacts|books|written content|poetry|music|dance|forms|styles|instruments|musical instruments|compositions|engravings|sculptures|statues|furniture|mechanisms|engineering|water|magma|power|windmill|water wheel|reaction|smelting|forging|metal|alloy|steel|iron|gold|silver|copper|bronze|brass|electrum|billon|sterling silver|rose gold|black bronze|bismuth bronze|adamantine|divine metal|slade|raw adamantine|wafer|strand|thread|cloth|silk|plant fiber|cotton|wool|yarn|leather|hide|bone|shell|horn|ivory|pearl|coral|amber|jet|coal|lignite|bituminous coal|coke|charcoal|fuel|fire|magma|volcano|geyser|hot spring|aquifer|river|stream|brook|pond|lake|ocean|sea|shore|beach|sand|clay|soil|loam|silt|sand|clay|peat|mud|filth|contaminant|syndrome|poison|toxin|venom|curse|werebeast|vampire|necromancer|zombie|husk|thrall|night creature|experiment|abomination|forgotten beast|titan|demon|angel|deity|god|goddess|sphere|domain|afterlife|underworld|heaven|hell|hfs|hidden fun stuff|circus|clown|demon|angel|forgotten beast|titan|dragon|roc|hydra|minotaur|cyclops|ettin|giant|jotun|nephilim|angel|demon|sphire|domain|afterlife|underworld|heaven|hell|circus|clown|fun|hidden|secret|spoilers|bay 12|tarn|zach|toady|sloth|three toed|kitfox|steam|classic|premium|release|update|bugfix|patch|version|changelog|devlog|dev|development|sneak peek|future of the fortress| FotF|dwarf fortress talk|DF Talk|podcast|interview|community|forums|bay12forums|reddit|r/dwarffortress|discord|wiki|dffd|dwarf fortress file depot|meph|vettlingr|mayday|phoebus|ironhand|spacefox|gemset|obsidian|cla|dfgraphics|peridexis|lnp|lazy newb|starter pack|quickfort|dfhack|therapist|stonesense|armok vision|sound sense|df to minecraft|df to rimworld|gnomoria|craft the world|dig or die|it lurks below|starbound|terraria|edge of space|signs of life|planet centauri|crea|junk jack|pickaxe|mine|craft|build|explore|adventure|survival|creative|sandbox|open world|procedural|generated|random|seed|worldgen|history|legends|histories|entities|civilizations|sites|structures|artifacts|books|written content|poetry|music|dance|forms|styles|instruments|musical instruments|compositions|engravings|sculptures|statues|furniture|mechanisms|engineering|water|magma|power|windmill|water wheel|reaction|smelting|forging|metal|alloy|fuel|fire|volcano|geyser|hot spring|aquifer|river|stream|brook|pond|lake|ocean|sea|shore|beach|sand|clay|soil|peat|mud|filth|contaminant|syndrome|poison|toxin|venom|curse|werebeast|vampire|necromancer|zombie|husk|thrall|night creature|experiment|abomination|forgotten beast|titan|demon|angel|deity|god|goddess|sphere|domain|afterlife|underworld|heaven|hell|circus|clown|dragon|roc|hydra|minotaur|cyclops|ettin|giant|jotun|nephilim|spoilers|bay 12|tarn|zach|toady|sloth|kitfox|steam|classic|premium|release|update|bugfix|patch|version|changelog|devlog|dev|development|sneak peek|future of the fortress|FotF|dwarf fortress talk|DF Talk|podcast|interview|community|forums|bay12forums|reddit|r/dwarffortress|discord|wiki|dffd|dwarf fortress file depot|meph|vettlingr|mayday|phoebus|ironhand|spacefox|gemset|obsidian|cla|dfgraphics|peridexis|lnp|lazy newb|starter pack|quickfort|dfhack|therapist|stonesense|armok vision|sound sense|df to minecraft|df to rimworld|gnomoria|craft the world|dig or die|it lurks below|starbound|terraria|edge of space|signs of life|planet centauri|crea|junk jack|pickaxe|mine|craft|build|explore|adventure|survival|creative|sandbox|open world|procedural|generated|random|seed|worldgen/.test(jogo)) return '🏗️ Simulador';
    
    // Casual/Família
    if (/lego|minecraft|roblox|animal crossing|acnh|new horizons|stardew valley|harvest moon|story of seasons|rune factory|sakuna|sakuna of rice and ruin|spiritfarer|cozy grove|a short hike|unpacking|powerwash simulator|power wash|powerwash|chill|relax|cozy|wholesome|wholesome games|family friendly|kids|children|educational|learning|math|science|history|geography|puzzle|puzzles|tetris|puyo puyo|panel de pon|tetris effect|tetris 99|puyo puyo tetris|dr mario|yoshi|yoshi's crafted world|yoshi's woolly world|kirby|kirby and the forgotten land|kirby star allies|kirby triple deluxe|kirby planet robobot|super kirby clash|kirby fighters|kirby's dream buffet|kirby's return to dream land|super mario|mario bros|mario 3d|mario odyssey|mario galaxy|mario sunshine|mario 64|super mario 64|mario kart|mario party|super mario party|mario party superstars|paper mario|mario rpg|mario luigi|mario and luigi|mario tennis|mario golf|mario strikers|mario baseball|mario sports|donkey kong|dk|dk country|donkey kong country|dkc|dkc2|dkc3|dk 64|donkey kong 64|dk tropical freeze|donkey kong tropical freeze|dk returns|donkey kong returns|diddy kong|dixie kong|king k rool|k rool|cranky kong|funky kong|wrinkly kong|swanky kong|candy kong|chunky kong|lanky kong|tiny kong|kiddy kong|koopa|bowser|peach|daisy|rosalina|luma|toad|toadette|yoshi|birdo|wario|waluigi|boo|goomba|koopa troopa|paratroopa|dry bones|hammer bro|lakitu|spiny|buzzy beetle|cheep cheep|bloop|blooper|piranha plant|bullet bill|bob-omb|chain chomp|thwomp|whomp|monty mole|pokey|shy guy|snifit|ninja|bandit|broozer|bully|chuckya|cluckboom|cozmo|crabber|cyclone|diggas|drill bit|elite octoomba|flipbug|flutter|fuzzy|glamdozer|gooble|goombeetle|gromba|jack o goomba|jammyfish|jellybeam|jump beamer|kat o 3|king kaliente|koopa ball|koopa shell|lakitu king|lava bubble|li'l brr|li'l cinder|magikoopa|mandibug|mechakoopa|monty|octoguy|octoomba|octopus|paragoomba|pinhead|piranha|prickly piranha|rhomp|sentry beam|slurple|smeech|snake block|swooper|twirlip|undergrunt|wiggler/.test(jogo)) return '🎮 Casual/Família';
    
    // Mundo Aberto/Ação
    if (/gta|grand theft auto|gta 5|gta v|gta online|gta 6|gta vi|red dead|rdr2|rdr 2|red dead redemption|red dead online|watch dogs|wd|wd2|wd legion|watch dogs 2|watch dogs legion|saints row|saints row 2022|mafia|mafia 2|mafia 3|mafia definitive|sleeping dogs|true crime|yakuza|like a dragon|judgment|lost judgment|just cause|jc2|jc3|jc4|just cause 2|just cause 3|just cause 4|mad max|rage|rage 2|borderlands|borderlands 2|borderlands 3|tales from the borderlands|wonderlands|tiny tina|tiny tina's wonderlands|outer worlds|avowed|starfield|no man's sky|subnautica|subnautica below zero|satisfactory|dyson sphere program|factorio|satisfactory|shapez|shapez 2|autonauts|infinifactory|while true learn|human resource machine|7 billion humans| Shenzhen I/O|TIS-100|exapunks|mobius front|opus magnum|infinifactory|spacechem|astroneer|breathedge|junkyard simulator|gas station simulator|car mechanic simulator|cms|cms 2021|cms 2018|truck driver|truck simulator|american truck simulator|ats|euro truck simulator|ets|ets2|farm simulator|farming simulator|fs|fs19|fs22|fs 2019|fs 2022|pure farming|real farm|farm manager|farm together|staxel|my time at portia|my time at sandrock|littlewood|forager|garden story|wytchwood|apico|bear and breakfast|cozy grove|spiritfarer|unpacking|powerwash simulator|power wash|powerwash|chill|relax|cozy|wholesome/.test(jogo)) return '🚔 Mundo Aberto/Ação';
    
    // Estratégia
    if (/strategy|strategia|xcom|x-com|xcom 2|xcom chimera|phoenix point|battletech|into the breach|fTL|faster than light|slay the spire|monster train|griftlands|roguebook|across the obelisk|tainted grail|hand of fate|hand of fate 2|dicey dungeons|ring of pain|nowhere prophet|neoverse|one step from eden|deck builder|deckbuilding|card game|card battler|auto battler|teamfight tactics|tft|underlords|dota underlords|autochess|chess|strategy|tactics|tactical|turn based|turn-based|real time|rts|starcraft|starcraft 2|warcraft|warcraft 3|age of empires|aoe|aoe2|aoe3|aoe4|empire earth|rise of nations|rise of legends|supreme commander|total annihilation|planetary annihilation|ashes of the singularity|dawn of war|dow|dow2|dow3|company of heroes|coh|coh2|coh3|men of war|gates of hell|combat mission|close combat|graviteam tactics|theatre of war|panzer corps|panzer strategy|unity of command|unity of command 2|wargame|wargame red dragon|wargame airland battle|warno|regiments|armored brigade|armored brigade 2|flashpoint campaigns|command ops|decisive campaigns|war in the east|war in the west|gary grigsby|panzerkampf|tiger knight|chivalry|chivalry 2|mordhau|for honor|mount and blade|bannerlord|warband|crusader kings|ck2|ck3|europa universalis|eu4|hearts of iron|hoi4|hoi3|stellaris|imperator|victoria|vic2|vic3|total war|shogun|rome|medieval|napoleon|empire|attila|thrones of britannia|three kingdoms|troy|warhammer|warhammer 2|warhammer 3|pharaoh|dynasties|civilization|civ|civ5|civ6|civ4|civ3|civ2|civ1|alpha centauri|beyond earth|humankind|old world|oldworld|old world|oldworld|old world|oldworld|old world|frostpunk|frostpunk 2|they are billions|age of darkness|the riftbreaker|riftbreaker|iron harvest|desperados|shadow tactics|shadow gambit|commandos|commandos 2|commandos 3|commandos strike force|real time tactics|rtt|stealth|stealth strategy|stealth tactics|ninja|shinobi|assassin|thief|dishonored|dishonored 2|death of the outsider|prey|prey 2017|system shock|system shock 2|system shock remake|bioshock|bioshock 2|bioshock infinite|burial at sea|minerva's den|clash in the clouds| Columbia's Finest|industrial revolution| BioShock Infinite: The Complete Edition|remastered|collection|the bioshock collection|irrational games|ken levine|2k marin|2k australia|digital extremes|arkane studios|lyon|austin|prey|deathloop|death loop|redfall|red fall|dishonored|dishonored 2|death of the outsider|prey|prey 2017|system shock|system shock 2|system shock remake|bioshock|bioshock 2|bioshock infinite|burial at sea|minerva's den|clash in the clouds| Columbia's Finest|industrial revolution| BioShock Infinite: The Complete Edition|remastered|collection|the bioshock collection|irrational games|ken levine|2k marin|2k australia|digital extremes|arkane studios|lyon|austin|prey|deathloop|death loop|redfall|red fall/.test(jogo)) return '🧠 Estratégia';
    
    return '🎯 Ação/Aventura';
}

// Gerar Key
function gerarKey() {
    const prefixo = 'NYUX';
    const meio = Math.random().toString(36).substring(2, 6).toUpperCase();
    const sufixo = Math.random().toString(36).substring(2, 10).toUpperCase();
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

_Digite o número da opção_`;
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

0️⃣ *Voltar ao Menu*`;
}

// Conectar ao WhatsApp
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
            console.log('📱 Escaneie o QR Code com o número: +' + BOT_NUMBER);
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Bot online!');
            console.log('🤖 Número:', sock.user.id.split(':')[0]);
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

        // Ignora grupos
        if (isGroup) return;

        // Extrai texto
        let text = '';
        if (msg.message.conversation) text = msg.message.conversation;
        else if (msg.message.extendedTextMessage) text = msg.message.extendedTextMessage.text;
        else if (msg.message.documentMessage) text = '[documento]';
        else if (msg.message.imageMessage) text = '[imagem]';

        text = text.toLowerCase().trim();

        const numeroLimpo = sender.replace('@s.whatsapp.net', '');
        const isAdmin = numeroLimpo === ADMIN_NUMBER;

        const userState = userStates.get(sender) || { step: 'menu' };

        console.log(`📩 ${pushName} (${numeroLimpo}): ${text.substring(0, 30)}... | Admin: ${isAdmin}`);

        try {
            // Saudações
            if (['oi', 'ola', 'olá', 'hey', 'eai', 'eae', 'bom dia', 'boa tarde', 'boa noite', 'hi', 'hello'].includes(text)) {
                await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                return;
            }

            // MENU PRINCIPAL
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
                        // NOVO: Mostrar categorias e permitir escolher
                        userStates.set(sender, { step: 'ver_categorias' });
                        const cats = db.getCategoriasResumo();
                        let msg = '📋 *Categorias de Jogos*\n\n';
                        let num = 1;
                        const categoriasLista = [];
                        
                        for (const [cat, total] of Object.entries(cats)) {
                            msg += `${num}️⃣ ${cat}: *${total} jogos*\n`;
                            categoriasLista.push(cat);
                            num++;
                        }
                        
                        userStates.set(sender, { step: 'ver_categorias', categorias: categoriasLista });
                        
                        msg += `\n🎮 *Total: ${db.getTotalJogos()} jogos*\n\nDigite o número da categoria para ver os jogos:`;
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

            // NOVO: Ver jogos por categoria (sem login/senha)
            else if (userState.step === 'ver_categorias') {
                const escolha = parseInt(text);
                const categorias = userState.categorias || [];
                
                if (isNaN(escolha) || escolha < 1 || escolha > categorias.length) {
                    await sock.sendMessage(sender, { 
                        text: '❌ Opção inválida!\n\nDigite um número válido ou *menu* para voltar:' 
                    });
                    return;
                }
                
                const categoriaEscolhida = categorias[escolha - 1];
                const jogos = db.getJogosPorCategoria(categoriaEscolhida);
                
                let msg = `📋 *${categoriaEscolhida}*\n\n`;
                msg += `Total: ${jogos.length} jogos\n\n`;
                
                // Lista os jogos (apenas nomes, sem login/senha)
                for (let i = 0; i < jogos.length; i++) {
                    msg += `• ${jogos[i]}\n`;
                    
                    // Divide em várias mensagens se for muito grande
                    if ((i + 1) % 50 === 0 && i < jogos.length - 1) {
                        await sock.sendMessage(sender, { text: msg });
                        msg = `📋 *${categoriaEscolhida}* (continuação)\n\n`;
                        await delay(1000);
                    }
                }
                
                msg += `\n💡 Para resgatar uma conta, digite *3* no menu principal.`;
                
                userStates.set(sender, { step: 'menu' });
                await sock.sendMessage(sender, { text: msg });
            }

            // RESGATAR KEY
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

            // BUSCAR JOGO
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

            // MENU ADMIN
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
