const prisma = require('./database');
const crypto = require('crypto');
const express = require('express');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const router = express.Router();

const ADMIN_TOKEN = "Meltank0819";

// Admin Auth Middleware
const adminAuth = (req, res, next) => {
    const token = req.headers['x-admin-token'];
    if (token === ADMIN_TOKEN) {
        next();
    } else {
        res.status(401).json({ error: "お嬢様以外は立ち入り禁止です。" });
    }
};

// POST /license/verify
router.post('/license/verify', async (req, res) => {
    const { license_key, discord_id, machine_id } = req.body;
    
    try {
        const license = await prisma.license.findUnique({
            where: { license_key },
            include: { user: { include: { UserFeatures: { include: { feature: true } } } } }
        });

        if (!license) {
            return res.status(404).json({ valid: false, error: "ライセンスキーが見つかりません。正しいキーを入力してください。" });
        }

        // マシンIDのチェック (簡易実装: 既にアクティベート済みの場合は一致するか確認)
        // 本来はマシンのスロット管理などを行う
        if (license.activated && license.machine_id && license.machine_id !== machine_id) {
            return res.status(403).json({ valid: false, error: "このライセンスは別のデバイスで使用されています。" });
        }

        // 基本ティアに基づく機能の一覧性
        const tier = license.tier;
        const baseFeatures = {
            autoRepair: tier === 'Complete',
            preview: ['Pro', 'Creator', 'Complete'].includes(tier),
            expressionGenerator: ['Pro', 'Creator', 'Complete'].includes(tier)
        };

        // DBに登録された追加機能（DLC）の取得
        const additionalFeatures = license.user ? license.user.UserFeatures.map(uf => uf.feature.slug) : [];

        return res.json({
            valid: true,
            tier: tier,
            baseFeatures: baseFeatures,
            additionalFeatures: additionalFeatures,
            activated: license.activated
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "サーバー内部エラーが発生しました。" });
    }
});

// GET /features (Phase 3: DLC List)
router.get('/features', async (req, res) => {
    try {
        const features = await prisma.feature.findMany();
        res.json(features);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

// POST /license/activate
router.post('/license/activate', async (req, res) => {
    const { license_key, discord_id } = req.body;

    try {
        // ユーザーの検索または作成
        let user = await prisma.user.findUnique({
            where: { discord_id }
        });

        if (!user) {
            // ここでは簡易的にユーザー名を仮定
            user = await prisma.user.create({
                data: { discord_id, username: "Unknown" }
            });
        }

        const license = await prisma.license.update({
            where: { license_key },
            data: {
                activated: true,
                user_id: user.id
            }
        });

        res.json({ activation_status: "success", tier: license.tier });
    } catch (error) {
        console.error(error);
        res.status(400).json({ activation_status: "failed", error: error.message });
    }
});

// GET /update/check
router.get('/update/check', async (req, res) => {
    try {
        const latest = await prisma.version.findFirst({
            orderBy: { release_date: 'desc' }
        });
        res.json({
            latest_version: latest ? latest.tool_version : "1.0.0",
            download_url: latest ? latest.download_url : "https://booth.pm/ja/items/example"
        });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

// --- Admin Endpoints ---

// GET /admin/licenses
router.get('/admin/licenses', adminAuth, async (req, res) => {
    try {
        const licenses = await prisma.license.findMany({
            include: { user: true },
            orderBy: { created_at: 'desc' }
        });
        res.json(licenses);
    } catch (error) {
        res.status(500).json({ error: "データ取得に失敗しました。" });
    }
});

// POST /admin/generate
router.post('/admin/generate', adminAuth, async (req, res) => {
    const { tier } = req.body;
    const prefix = {
        'Pro': 'EMPRO-',
        'Creator': 'EMCREATOR-',
        'Complete': 'EMCOMP-'
    }[tier] || 'EMDLC-';
    
    const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
    const license_key = `${prefix}${randomPart}`;

    try {
        const newLicense = await prisma.license.create({
            data: { license_key, tier, activated: false }
        });
        res.json({ success: true, license: newLicense });
    } catch (error) {
        res.status(500).json({ error: "キー生成に失敗しました。" });
    }
});

// POST /admin/reset
router.post('/admin/reset', adminAuth, async (req, res) => {
    const { id } = req.body;
    try {
        await prisma.license.update({
            where: { id: parseInt(id) },
            data: { machine_id: null, activated: false }
        });
        res.json({ success: true, message: "マシン紐付けをリセットしました。" });
    } catch (error) {
        res.status(500).json({ error: "リセットに失敗しました。" });
    }
});

// POST /admin/booth/import
router.post('/admin/booth/import', adminAuth, async (req, res) => {
    const { csvData } = req.body;
    
    try {
        const records = parse(csvData, {
            columns: true,
            skip_empty_lines: true
        });

        let count = 0;
        for (const record of records) {
            // BoothのCSV形式に合わせたマッピング
            // 注文番号, 商品名, 個数 などの列名を想定
            const orderId = record['注文番号'] || record['Order ID'];
            const productName = record['商品名'] || record['Product Name'];
            
            if (orderId && productName) {
                await prisma.boothOrder.upsert({
                    where: { order_id: orderId },
                    update: { product_name: productName },
                    create: {
                        order_id: orderId,
                        product_name: productName,
                        quantity: parseInt(record['個数'] || record['Quantity'] || "1")
                    }
                });
                count++;
            }
        }

        res.json({ success: true, message: `${count}件の注文データをインポートしました。` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "インポートに失敗しました。" });
    }
});

module.exports = router;
