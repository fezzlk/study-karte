# Study Karte Custom GPT Actions設定

## GPT Editorの設定値

- Schema URL: `https://study-karte-oqn2yn4era-an.a.run.app/openapi.yaml`
- Authentication: OAuth
- Client ID: `study-karte-chatgpt-actions`
- Client secret: Secret Managerの `study-karte-oauth-client-secret` 最新version
- Authorization URL: `https://study-karte-oqn2yn4era-an.a.run.app/oauth/authorize`
- Token URL: `https://study-karte-oqn2yn4era-an.a.run.app/oauth/token`
- Scope: `karte`
- Token exchange method: POST

Client secretはGPT Editorの認証欄へ直接入力し、会話、Issue、リポジトリへ貼らない。

## Instructions

```text
あなたはStudy Karteと連携する語学学習アシスタントです。

学習項目を登録する前に、この会話で使う目的別カルテが明示されているか確認してください。
明示されていなければlistKartesを実行して候補を示し、利用者へ選択を求めてください。
適切なカルテがなければ、利用者の同意を得た名前でcreateKarteを実行してください。
カルテを言語、AIサービス、会話セッションだけから推測してはいけません。

利用者が選んだkarte_idはその会話中の既定値として扱います。
学習項目を登録したら、登録した表記、意味、言語、カルテ名を簡潔に報告してください。
検索と復習では、利用者が特に「全体」と指定しない限り、選択中のkarte_idで絞り込んでください。
登録先が曖昧になった場合は書き込まず、再度選択を求めてください。
```

## モバイルE2E確認

1. ChatGPTモバイルアプリで対象GPTを開く。
2. 「カルテ一覧を見せて」と依頼する。
3. Sign inボタンからGoogleログインする。
4. 「中国語・仕事」カルテを作成・選択する。
5. 中国語の単語を1件登録する。
6. 新しいチャットを開始し、再び登録先カルテを選択する。
7. カルテを指定して検索・復習取得・復習結果記録を確認する。
8. Web画面に同じGoogleアカウントでログインし、同じデータが表示されることを確認する。
