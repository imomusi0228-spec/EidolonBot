const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const prisma = require('./database');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const ROLE_IDS = {
    LITE: process.env.ROLE_LITE,
    PRO: process.env.ROLE_PRO,
    CREATOR: process.env.ROLE_CREATOR,
    COMPLETE: process.env.ROLE_COMPLETE
};

client.once('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'verify') {
        const key = interaction.options.getString('key').toUpperCase().trim();
        
        try {
            const license = await prisma.license.findUnique({
                where: { license_key: key }
            });

            if (!license) {
                return interaction.reply({ content: "認証に失敗しました。正しいライセンスキーを入力してください。", ephemeral: true });
            }

            const role_id = ROLE_IDS[license.tier];
            if (!role_id) {
                return interaction.reply({ content: "システムエラー：ロール設定が見つかりません。", ephemeral: true });
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            const role = interaction.guild.roles.cache.get(role_id);

            if (!role) {
                return interaction.reply({ content: "エラー：サーバー上に該当するロールが見つかりませんでした。", ephemeral: true });
            }

            await member.roles.add(role);

            // DB更新（アクティベート済みとする）
            await prisma.license.update({
                where: { license_key: key },
                data: { activated: true, user: { connectOrCreate: { 
                    where: { discord_id: interaction.user.id },
                    create: { discord_id: interaction.user.id, username: interaction.user.username }
                }}}
            });

            await interaction.reply({ content: `認証が完了しました。【${license.tier} User】ロールを付与しました。`, ephemeral: true });
        } catch (error) {
            console.error(error);
            interaction.reply({ content: "エラーが発生しました。管理者にお問い合わせください。", ephemeral: true });
        }
    }

    if (commandName === 'download') {
        const embed = new EmbedBuilder()
            .setTitle("EidolonMimic ダウンロードリンク")
            .setColor(0x0099FF)
            .addFields(
                { name: "Lite (無料版)", value: "[ダウンロード](https://booth.pm/ja/items/example_lite)" },
                { name: "Pro / Creator / Complete", value: "[Booth 商品ページ](https://booth.pm/ja/items/example_pro)\n※購入済みのバージョンのファイルをダウンロードしてください。" }
            );
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'ticket') {
        const title = interaction.options.getString('title');
        try {
            const thread = await interaction.channel.threads.create({
                name: `支援チケット-${interaction.user.username}-${title}`,
                autoArchiveDuration: 1440,
                reason: `Support ticket requested by ${interaction.user.tag}`,
            });
            
            await thread.members.add(interaction.user.id);
            await thread.send(`**${interaction.user.toString()} 様、お問い合わせありがとうございます。**\n詳細をこちらに記入してお待ちください。`);
            await interaction.reply({ content: `チケットを作成しました: ${thread.toString()}`, ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "チケットの作成に失敗しました。権限を確認してください。", ephemeral: true });
        }
    }

    if (commandName === 'help') {
        const helpText = (
            "**EidolonBot ヘルプメニュー (Node.js版)**\n" +
            "`/verify [key]` : ライセンスキーを認証して、専用チャンネルを解放します。\n" +
            "`/download` : 各バージョンのリンクを表示します。\n" +
            "`/ticket [件名]` : サポートチケットを作成します（スレッド形式）。\n" +
            "不明点がある場合は、サポートチャンネルでご質問ください。"
        );
        await interaction.reply({ content: helpText, ephemeral: true });
    }
});

async function registerCommands() {
    const commands = [
        {
            name: 'verify',
            description: 'ライセンスキーを認証します',
            options: [
                {
                    name: 'key',
                    type: 3, // STRING
                    description: 'ライセンスキー',
                    required: true
                }
            ]
        },
        {
            name: 'download',
            description: '各バージョンのリンクを表示します'
        },
        {
            name: 'ticket',
            description: 'サポートチケットを作成します',
            options: [
                {
                    name: 'title',
                    type: 3, // STRING
                    description: '相談内容の要約',
                    required: true
                }
            ]
        },
        {
            name: 'help',
            description: 'Botの使い方を表示します'
        },
        {
            name: 'request-license',
            description: 'ライセンスキーを即座に発行します',
            options: [
                {
                    name: 'tier',
                    type: 3, // STRING
                    description: 'エディション (Pro, Creator, Lite)',
                    required: false,
                    choices: [
                        { name: 'Professional', value: 'Pro' },
                        { name: 'Creator', value: 'Creator' },
                        { name: 'Lite', value: 'Lite' }
                    ]
                }
            ]
        }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}

module.exports = {
    startBot: () => {
        client.login(process.env.DISCORD_TOKEN);
        registerCommands();
    }
};
