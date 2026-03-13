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

const ADMIN_LOG_CHANNEL_ID = process.env.ADMIN_LOG_CHANNEL_ID;

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
        await interaction.reply({ content: helpText, ephemeral: true });
    }

    if (commandName === 'request-license') {
        const tier = interaction.options.getString('tier') || 'Pro';
        
        try {
            // 不正防止：既にライセンスを持っているかチェック
            const existingUser = await prisma.user.findUnique({
                where: { discord_id: interaction.user.id },
                include: { licenses: true }
            });

            if (existingUser && existingUser.licenses.some(l => l.tier === tier)) {
                return interaction.reply({ content: `お嬢様から既に${tier}版の許可を頂いているようですわ。一つのアカウントで複数のキーは発行できません。`, ephemeral: true });
            }

            const crypto = require('crypto');
            const prefix = tier === 'Pro' ? 'EMPRO-' : (tier === 'Creator' ? 'EMCREATOR-' : 'EMDLC-');
            const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
            const license_key = `${prefix}${randomPart}`;

            // DBに登録（ユーザーと紐付け）
            await prisma.license.create({
                data: { 
                    license_key, 
                    tier, 
                    activated: false,
                    user: { connectOrCreate: { 
                        where: { discord_id: interaction.user.id },
                        create: { discord_id: interaction.user.id, username: interaction.user.username }
                    }}
                }
            });

            // ユーザーにDM送信
            try {
                await interaction.user.send(`**EidolonMimic ${tier} ライセンスが発行されました！**\nあなたのライセンスキー: \`${license_key}\`\nUnityツールのライセンス設定画面でこのキーを入力してください。`);
                await interaction.reply({ content: "ライセンスを発行し、DMで送信しました。有効に活用してくださいね。", ephemeral: true });
                
                // 管理者（お嬢様）へ通知
                if (ADMIN_LOG_CHANNEL_ID) {
                    const logChannel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID);
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle("📋 ライセンス自動発行ログ")
                            .setColor(0x00FF00)
                            .addFields(
                                { name: "ユーザー", value: `${interaction.user.tag} (${interaction.user.id})` },
                                { name: "ティア", value: tier },
                                { name: "発行キー", value: `\`${license_key}\`` }
                            )
                            .setTimestamp();
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }
            } catch (dmError) {
                console.error("DM送信失敗:", dmError);
                await interaction.reply({ content: `ライセンスを発行しましたが、DMが送れませんでした。設定（サーバー内ユーザーのDM許可）を確認してください。\nキー: \`${license_key}\``, ephemeral: true });
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "ライセンスの発行中にエラーが発生しました。お嬢様に報告しておきますね。", ephemeral: true });
        }
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
