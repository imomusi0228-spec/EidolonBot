# EidolonMimic 統合ライセンスシステム

Node.js (Express) + Discord.js + PostgreSQL による、Unityライセンス管理とDiscordコミュニティの統合システムです。

## 🚀 特徴
- **統合API**: UnityツールとDiscord Botが同じデータベースを参照し、一貫した認証を提供します。
- **Render最適化**: APIサーバーとBotを同一インスタンスで稼働。無料プランのスリープ回避機能（Keep-Alive）内蔵。
- **PostgreSQL**: Prisma ORM を使用した堅牢なデータ永続化。

## ⚙️ セットアップ手順

### 1. 準備
- Node.js (v18以上推奨) をインストールしてください。
- Render で PostgreSQL データベースを作成し、`DATABASE_URL` を取得してください。

### 2. インストール
```bash
npm install
```

### 3. 環境設定
`.env.example` を `.env` にリネームし、以下の情報を記入してください。
- `DATABASE_URL`: PostgreSQLの接続文字列
- `DISCORD_TOKEN`: Discord Botトークン
- `CLIENT_ID`: Discord アプリケーションのクライアントID
- 各エディションのロールID

### 4. データベース初期化
```bash
npx prisma db push
```

### 5. 起動
```bash
npm start
```

## 🌐 API仕様

- **POST /api/license/verify**: ライセンスの有効性確認
- **POST /api/license/activate**: ライセンスの有効化（ユーザー紐付け）
- **GET /api/update/check**: ツールの最新バージョン確認

## 🛠️ デプロイ (Render)
1. **Web Service** を作成し、GitHub リポジトリを連携します。
2. **Build Command**: `npm install`
3. **Start Command**: `npm start`
4. 環境変数を Render のダッシュボードから追加してください。
