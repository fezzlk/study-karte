# study-karte

AIエージェント連携型 語学学習プラットフォーム。ChatGPT・Gemini等のAIエージェントを学習UIとして活用しながら、語彙・例文・復習履歴・学習カルテ（Teacher's Chart）を独立した学習基盤に蓄積する。

## コンセプト

学習データの主権をAIエージェント側に置かない。AIエージェントは「会話・説明・出題」を担当する交換可能なクライアントとし、学習項目・復習状態・学習計画・学習カルテは本サービスが一元管理する。これにより「どのAIと話しても、昨日までの自分の学習が続いている」状態を作る。

詳細な設計思想・ドメインモデル・API設計・ロードマップは [docs/proposal-v0.2.txt](docs/proposal-v0.2.txt) を参照。

## 登録した学習項目を見る

RESTサーバーを起動して `http://localhost:8081` を開くと、ChatGPTから登録した単語・フレーズ・文法を一覧できます。

```sh
STUDY_KARTE_API_KEY=your-api-key npm run start:rest
```

初回表示時に同じAPIキーを入力してください。キーは利用中のブラウザの `localStorage` に保存され、HTMLには埋め込まれません。言語・項目種別による絞り込みに対応しています。

ChatGPT上では「Study Karteに登録した単語を一覧で見せて」と依頼することでも確認できます。

## 現在のステータス

ChatGPT連携、学習項目の登録・一覧、簡易復習APIを備えたPoCです。学習カルテと初診ヒアリングは設計段階です。

## 参照

- Linear: https://linear.app/fezzlk/project/study-karte-f298e8e97bee
