// 自動承認の前段ルール判定。ここで NG なら LLM 判定に回さず flagged にする。
const EFFICACY = [
  /治(る|す|り|った)/, /完治/, /効(く|き目|いた)/, /改善(する|します|される)/, /解消(する|します|される)/,
  /眠れるようになる/, /ぐっすり眠れる/, /不安が(消え|なくな)/, /痩せ/, /若返/, /予防(する|できる|します)/,
  /医師(も|が)(推奨|おすすめ)/,
];
const SUPERLATIVE = [/最安/, /No\.?\s?1|ナンバーワン/i, /日本一|世界一/, /絶対/, /100\s?%/, /必ず/];
const FIRST_PERSON_EXPERIENCE = [/使ってみたら/, /使ってみた/, /使ったら/, /愛用/, /私(も|は).{0,12}(使|買|試)/, /買ってよかった/];

export function ruleCheck(text, { network, experienced }) {
  const issues = [];
  if (!/#PR$/.test(text.trim())) issues.push('末尾に #PR がありません');
  if (text.length > 500) issues.push(`500文字を超えています（${text.length}）`);
  for (const re of EFFICACY) if (re.test(text)) issues.push(`効能表現の疑い: ${text.match(re)[0]}`);
  for (const re of SUPERLATIVE) if (re.test(text)) issues.push(`最上級・断定表現: ${text.match(re)[0]}`);
  if (!experienced) {
    for (const re of FIRST_PERSON_EXPERIENCE) if (re.test(text)) issues.push(`未使用商品の体験表現: ${text.match(re)[0]}`);
  }
  if (network === 'amazon' && /[0-9０-９,，]+\s?円/.test(text)) issues.push('Amazon商品の価格に触れています');
  if (/https?:\/\//.test(text)) issues.push('本文にURLがあります（リンクは返信で付ける）');
  return issues;
}
