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
