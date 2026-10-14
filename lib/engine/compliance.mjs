// 自動承認の前段ルール判定。ここで NG なら LLM 判定に回さず flagged にする。
const EFFICACY = [
  /治(る|す|り|った)/, /完治/, /効(く|き目|いた)/, /改善(する|します|される)/, /解消(する|します|される)/,
  /眠れるようになる/, /ぐっすり眠れる/, /不安が(消え|なくな)/, /痩せ/, /若返/, /予防(する|できる|します)/,
  /医師(も|が)(推奨|おすすめ)/,
];
const SUPERLATIVE = [/最安/, /No\.?\s?1|ナンバーワン/i, /日本一|世界一/, /絶対/, /100\s?%/, /必ず/];
const FIRST_PERSON_EXPERIENCE = [/使ってみたら/, /使ってみた/, /使ったら/, /愛用/, /私(も|は).{0,12}(使|買|試)/, /買ってよかった/];

// 高単価案件のカテゴリ別ルール（カテゴリ名に含まれる語で判定）
const CATEGORY_RULES = [
  { match: /退職代行/, patterns: [/交渉/, /有給.{0,6}(取れる|消化できる)/, /未払い.{0,6}(請求|取り戻)/], label: '退職代行で交渉・請求を謳う表現（弁護士・労組運営か確認）' },
  { match: /転職|キャリア/, patterns: [/年収.{0,8}(必ず|確実|絶対)/, /(必ず|確実に|絶対)\s?(内定|転職でき)/], label: '転職の成果を保証する表現' },
  { match: /婚活|結婚|マッチング/, patterns: [/(必ず|確実に|絶対)\s?(出会え|結婚でき|成婚)/], label: '婚活の成果を保証する表現' },
  { match: /カウンセリング|メンタル|コーチング/, patterns: [/治療/, /診断(する|します|できる)/, /薬(が|を).{0,6}(いらな|やめ)/, /うつ(病)?が(治|改善)/], label: '医療行為と誤認される表現' },
];

export function ruleCheck(text, { network, experienced, category = '' }) {
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
  if (network === 'asp' && /[0-9０-９,，]+\s?円/.test(text)) issues.push('高単価案件で料金・金額に触れています');
  // 出会い系サイト規制法: マッチングアプリの広告には18歳未満利用禁止の表示が必要
  if (/マッチング|出会い/.test(category) && !/18歳未満/.test(text)) issues.push('マッチングアプリの広告に「18歳未満は利用できません」の表示がありません');
  for (const rule of CATEGORY_RULES) {
    if (!rule.match.test(category)) continue;
    for (const re of rule.patterns) if (re.test(text)) issues.push(`${rule.label}: ${text.match(re)[0]}`);
  }
  return issues;
}
