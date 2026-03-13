const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const prisma = require('./database');
const crypto = require('crypto');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});

client.once('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'license') {
        const orderId = interaction.options.getString('order_id').trim();
        
        try {
            // Booth注文データの照合
            const order = await prisma.boothOrder.findUnique({
                where: { order_id: orderId }
            });

            if (!order) {
                return interaction.reply({ content: "その注文番号は台帳に存在しませんわ。Boothの購入履歴を再度ご確認ください。", ephemeral: true });
            }

            if (order.claimed) {
                return interaction.reply({ content: "その注文番号は既にライセンス発行に使用されていますわ。お困りの場合はお嬢様に相談してください。", ephemeral: true });
            }

            // 商品名からティアを判定
            let tier = "Pro";
            if (order.product_name.includes("Creator")) tier = "Creator";
            if (order.product_name.includes("Complete")) tier = "Complete";

            // ライセンスキーの生成
            const prefix = `EM${tier.toUpperCase()}-`;
            const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
            const licenseKey = `${prefix}${randomPart}`;

            // トランザクション：キー発行 ＋ 注文を使用済みにマーク
            await prisma.$transaction([
                prisma.license.create({
                    data: { 
                        license_key: licenseKey, 
                        tier, 
                        activated: false,
                        user: { connectOrCreate: { 
                            where: { discord_id: interaction.user.id },
                            create: { discord_id: interaction.user.id, username: interaction.user.username }
                        }}
                    }
                }),
                prisma.boothOrder.update({
                    where: { order_id: orderId },
                    data: { claimed: true, claimed_at: new Date() }
                })
            ]);

            // ユーザーにDMでキーを送信
            try {
                await interaction.user.send(`**祝！EidolonMimic ${tier} ライセンスが開放されました！**\n注文番号: \`${orderId}\` に対する貴方のキー: \`${licenseKey}\` です。大切になさってくださいわ。`);
                await interaction.reply({ content: "注文の正当性が証明されましたわ！ライセンスキーをDMでお送りしましたので、ご確認ください！", ephemeral: true });
            } catch (dmError) {
                await interaction.reply({ content: `認証に成功しましたが、DMをお送りできませんでした。サーバー内ユーザーからのDMを許可するように設定を確認してください。\n発行されたキー: \`${licenseKey}\``, ephemeral: true });
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "処理中にエラーが発生しました。お嬢様に報告しておきますね。", ephemeral: true });
        }
    }

    if (commandName === 'download') {
        const embed = new EmbedBuilder()
            .setTitle("EidolonMimic 公式配布所")
            .setColor(0x00FF99)
            .setDescription("最新の成果物をこちらから手に取ることができますわ。")
            .addFields(
                { name: "GitHub v2.0", value: "[ダウンロードはこちら](https://github.com/dansy/EidolonMimic/releases/latest)" },
                { name: "Booth", value: "[商品ページ](https://booth.pm/ja/items/example)" }
            );
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

async function registerCommands() {
    const commands = [
        {
            name: 'license',
            description: 'Boothの注文番号からライセンスを発行します',
            options: [
                {
                    name: 'order_id',
                    type: 3, // STRING
                    description: 'Boothの注文番号（8桁の数字）',
                    required: true
                }
            ]
        },
        {
            name: 'download',
            description: '最新版のダウンロード先を表示します'
        }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Refreshing application commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully reloaded commands.');
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
