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
- RK firmware code を16進/10進で直接入力可能
- ブラウザ localStorage に編集状態を保存
- JSON import/export
- WebHIDで接続情報を取得
- legacy RK 9-report形式の送信データをプレビュー生成

## 安全ロック

ハードウェアへの書き込みはまだ無効です。

PID 01F7 は公式Web App `https://drive.rkgaming.com` の対応対象ですが、公式側で使う実際の書き込み方式が旧9-report方式と完全に一致するかは未確認です。実機のPID/HID interfaceと公式サイト側の通信を確認してから送信機能を解除します。

## 参照

候補プロファイルの物理位置・bIndexは、Kludge Knightに収録されているRK公式ソフト由来の `public/rk/Dev/01F7/KB.ini` を調査して作成しています。

USB HIDのJIS International key名称はQMKのBasic Keycodes / USB HID Usageに対応させています。


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

この確認は接続済みデバイスの `inputreport` を購読するだけです。デバイスへのレポート送信や設定変更は行いません。ハードウェア書き込みロックは維持されます。
