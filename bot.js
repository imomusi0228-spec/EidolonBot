const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

    if (commandName === 'key') {
        const orderId = interaction.options.getString('id').trim();
        
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

            // 商品名からティアを判定（柔軟なマッチング）
            let tier = "Standard";
            if (order.product_name.includes("Ultimate") || order.product_name.includes("Complete")) tier = "Ultimate";
            else if (order.product_name.includes("Pro") || order.product_name.includes("Creator")) tier = "Pro";
            else if (order.product_name.includes("Standard") || order.product_name.includes("Lite")) tier = "Standard";
            else if (order.product_name.includes("Free")) tier = "Free";

            // ライセンスキーの生成 (新体系に準拠)
            const prefixMap = {
                'Standard': 'EMSTD-',
                'Pro': 'EMPRO-',
                'Ultimate': 'EMULT-',
                'Creator': 'EMCREATOR-', // 互換性維持
                'Complete': 'EMCOMP-'    // 互換性維持
            };
            const prefix = prefixMap[tier] || 'EMDLC-';
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
                // 自動ロール付与ロジック
                const roleIdMap = {
                    'Free': process.env.ROLE_FREE,
                    'Standard': process.env.ROLE_STANDARD,
                    'Pro': process.env.ROLE_PRO,
                    'Ultimate': process.env.ROLE_ULTIMATE,
                    'Creator': process.env.ROLE_PRO, // エイリアス
                    'Complete': process.env.ROLE_ULTIMATE // エイリアス
                };
                const roleId = roleIdMap[tier];
                if (roleId && interaction.guild) {
                    const member = await interaction.guild.members.fetch(interaction.user.id);
                    if (member) {
                        await member.roles.add(roleId);
                        console.log(`[Role] Assigned ${tier} role to ${interaction.user.tag}`);
                    }
                }

                await interaction.user.send(`**祝！EidolonMimic ${tier} ライセンスが開放されました！**\n注文番号: \`${orderId}\` に対する貴方のキー: \`${licenseKey}\` です。大切になさってくださいわ。`);
                await interaction.reply({ content: `注文の正当性が証明されましたわ！「${tier}」ロールを付与し、ライセンスキーをDMでお送りしましたので、ご確認ください！`, ephemeral: true });
            } catch (dmError) {
                console.error("DM or Role error:", dmError);
                await interaction.reply({ content: `認証に成功しましたが、一部の付与処理に失敗した可能性がございます。お嬢様に相談してくださいわ。\n発行されたキー: \`${licenseKey}\``, ephemeral: true });
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "処理中にエラーが発生しました。お嬢様に報告しておきますね。", ephemeral: true });
        }
    }

    if (commandName === 'dl') {
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

    if (commandName === 'setup') {
        // お嬢様（管理者）のみ実行可能とする
        if (interaction.user.id !== process.env.OWNER_ID && !interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: "お嬢様以外がこのボタンを置くことは許されませんわ。", ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle("Eidolon Freeプラン 申請所")
            .setColor(0xAAAAAA)
            .setDescription("下のボタンを押して、お嬢様の慈悲（Freeライセンス）を賜るのですわ。\n\n※ボタンを押すと自動的にFreeロールが付与され、ライセンスキーがDMで届きます。");

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('get_free_license')
                    .setLabel('Freeライセンスを申請する')
                    .setStyle(ButtonStyle.Secondary),
            );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'admin') {
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: "このコマンドはお嬢様（管理者）専用ですわ。一般の方には教えられません。", ephemeral: true });
        }

        const baseUrl = (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`).replace(/\/$/, "");
        const adminUrl = `${baseUrl}/admin.html`;

        const embed = new EmbedBuilder()
            .setTitle("🔑 Eidolon 管理者パネル")
            .setColor(0xFFD700)
            .setDescription("お嬢様専用の管理画面への入口ですわ。")
            .addFields(
                { name: "管理URL", value: `[こちらからアクセスしてください](${adminUrl})` },
                { name: "注意", value: "このURLは外部に漏らさないようお願い申し上げます、お嬢様。" }
            );

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

// ボタンインタラクションの処理
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'get_free_license') {
        try {
            // 既にライセンスを持っているかチェック
            const existingLicense = await prisma.license.findFirst({
                where: { user: { discord_id: interaction.user.id }, tier: 'Free' }
            });

            if (existingLicense) {
                return interaction.reply({ content: `既にお嬢様からFreeライセンスを賜っておりますわ。DMをご確認ください。\nキー: \`${existingLicense.license_key}\``, ephemeral: true });
            }

            const tier = "Free";
            const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
            const licenseKey = `EMFREE-${randomPart}`;

            // DB登録 ＆ ロール付与
            await prisma.license.create({
                data: {
                    license_key: licenseKey,
                    tier,
                    activated: false,
                    user: {
                        connectOrCreate: {
                            where: { discord_id: interaction.user.id },
                            create: { discord_id: interaction.user.id, username: interaction.user.username }
                        }
                    }
                }
            });

            // ロール付与
            const roleId = process.env.ROLE_FREE;
            if (roleId && interaction.guild) {
                const member = await interaction.guild.members.fetch(interaction.user.id);
                if (member) await member.roles.add(roleId);
            }

            await interaction.user.send(`**【Eidolon】Freeライセンスが発行されました**\n貴方の招待キー: \`${licenseKey}\` です。Unityツールに入力して、お嬢様の技術をご体験ください。`);
            await interaction.reply({ content: "申請が受理されましたわ！ロールを付与し、キーをDMでお送りしました。", ephemeral: true });

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "申請処理中にエラーが発生しましたわ。お嬢様に報告しておきますわね。", ephemeral: true });
        }
    }
});

async function registerCommands() {
    const commands = [
        {
            name: 'key',
            description: '注文番号からキーを発行します',
            options: [
                {
                    name: 'id',
                    type: 3, // STRING
                    description: 'Boothの注文番号',
                    required: true
                }
            ]
        },
        {
            name: 'dl',
            description: 'ダウンロード先を表示'
        },
        {
            name: 'setup',
            description: 'Free申請ボタンを設置（管理）'
        },
        {
            name: 'admin',
            description: '管理パネルのURLを表示（管理）'
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
