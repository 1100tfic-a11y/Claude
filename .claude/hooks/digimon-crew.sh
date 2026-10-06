#!/usr/bin/env bash
# デジモン・クルー（UserPromptSubmit 用）
# 毎ターン、作業中のデジモンのドット絵を表示するよう Claude に伝える。
# 環境変数 DIGIMON_CREW=off で無効化できる。
[ "${DIGIMON_CREW:-on}" = "off" ] && exit 0
cat >/dev/null
echo "【デジモン・クルー】この作業でも .claude/skills/digimon-crew/SKILL.md に従い、作業開始時と最終報告で、アグモンが作業している動くドット絵（images/custom/agumon.gif）を SendUserFile で表示すること（アグモンだけ・セリフ不要・デザインは指示なしに変えない・成果物には入れない）。"
