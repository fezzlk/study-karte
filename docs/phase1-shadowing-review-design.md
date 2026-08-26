# Phase 1: 保存した例文を使ったシャドーイング復習 — 設計

関連issue: [FEZ-116](https://linear.app/fezzlk/issue/FEZ-116/phase1-保存した例文を使ったシャドーイング復習を設計する)
関連する企画書の章: `docs/proposal-v0.2.txt` 8.2（LearningContext）、30.1（音声・発音評価の独立レイヤー）、40.3（発音評価の段階設計）

本ドキュメントは設計のみを対象とし、実装は別issueへ切り出す（FEZ-116の完了条件どおり）。

## 1. 前提・非目標

- study-karteは発音の正しさや学習成果を保証しない。
- 音声認識（ASR）による一致判定は、企画書40.3でいう **Level 2（間接的なEvidence）** に過ぎず、「発音が正しい証明」（Level 3）としては扱わない。最終判定は常にユーザー自身の自己評価（Level 1）に委ねる。
- PC常駐を前提にしない。ChatGPT Custom GPT Actions（REST）は音声ストリームの録音・再生を扱えないため、シャドーイング機能は既存の `public/` Web UI（モバイルブラウザで完結する軽量SPA）側の機能として提供する。AIエージェント経由では「復習対象の選定」までを担い、実際の発話・録音・再生はWeb UIが担当する。

## 2. 最小体験のUI/データフロー

issueに記載の5ステップを、既存コンポーネント責務（Agent Adapter / Learning Service / Review Engine / Context Service / Web UI）に沿って分解する。

| # | ユーザー操作 | UI状態 | API呼び出し |
|---|---|---|---|
| 1 | シャドーイング対象を開く | 参照文・参照音声を表示し自動再生 | `GET /learning-examples?learning_item_id=` |
| 2 | 少し遅れて発話・録音 | 録音中インジケーター（MediaRecorder） | （クライアント側のみ、送信なし） |
| 3 | 録音停止 | 文字起こし中→差分表示 | `POST /shadowing-attempts`（音声または文字起こし結果を送信） |
| 4 | 「もう一度」「できた」「要復習」を選択 | ボタン3種 | 「もう一度」は3へ戻るのみ（送信なし）。「できた」「要復習」は5へ |
| 5 | 結果を反映 | 完了トースト、次の項目へ | 既存 `POST /review-results`（`recordReviewResult`）を再利用 |

ステップ1の「参照音声」はLearningItem登録時ではなく、例文保存時（後述のLearningExample作成時）に生成・添付する。既存のPhase 0登録フロー（`add_learning_item`）は変更しない。

## 3. データモデル

### 3.1 既存モデルとの関係

現状の`LearningItem`（`src/tools/addLearningItem.ts`）には例文を持続的に保持するフィールドがない（`note`は自由記述の補足であり、例文専用ではない）。企画書8.2で「LearningContext」として構想されていた概念が、Phase 0実装ではまだ切り出されていない。

`ReviewEvent`（`src/tools/recordReviewResult.ts`）はスキーマ変更なしで流用できる。既存の`reviewResults`（`correct` / `incorrect` / `partial` / `self_known`）、および任意項目`agent`・`quiz_type`が、シャドーイングの記録目的に過不足なく対応している。

### 3.2 新規: LearningExample（保存する例文）

「保存した例文」を`LearningItem`から独立したエンティティとして持つ（企画書8.2のLearningContextを、シャドーイングに必要な範囲へ縮小したもの）。1つのLearningItemに複数の例文を紐付けられる。

```ts
interface LearningExample {
  id: string;
  learning_item_id: string;
  user_id: string;
  source_text: string;              // 原文（例文）
  translation?: string | null;      // ユーザー母語訳（任意）
  reference_audio: {
    source: "tts" | "external_url" | "user_recorded";
    url?: string | null;            // Cloud Storage等のURL
    provider?: string | null;       // 例: "openai-tts", "google-tts"
    generated_by?: string | null;   // 生成に使ったAI/サービス名（出典追跡用）
  } | null;
  created_at: string;
  updated_at: string;
}
```

`reference_audio`がnullの例文は「テキストのみ登録済み、音声は未生成」を表す。音声生成はAPI呼び出し時ではなく、例文保存後の非同期ジョブ（または初回シャドーイング開始時のオンデマンド生成）とし、コストが発生するタイミングを明示的に分離する。

### 3.3 新規: ShadowingAttempt（1回の音読チャレンジの記録）

差分表示用の文字起こし結果と、どのASRを使ったかの出典を保持する。**これは正誤判定の記録ではない**（正誤判定は既存`ReviewEvent`が担う）。

```ts
interface ShadowingAttempt {
  id: string;
  learning_example_id: string;
  learning_item_id: string;
  user_id: string;
  attempted_at: string;
  transcript: string | null;          // ASRの文字起こし結果（取得できた場合のみ）
  transcript_provider: string | null; // 例: "web-speech-api", "openai-whisper"
  diff_summary: string | null;        // 原文との差分（表示用、参考情報である旨を必ず併記）
}
```

ユーザーが「できた」「要復習」を選んだ時点で、既存`recordReviewResult`を以下のマッピングで呼び出す（`ReviewEvent`のスキーマ変更は不要）。

| シャドーイングの選択 | `recordReviewResult`の`result` | `quiz_type` | `agent` |
|---|---|---|---|
| できた | `self_known` | `"shadowing"` | ASRプロバイダ名（利用した場合） |
| 要復習 | `incorrect` | `"shadowing"` | 同上 |
| もう一度 | （呼び出さない。3へ戻るのみ） | - | - |

`self_known`を採用する理由: このタスクは受動的な想起クイズではなく能動的な発話であり、正誤はASRではなくユーザー自身の自己評価に基づくため、既存の4値のうち「本人が知っている/できたと判断した」を表す`self_known`が最も意味的に近い。

### 3.4 Firestoreコレクション定義案

`src/db/firestore.ts`に以下を追加する。

```ts
export const LEARNING_EXAMPLES_COLLECTION = "learning_examples";
export const SHADOWING_ATTEMPTS_COLLECTION = "shadowing_attempts";
```

いずれも既存の`kartes.ts` / `addLearningItem.ts`と同様、`user_id`によるオーナーシップ検証（`assertKarteOwnedByUser`に相当する`assertLearningItemOwnedByUser`）を経由してアクセスする。

## 4. 音声生成・録音・文字起こしの候補比較

金額は公開情報からの概算であり、実装前にGCP/OpenAI等の公式料金ページで最終確認すること（現行CLAUDE.mdの費用確認ルールに従う）。

### 4.1 参照音声（TTS、例文の読み上げ生成）

| 候補 | 概算費用 | 備考 |
|---|---|---|
| Web Speech API（`SpeechSynthesisUtterance`、ブラウザ内蔵） | 0円 | 追加コストなし。声質・言語カバレッジが端末のOS/ブラウザ依存で不安定（特にiOS Safariの中国語音声の品質にばらつきがある想定） |
| OpenAI TTS (`tts-1`) | 目安 $15 / 100万文字 | 声質は安定。中国語含め多言語対応 |
| Google Cloud TTS（Standard） | 目安 $4 / 100万文字（WaveNetは$16） | GCPプロジェクトを既に利用中のため運用面での親和性は高い |

### 4.2 録音

| 候補 | 概算費用 | 備考 |
|---|---|---|
| ブラウザ`MediaRecorder` API | 0円 | 録音のみ。サーバー送信するかはSTT方式次第 |

録音は追加コストが発生しないため、方式選定の余地はほぼない。論点は「録音データをサーバーへ送るか（クラウドSTT利用時）」「ブラウザ内で完結させるか（Web Speech API利用時）」のみ。

### 4.3 文字起こし（STT、差分表示用）

| 候補 | 概算費用 | 備考 |
|---|---|---|
| Web Speech API (`SpeechRecognition`、ブラウザ内蔵) | 0円 | Chromeはサーバーサイド認識（オンライン必須）。iOS Safariの対応状況・言語カバレッジに制約がある想定で要実機確認 |
| OpenAI Whisper API | 目安 $0.006 / 分 | 多言語対応、精度は高い評価が一般的 |
| Google Cloud Speech-to-Text（Standard） | 目安 $0.016 / 15秒（月60分無料枠あり） | GCP運用との親和性 |

### 4.4 Phase 1推奨構成

「概算費用0円」原則を優先し、Phase 1の最小実装は **Web Speech API（TTS・STTともにブラウザ内蔵）** から開始することを推奨する。差分表示は「参考情報」であることが明示できれば、ブラウザ間の精度差はプロダクト上許容できる（5章の非保証設計と整合する）。

将来、ブラウザ非対応環境（iOS Safariでの認識精度不足等）が実際に問題になった場合に、OpenAI Whisper API等の従量課金クラウドSTTへの切り替えを検討する（コスト発生を伴う変更のため、切り替え時はユーザーへの費用概算提示が必要）。

## 5. AI評価の非保証表示とユーザー確認方法

- シャドーイング機能を初めて開く際に、非保証の説明（「音声認識は参考情報であり、発音の正しさを保証するものではありません」）を1回表示し、確認を求める（モーダルまたはインラインの同意チェック）。
- 確認状態はユーザー単位の設定として1回だけ保持する（`users`コレクションへ`shadowing_disclaimer_ack_at`のようなフラグを追加）。以降のセッションでは再表示しない。
- 差分表示のUI上には常に「参考情報」であることを示すラベルを併記し、正誤の最終判断は「できた/要復習」ボタンによるユーザー自身の自己評価であることを明確にする。

## 6. 未決事項・次のissue化候補

- `LearningExample`の作成経路（AIエージェントからの新規ツール`add_learning_example`を追加するか、既存`add_learning_item`の拡張とするか）は本issueのスコープ外。別issueで検討する。
- 参照音声の事前生成（例文保存時）かオンデマンド生成（初回再生時）かは、実際のTTS採用方式が決まってから確定する。
- Web Speech APIのモバイルブラウザ（特にiOS Safari）での対応状況は実機確認が必要。これはkobitoの自律作業対象外（実機確認を要するため）であり、実装issue化する際に人手での検証項目として明記する。
