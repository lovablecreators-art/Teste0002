const express = require('express');
const cors = require('cors');
const { Client } = require('discord.js-selfbot-v13');
const { joinVoiceChannel } = require('@discordjs/voice');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const sessions = new Map();

app.get('/', (req, res) => res.send('Backend rodando com sucesso!'));

// Busca de servidores via REST HTTP direta (Bypassa o bloqueio de WebSocket do Render)
app.post('/api/servers', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token não fornecido.' });

    const cleanToken = token.trim().replace(/^"|"$/g, '');

    try {
        // 1. Busca os servidores direto da API do Discord
        const guildsResponse = await fetch('https://discord.com/api/v9/users/@me/guilds', {
            headers: { 'Authorization': cleanToken }
        });

        if (!guildsResponse.ok) {
            return res.status(401).json({ error: 'Token inválido ou recusado pelo Discord.' });
        }

        const userGuilds = await guildsResponse.json();

        // 2. Inicia o client em segundo plano para chamadas de voz
        if (!sessions.has(cleanToken)) {
            const client = new Client({ checkUpdate: false, syncStatus: false });
            client.login(cleanToken).catch(() => {});
            sessions.set(cleanToken, { client });
        }

        // 3. Monta os dados dos servidores
        const guilds = userGuilds.map(g => ({
            id: g.id,
            name: g.name,
            channels: [] // O frontend exibirá os servidores instantaneamente
        }));

        return res.json({ guilds });
    } catch (err) {
        return res.status(500).json({ error: 'Erro de conexão com o Discord: ' + err.message });
    }
});

app.post('/api/connect', async (req, res) => {
    const { token, guildId, channelId } = req.body;
    const cleanToken = token ? token.trim().replace(/^"|"$/g, '') : '';
    const session = sessions.get(cleanToken);

    if (!session || !session.client) {
        return res.status(400).json({ error: 'Sessão não encontrada. Carregue os servidores novamente.' });
    }

    try {
        const guild = await session.client.guilds.fetch(guildId);
        const connection = joinVoiceChannel({
            channelId,
            guildId,
            adapterCreator: guild.voiceAdapterCreator,
            selfMute: false,
            selfDeaf: false
        });

        session.connection = connection;
        return res.json({ success: true, message: 'Conectado à call com sucesso!' });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao entrar na call: ' + err.message });
    }
});

app.post('/api/disconnect', (req, res) => {
    const { token } = req.body;
    const cleanToken = token ? token.trim().replace(/^"|"$/g, '') : '';
    const session = sessions.get(cleanToken);

    if (session) {
        if (session.connection) session.connection.destroy();
        if (session.client) session.client.destroy();
        sessions.delete(cleanToken);
        return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Nenhuma conexão ativa.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));
         
