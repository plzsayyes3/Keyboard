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
- RK R65 JP BeiYing用のPython読み取り専用診断ツール

## 本体への書き込み

実機のRK R65 JP (`258A:01F7`) はBeiYing方式 (`0xFF00 / 0x0001`、Feature Report `0x06`) です。legacy形式のFeature Report `0x0A` を9本送る書き込み機能はこの実機ではロックされたままです。

現在は次の書き込み前確認まで実装しています。

1. Feature Report `0x06` で識別情報とレイヤー0のキー配列を診断読取する
2. 読み取った512バイトの応答をJSONファイルとしてバックアップする
3. 変換キー（slot 41）だけを `LANG1` または `LANG2` に変えた519バイトの送信候補をメモリ上で作り、変更前後を画面とConsoleで確認する

送信候補の504バイトの配列部分は、実機から読んだ配列のコピーを使います。候補プロファイルの既定値から全配列を再生成しません。今回の実機では数字列の12スロットが候補プロファイルと異なるため、既存設定の保持が重要です。候補の生成は変換キー1個、LANG1/LANG2のみ許可します。

**現段階ではBeiYingの書き込み要求を実機へ送信しません。** 送信と再読取による検証は次の実機確認段階です。バックアップを保存し、事前確認画面に `slot 41: 0x0000008A → 0x00000090`（LANG1の場合）と表示されることを先に確認してください。保存したバックアップは公開の場所にアップロードしないでください。

### Pythonで実機配列を読み取る

ブラウザを閉じてから、Python 3でHIDAPIを入れて読み取り専用プローブを実行します。

```sh
python3 -m pip install hidapi
python3 rk65/tools/beiying_read_probe.py
```

ツールは VID/PID と `usagePage 0xFF00 / usage 0x0001` が一致するHID interfaceだけを開き、`0x82` と `0x83` の読み取り要求を送り、応答をJSONへ保存します。書き込みコマンドは送信しません。既定では実行したディレクトリに時刻付きバックアップを作成します。別の場所へ保存する場合は `--output /path/to/backup.json` を指定します。

## 参照

候補プロファイルの物理位置・bIndexは、Kludge Knightに収録されているRK公式ソフト由来の `public/rk/Dev/01F7/KB.ini` を調査して作成しています。

USB HIDのJIS International key名称はQMKのBasic Keycodes / USB HID Usageに対応させています。

RK R65 JPの読み取り要求は[RK公式Webアプリ](https://drive.rkgaming.com/)の公開コードにある `getPassword` (`0x82`) と `getKeyMatrix` (`0x83`) を参照しています。書き込み候補は `setKeyMatrix` (`0x03`) の形式に合わせていますが、実機への送信は行いません。


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
