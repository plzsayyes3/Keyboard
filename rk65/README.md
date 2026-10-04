# RK65 JIS Mapper

RK65 日本語配列向けの専用キーマッパーです。

## 現在の状態

- RK-R65 の候補プロファイル: VID `0x258A` / PID `0x01F7`
- 71キー分の物理位置と `bIndex` を保持
- JIS固有キーを明示
  - K67: ¥ / | → HID International3
  - K68: 無変換 → HID International5
  - K69: 変換 → HID International4
  - K70: かな → HID International2
- 通常のキー候補から割り当て可能
- macOS向け `かな = LANG1 (HID 0x90 / RK 0x9000)` と `英数 = LANG2 (HID 0x91 / RK 0x9100)` を割り当て可能
- RK firmware code を16進/10進で直接入力可能
- ブラウザ localStorage に編集状態を保存
- JSON import/export
- WebHIDで接続情報を取得
- legacy RK 9-report形式の送信データをプレビュー生成

## 本体への書き込み

Kludge Knight / Rangoli 系で使われているRK legacy keymap方式に合わせ、Feature Report `0x0A` を9本送る書き込み処理を実装しています。実機のRK R65 JP (`258A:01F7`) は別のBeiYing方式 (`0xFF00 / 0x0001`、Feature Report `0x06`) と判明しており、この書き込み条件を満たしません。

書き込みボタンは次の条件をすべて満たすまで無効です。

- VID `0x258A`
- PID `0x01F7`
- usagePage `0x0001` / usage `0x0080` のRK設定用HID interface
- Feature Report `0x0A`
- ブラウザ内で1キー以上変更済み
- 本体へ送る変更が `LANG1 / LANG2` のみ
- 「1キー変更でも全キーマップを書き込む」ことへの明示確認

### 重要な制約

RK公式Webアプリには、この個体のキー配列を読み取る処理があります。このマッパーでは、読み取り専用の診断結果をConsoleへ出す段階であり、既存の設定を編集画面へ取り込む機能はまだありません。

1キーだけ変更する場合でも、既定配列 + このブラウザで管理している変更を全キーマップとして送信します。そのため、RK公式ソフトなどで過去に設定した変更がブラウザ側に記録されていない場合、その変更は既定値へ戻る可能性があります。

現段階の本体書き込みは安全のため `かな / LANG1` と `英数 / LANG2` だけに制限しています。その他の割り当て候補やRAW codeはブラウザ内では編集できますが、本体へは送信しません。

最初の実機確認では、戻っても困らないキー1個に `かな / LANG1` または `英数 / LANG2` を割り当てて確認してください。

## 参照

候補プロファイルの物理位置・bIndexは、Kludge Knightに収録されているRK公式ソフト由来の `public/rk/Dev/01F7/KB.ini` を調査して作成しています。

USB HIDのJIS International key名称はQMKのBasic Keycodes / USB HID Usageに対応させています。

RK R65 JPの読み取り要求は[RK公式Webアプリ](https://drive.rkgaming.com/)の公開コードにある `getPassword` (`0x82`) と `getKeyMatrix` (`0x83`) を参照しています。診断はFeature Report `0x06` への要求と応答確認に限り、取得値を本体書き込みへ使いません。


## ガイド式キー検査モード

RK65側がすでにリマップ済みでも検査できるよう、入力コードから物理位置を逆引きしません。

1. 画面が「次に押す物理キー」を指定
2. 次に届いた `KeyboardEvent` を、その物理キーの実測値として保存
3. 既定値との一致 / 不一致 / 無反応を分けて記録
4. キーを離すと次の物理キーへ自動で進む

たとえば物理的な左Altが現在Metaへ書き換えられていても、

`physical: LAlt / expected: AltLeft / observed: MetaLeft / mismatch`

として正しく記録できます。

### 記録内容

- physicalKeyId / physicalLabel / bIndex
- 期待する `event.code`
- 既定のRK firmware code / VK
- 実測 `code / key / keyCode / location`
- Ctrl / Shift / Alt / Meta状態
- status: `match / mismatch / no-event / untested`

「反応なしで記録」も用意しており、macOSでKeyboardEvent自体が発生しないJISキーの確認にも使えます。

Fnは通常のブラウザKeyboardEventに単独では現れないことがあるため、物理キーガイドから分けて確認します。RK65接続後に「Fnの入力レポート読取を開始」を押し、Fnだけを押してから読取を終了すると、その間のWebHID `inputreport` と `KeyboardEvent` を読み取り専用で保存します。受信結果は検査JSONのK61に含まれます。レポートがなければ、Fnが独立したイベントを送っていない可能性があると記録します。

このFn確認自体は接続済みデバイスの `inputreport` を購読するだけで、デバイスへレポート送信は行いません。本体書き込みは右側の専用ボタンからのみ実行します。
