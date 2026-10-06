#!/usr/bin/env bash
# デジモン・クルー演出フック
#   prompt : UserPromptSubmit 用。毎ターン、演出スキルを使うよう Claude に伝える
#   tool   : PreToolUse 用。ツールの種類に応じた担当キャラの一言を画面に表示する
# 環境変数 DIGIMON_CREW=off で無効化できる。
[ "${DIGIMON_CREW:-on}" = "off" ] && exit 0

mode="${1:-tool}"
input="$(cat)"

if [ "$mode" = "prompt" ]; then
  echo "【デジモン・クルー演出】この作業でも .claude/skills/digimon-crew/SKILL.md に従い、選ばれし子どもたちとパートナーデジモンが作業を分担している演出を短く入れ、作業開始時と最終報告では担当ペアの画像も SendUserFile で表示すること（成果物には入れない・事実は正確に）。"
  exit 0
fi

tool="$(printf '%s' "$input" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
cmd="$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"

pick() { local a=("$@"); printf '%s' "${a[$((RANDOM % ${#a[@]}))]}"; }

case "$tool" in
  Read|Grep|Glob|WebFetch|WebSearch)
    msg="$(pick \
      '💻 光子郎＆テントモン「解析を開始します」「まかしとき、調べまっせ！」' \
      '💻 テントモン「光子郎はん、データ見つけましたで！」' \
      '💻 光子郎「なるほど…この構造、興味深いですね」')" ;;
  Write)
    msg="$(pick \
      '🐺 ヤマト＆ガブモン「新しく作るぞ。任せろ」「ヤマト、いっしょにやろう！」' \
      '🌸 ミミ＆パルモン「かわいく仕上げちゃお♪」「ミミ、がんばって！」')" ;;
  Edit|MultiEdit|NotebookEdit)
    msg="$(pick \
      '🐺 ヤマト＆ガブモン「ここを直す。手早く行くぞ」' \
      '🌸 パルモン「ミミ、ここの形を整えよう！」' \
      '🦖 アグモン「太一、ここはボクがやるよ！」')" ;;
  Bash)
    case "$cmd" in
      *test*|*playwright*|*pytest*|*jest*|*vitest*|*lint*|*check*)
        msg="$(pick \
          '🦭 丈＆ゴマモン「念のため、テストしておこう…」「丈は心配性だなぁ〜」' \
          '🦭 丈「ちゃんと動くか確認するまで安心できないよ！」')" ;;
      git\ commit*|git\ push*|*"&& git commit"*|*"&& git push"*)
        msg="$(pick \
          '🐱 ヒカリ＆テイルモン「みんなの成果を届けよう」「了解、送り出すわ」' \
          '🐱 テイルモン「仕上げは任せて」')" ;;
      git*)
        msg='🐦 空＆ピヨモン「今の状態、ちゃんと見ておくね」' ;;
      *)
        msg="$(pick \
          '🦖 太一＆アグモン「よし、行くぞ！」「まかせて、太一！」' \
          '🦖 アグモン「ベビーフレイム！ コマンド実行だ！」')" ;;
    esac ;;
  Agent|Task)
    msg='🦖 太一「みんな、手分けして行くぞ！」' ;;
  *)
    msg='🦖 太一＆アグモン「次の作業、行ってみよう！」' ;;
esac

printf '{"systemMessage": "%s"}\n' "$msg"
exit 0
