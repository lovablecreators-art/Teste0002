const express = require('express');
const cors = require('cors');
const { Client } = require('discord.js-selfbot-v13');
const { joinVoiceChannel } = require('@discordjs/voice');

const app = express();
app.use(cors());
app.use(express.json());

const sessions = new Map();

app.post('/api/servers', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token necessário' });

    let client = sessions.get(token)?.client;

    if (!client) {
        client = new Client({ checkUpdate: false });
        try {
            await client.login(token);
            sessions.set(token, { client });
        } catch (err) {
            return res.status(401).json({ error: 'Token inválido' });
        }
    }

    const guilds = client.guilds.cache.map(guild => ({
        id: guild.id,
        name: guild.name,
        channels: guild.channels.cache
            .filter(c => c.type === 'GUILD_VOICE')
            .map(c => ({ id: c.id, name: c.name }))
    }));

    res.json({ guilds });
});

app.post('/api/connect', async (req, res) => {
    const { token, guildId, channelId } = req.body;
    const session = sessions.get(token);

    if (!session || !session.client) return res.status(400).json({ error: 'Faça login primeiro' });

    const guild = session.client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: 'Servidor não encontrado' });

    try {
        const connection = joinVoiceChannel({
            channelId,
            guildId,
            adapterCreator: guild.voiceAdapterCreator,
            selfMute: false,
            selfDeaf: false
        });

        session.connection = connection;
        res.json({ success: true, message: 'Conectado!' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao entrar na call' });
    }
});

app.post('/api/disconnect', (req, res) => {
    const { token } = req.body;
    const session = sessions.get(token);

    if (session) {
        if (session.connection) session.connection.destroy();
        if (session.client) session.client.destroy();
        sessions.delete(token);
        return res.json({ success: true });
    }

    res.status(400).json({ error: 'Nenhuma conexão ativa' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Backend Online!'));
         
