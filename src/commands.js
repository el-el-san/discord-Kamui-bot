const { SlashCommandBuilder } = require('discord.js');

/**
 * スラッシュコマンド定義
 */
const commands = [
  // /ask コマンド - Claude Code SDKに質問
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Claude Code SDKに質問します')
    .addStringOption(option =>
      option
        .setName('question')
        .setDescription('質問内容を入力してください')
        .setRequired(true)
        .setMaxLength(2000)
    ),

  // /reset コマンド - 会話履歴をリセット
  new SlashCommandBuilder()
    .setName('reset')
    .setDescription('会話履歴をリセットして新しい会話を開始します'),

  // /help コマンド - ヘルプ表示
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Kamui Botの使い方を表示します')
];

module.exports = commands;