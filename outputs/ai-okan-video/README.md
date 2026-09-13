# AIおかん 紹介動画

[紹介動画（MP4・53秒）](AI-okan-intro.mp4)

リポジトリのREADMEをもとに、AIおかんの目標達成支援を7場面で紹介します。1280×720、24fps、日本語女性ナレーション・字幕・オリジナルBGM付きです。

![プレビュー](poster.jpg)

- `script.json`: 各場面のテキスト、ナレーション、表示時間
- `storyboard.jpg`: 全場面の一覧
- `audio/0.aiff`〜`audio/6.aiff`: macOSのKyoko音声で生成したナレーション
- `render.py`: リポジトリ内のおかん画像と音声から動画を生成するスクリプト

再生成は、Pillow・NumPy・ffmpegとmacOSのヒラギノフォントがある環境で `python3 outputs/ai-okan-video/render.py` を実行してください。
