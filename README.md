# Simple Browser

TauriベースのシンプルWebブラウザアプリケーション

## セットアップ

```bash
npm install
npm run dev
```

## コマンド

```bash
npm run dev          # 開発サーバー起動
npm run build        # プロダクションビルド  
npm run test:all     # 全テスト実行
```

## 主な機能

- 基本的なWebブラウジング
- ナビゲーション（戻る・進む・リロード）
- X-Frame-Options回避（プロキシ機能）

## 技術スタック

- フロントエンド: HTML/CSS/JavaScript
- バックエンド: Rust (Tauri)
- テスト: Jest + Cargo Test
