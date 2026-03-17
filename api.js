const prisma = require('./database');
const crypto = require('crypto');
const express = require('express');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const router = express.Router();

const ADMIN_TOKEN = "Meltank0819";

// Admin Auth// 管理者認証ミドルウェア (お嬢様の意向により、URLを秘密とするためチェックを緩和)
const adminAuth = (req, res, next) => {
    // トークンチェックをバイパスしますわ
    next();
};

// POST /license/verify - ライセンス検証
router.post('/license/verify', async (req, res) => {
    const { license_key, machine_id } = req.body;
    
    if (!license_key) {
        return res.status(400).json({ valid: false, error: 'License key is required' });
    }

    try {
        const license = await prisma.license.findUnique({
            where: { license_key: license_key }
        });

        if (!license) {
            return res.json({ valid: false, error: 'Invalid license key' });
        }

        // BANチェック
        if (license.status === 'Banned') {
            return res.json({ valid: false, status: 'Banned', error: 'This license is banned due to policy violation.' });
        }

        const tier = license.tier;
        const slotsMap = { 'Free': 1, 'Standard': 2, 'Pro': 3, 'Ultimate': 5, 'Creator': 3, 'Complete': 5 };
        
        // Ultimateプラン以外は機体制限を確認
        if (tier !== 'Ultimate' && tier !== 'Complete') {
            if (license.machine_id && license.machine_id !== machine_id) {
                return res.json({ 
                    valid: false, 
                    status: license.status,
                    error: "別のデバイスで使用されています。不正共有は禁じられていますわ。" 
                });
            }
            if (!license.machine_id) {
                await prisma.license.update({
                    where: { license_key: license_key },
                    data: { machine_id: machine_id }
                });
            }
        }

        return res.json({
            valid: true,
            tier: tier,
            status: license.status,
            activated: true
        });
    } catch (error) {
        console.error("verify error:", error);
        res.status(500).json({ error: "サーバー内部エラーですわ。" });
    }
});

// POST /license/report - 不正報告（Unityツールからの自動通報）
router.post('/license/report', async (req, res) => {
    const { license_key, machine_id, reason, details } = req.body;
    
    try {
        const license = await prisma.license.findUnique({
            where: { license_key: license_key }
        });

        if (!license) return res.status(404).json({ error: 'License not found' });

        // 即座にBANし、ログを記録
        await prisma.license.update({
            where: { license_key: license_key },
            data: { status: 'Banned' }
        });
        
        console.log(`[Justice] License ${license_key} has been BANNED. Reason: ${reason}`);
        res.json({ success: true, message: "反逆者を処断いたしました。" });
    } catch (error) {
        res.status(500).json({ error: "処断に失敗しましたわ。" });
    }
});

// GET /features - DLCリスト取得
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
        let user = await prisma.user.findUnique({
            where: { discord_id }
        });

        if (!user) {
            user = await prisma.user.create({
                data: { discord_id, username: "Unknown" }
            });
        }

        const license = await prisma.license.update({
            where: { license_key: license_key },
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
        console.error("admin licenses error:", error);
        res.status(500).json({ error: "データ取得に失敗しました。" });
    }
});

// POST /admin/generate
router.post('/admin/generate', adminAuth, async (req, res) => {
    const { tier } = req.body;
    const prefix = {
        'Standard': 'EMSTD-',
        'Pro': 'EMPRO-',
        'Ultimate': 'EMULT-',
        'Creator': 'EMCREATOR-',
        'Complete': 'EMULT-'
    }[tier] || 'EMDLC-';
    
    const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
    const license_key = `${prefix}${randomPart}`;

    try {
        const newLicense = await prisma.license.create({
            data: { license_key: license_key, tier, activated: false }
        });
        res.json({ success: true, license: newLicense });
    } catch (error) {
        console.error("admin generate error:", error);
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
        console.error("admin reset error:", error);
        res.status(500).json({ error: "リセットに失敗しました。" });
    }
});

// DELETE /admin/license/:id - ライセンス削除
router.delete('/admin/license/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.license.delete({
            where: { id: parseInt(id) }
        });
        res.json({ success: true, message: "ライセンスを永久に抹消いたしました。" });
    } catch (error) {
        console.error("admin delete error:", error);
        res.status(500).json({ error: "抹消に失敗しました。対象が存在しない可能性がございます。" });
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
